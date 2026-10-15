// Read-only smoke checks. Credentials stay on EC2 and are never printed.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(`${process.cwd()}/package.json`);
require('@next/env').loadEnvConfig(process.cwd());
const base = process.argv[2] || 'http://127.0.0.1:3000';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Health checks must use loopback');
const request = (route, options = {}) => fetch(base + route, { ...options, signal: AbortSignal.timeout(15000) });
try {
  const { Client } = require('pg');
  assert.ok(process.env.DATABASE_URL, 'PostgreSQL must be configured');
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try {
    await db.connect();
    await db.query('SELECT id FROM diam_dashboard_state LIMIT 1');
  } finally { await db.end(); }
  assert.equal((await request('/api/dashboard')).status, 401);
  for (const kind of ['ADMIN', 'INDIA']) {
    const email = process.env[`DIAM_${kind}_EMAIL`];
    const password = process.env[`DIAM_${kind}_PASSWORD`];
    if (kind === 'INDIA' && !email && !password) continue;
    assert.ok(email && password, `${kind} health credentials must be configured`);
    const login = await request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200, `${kind} login failed`);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie, 'Missing session cookie');
    const response = await request('/api/dashboard?region=India', { headers: { cookie } });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.storage.kind, 'postgres');
    assert.equal(result.storage.writable, true);
    if (kind === 'INDIA') {
      assert.deepEqual(result.data.entities.map(e => e.id), ['ddi']);
      assert.ok(result.data.rows.every(row => row.entity.id === 'ddi'));
      const china = await request('/api/dashboard?region=China', { headers: { cookie } });
      assert.equal(china.status, 200);
      const hidden = await china.json();
      assert.equal(hidden.data.rows.length, 0);
      assert.equal(hidden.data.china.length, 0);
      assert.equal((await request('/api/admin/users', { headers: { cookie } })).status, 403);
    }
    console.log(`${kind}: login, scoped data and PostgreSQL checks passed`);
  }
} catch (error) {
  console.error('Release health check failed:', error.code || error.message);
  process.exitCode = 1;
}
