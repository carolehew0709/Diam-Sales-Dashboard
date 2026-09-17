import fs from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
const base = process.env.DIAM_TEST_URL ?? "http://127.0.0.1:3000";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Smoke tests run only against localhost");
const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const login = async (email, password) => {
  const r = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
};
for (const route of [
  "/api/dashboard",
  "/api/export",
  "/api/admin/users",
  "/api/import/batches",
])
  assert.equal((await fetch(base + route)).status, 401, route);
assert.equal(
  (
    await fetch(base + "/api/import/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
  ).status,
  401,
);
const admin = await login(env.DIAM_ADMIN_EMAIL, env.DIAM_ADMIN_PASSWORD);
const request = async (route, body, cookie = admin) => {
  const r = await fetch(base + route, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
};
assert.equal(
  (
    await request("/api/auth/login", {
      email: "unknown@example.com",
      password: "unknown",
    })
  ).status,
  401,
);
const csrf = await fetch(base + "/api/import/publish", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    cookie: admin,
    Origin: "https://untrusted.example",
  },
  body: "{}",
});
assert.equal(csrf.status, 403);
const userList = await (
  await fetch(base + "/api/admin/users", { headers: { cookie: admin } })
).json();
assert.ok(userList.users.every((u) => !("passwordHash" in u)));
const d = await (
  await fetch(base + "/api/dashboard?entity=dcp", {
    headers: { cookie: admin },
  })
).json();
assert.equal(d.data.rows.length, 1);
assert.equal(d.data.rows[0].entity.code, "DCP");
assert.ok(Math.abs(d.data.totals.coverage - 0.304215074475) < 0.00001);
const r = await fetch(base + "/api/export?entity=dcp", {
  headers: { cookie: admin },
});
assert.equal(r.status, 200);
const wb = XLSX.read(Buffer.from(await r.arrayBuffer()));
assert.equal(wb.SheetNames.length, 8);
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Executive Summary"], {
  header: 1,
});
assert.equal(rows[4][0], "DCP");
assert.ok(Math.abs(rows[4][6] - 3232.9134) < 0.001);
assert.ok(
  XLSX.utils
    .sheet_to_json(wb.Sheets["Weekly Review"], { header: 1 })
    .every((r, i) => !i || r[0] === "DCP"),
);
const testPassword = randomUUID();
const created = await request("/api/admin/users", {
  name: "API smoke viewer",
  email: `smoke-${randomUUID()}@diam.local`,
  password: testPassword,
  role: "viewer",
  region: "APAC",
  permissions: { dcp: ["view"] },
});
assert.equal(created.status, 200);
const testUser = created.data.user;
try {
  const cookie = await login(testUser.email, testPassword);
  const scoped = await (
    await fetch(base + "/api/dashboard", { headers: { cookie } })
  ).json();
  assert.deepEqual(
    scoped.data.entities.map((e) => e.id),
    ["dcp"],
  );
  assert.equal(
    (await fetch(base + "/api/admin/users", { headers: { cookie } })).status,
    403,
  );
  assert.equal((await request("/api/import/manual", {}, cookie)).status, 403);
  assert.equal(
    (
      await fetch(base + "/api/import/analyze", {
        method: "POST",
        headers: { cookie },
      })
    ).status,
    403,
  );
} finally {
  assert.equal(
    (await request("/api/admin/users", { ...testUser, disabled: true })).status,
    200,
  );
}
console.log(
  "API smoke checks passed: unauthenticated reads/writes blocked, CSRF blocked, no password hashes exposed, scoped DCP API/export match, viewer cannot administer or import.",
);
