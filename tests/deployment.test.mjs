import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedRun, activateRelease } from '../scripts/aws-auto-deploy.mjs';
const sha = 'a'.repeat(40);
const good = { id: 1, head_sha: sha, head_branch: 'main', event: 'push',
  path: '.github/workflows/ci.yml', repository: { full_name: 'carolehew0709/Diam-Sales-Dashboard' },
  status: 'completed', conclusion: 'success' };
test('production gate requires matching main push CI, rejects PRs and a newer failed rerun', () => {
  assert.equal(approvedRun([good], sha), true);
  for (const change of [{ head_sha: 'b'.repeat(40) }, { event: 'pull_request' },
    { head_branch: 'feature' }, { path: '.github/workflows/other.yml' },
    { repository: { full_name: 'someone/fork' } }, { conclusion: 'failure' }, { status: 'in_progress' }]) {
    assert.equal(approvedRun([{ ...good, ...change }], sha), false);
  }
  assert.equal(approvedRun([good, { ...good, id: 2, conclusion: 'failure' }], sha), false);
  assert.equal(approvedRun([], sha), false);
  assert.equal(approvedRun([good], '../bad'), false);
});
test('failed post-switch check restores previous release and restarts it', async () => {
  const calls = [];
  await assert.rejects(activateRelease({ candidate: 'new', previous: 'old',
    switchRelease: async value => calls.push(value), restart: async () => calls.push('restart'),
    verify: async () => { throw new Error('database unavailable'); },
  }), /restored previous/);
  assert.deepEqual(calls, ['new', 'restart', 'old', 'restart']);
});
test('healthy deployment stays on candidate', async () => {
  const calls = [];
  await activateRelease({ candidate: 'new', previous: 'old',
    switchRelease: async value => calls.push(value), restart: async () => calls.push('restart'),
    verify: async value => calls.push(`checked ${value}`),
  });
  assert.deepEqual(calls, ['new', 'restart', 'checked new']);
});
