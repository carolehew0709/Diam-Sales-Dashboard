// Installed outside release directories. Only outbound HTTPS access is required.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const repo = 'carolehew0709/Diam-Sales-Dashboard';
const root = '/home/ubuntu/diam-deploy';
const shared = '/home/ubuntu/diam-dashboard';
const current = `${root}/current`;
const shaPattern = /^[a-f0-9]{40}$/;

export function approvedRun(runs, sha) {
  if (!shaPattern.test(sha)) return false;
  const matching = runs.filter(run => run.head_sha === sha && run.head_branch === 'main' &&
    run.event === 'push' && run.path === '.github/workflows/ci.yml' &&
    run.repository?.full_name === repo);
  matching.sort((a, b) => b.id - a.id);
  return matching.length > 0 && matching[0].status === 'completed' && matching[0].conclusion === 'success';
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'], ...options });
    let output = '';
    if (child.stdout) child.stdout.on('data', b => { output += b; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(`${command} exited ${code}`)));
  });
}

async function mainSha() {
  const result = await run('git', ['ls-remote', `https://github.com/${repo}.git`, 'refs/heads/main'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const sha = result.split(/\s/)[0];
  if (!shaPattern.test(sha)) throw new Error('Invalid main commit');
  return sha;
}

async function checkCi(sha) {
  const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&per_page=20`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'diam-ec2-deployment' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`GitHub CI status HTTP ${response.status}; keeping current release`);
  return approvedRun((await response.json()).workflow_runs, sha);
}

async function switchTo(target) {
  const pending = `${root}/current.next`;
  await fs.rm(pending, { force: true });
  await fs.symlink(target, pending);
  await fs.rename(pending, current);
}

async function health(release, port) {
  await run(process.execPath, [`${release}/scripts/aws-release-health.mjs`, `http://127.0.0.1:${port}`], { cwd: release });
}

async function ready(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}`, { redirect: 'manual', signal: AbortSignal.timeout(1000) });
      if ([200, 307, 308].includes(r.status)) return;
    } catch { /* wait for Node startup */ }
    await delay(1000);
  }
  throw new Error(`Website on port ${port} did not start`);
}

export async function activateRelease({ candidate, previous, switchRelease, restart, verify }) {
  await switchRelease(candidate);
  try {
    await restart();
    await verify(candidate);
  } catch (error) {
    await switchRelease(previous);
    await restart();
    throw new Error(`New release failed; restored previous release: ${error.message}`);
  }
}

async function deploy() {
  const sha = await mainSha();
  const deployed = await fs.readFile(`${root}/deployed-sha`, 'utf8').catch(() => '');
  if (deployed.trim() === sha) return;
  if (!await checkCi(sha)) {
    console.log(`Waiting for successful CI on ${sha.slice(0, 12)}`);
    return;
  }
  const failed = await fs.readFile(`${root}/failed-sha`, 'utf8').catch(() => '');
  if (failed.trim() === sha) {
    console.log('This release previously failed on EC2; manual retry required');
    return;
  }
  const release = `${root}/releases/${sha}`;
  const archive = `${root}/${sha}.tar.gz`;
  let candidate;
  let candidateLog;
  try {
    // A previous interrupted attempt must not leave stale compiled files.
    await fs.rm(release, { recursive: true, force: true });
    await fs.mkdir(release, { recursive: true });
    await run('curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '120',
      `https://codeload.github.com/${repo}/tar.gz/${sha}`, '--output', archive]);
    await run('tar', ['-xzf', archive, '--strip-components=1', '-C', release]);
    for (const name of ['.env.local', 'certs']) {
      await fs.access(`${shared}/${name}`);
      // Never accept credentials from a repository release.
      try { await fs.lstat(`${release}/${name}`); throw new Error(`Archive contains protected ${name}`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      await fs.symlink(`${shared}/${name}`, `${release}/${name}`);
    }
    const env = { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`, NEXT_TELEMETRY_DISABLED: '1' };
    await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: release, env });
    await run('npm', ['run', 'build'], { cwd: release, env });
    candidateLog = await fs.open(`${root}/candidate.log`, 'w', 0o600);
    candidate = spawn(process.execPath, [`${release}/node_modules/next/dist/bin/next`, 'start', '-H', '127.0.0.1', '-p', '3001'], {
      cwd: release, env: { ...env, NODE_ENV: 'production' }, stdio: ['ignore', candidateLog.fd, candidateLog.fd],
    });
    candidate.on('error', () => {});
    await ready(3001);
    await health(release, 3001);
    candidate.kill('SIGTERM');
    await new Promise(resolve => candidate.once('close', resolve));
    candidate = undefined;
    // Skip releases superseded while we built, or whose CI was re-run and is no longer green.
    if (await mainSha() !== sha || !await checkCi(sha)) {
      console.log('Candidate superseded or CI no longer green; current release retained');
      return;
    }
    const previous = await fs.realpath(current);
    await activateRelease({
      candidate: release, previous,
      switchRelease: switchTo,
      restart: () => run('sudo', ['-n', 'systemctl', 'restart', 'diam-dashboard']),
      verify: async target => { await ready(3000); await health(target, 3000); },
    });
    await fs.writeFile(`${root}/previous-release`, previous + '\n', { mode: 0o600 });
    await fs.writeFile(`${root}/deployed-sha`, sha + '\n', { mode: 0o600 });
    await fs.rm(`${root}/failed-sha`, { force: true });
    console.log(`DEPLOYED ${sha}`);
    // Retain current and previous compiled releases for rollback. Shared secrets are outside this tree.
    for (const name of await fs.readdir(`${root}/releases`)) {
      if (!shaPattern.test(name)) continue;
      const old = `${root}/releases/${name}`;
      if (old !== release && old !== previous) await fs.rm(old, { recursive: true, force: true });
    }
  } catch (error) {
    await fs.writeFile(`${root}/failed-sha`, sha + '\n', { mode: 0o600 });
    throw error;
  } finally {
    if (candidate) candidate.kill('SIGTERM');
    if (candidateLog) await candidateLog.close();
    await fs.rm(archive, { force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  deploy().catch(error => { console.error(error.message); process.exitCode = 1; });
}
