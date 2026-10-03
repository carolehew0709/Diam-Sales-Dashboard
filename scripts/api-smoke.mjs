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
assert.equal(d.data.rows[0].snapshot.week,40);
assert.equal(d.data.rows[0].snapshot.month,10);
assert.ok(Math.abs(d.data.totals.sales-200.091)<0.000001);
assert.ok(Math.abs(d.data.totals.orderbook-1.184)<0.000001);
assert.ok(Math.abs(d.data.totals.remaining-1.184)<0.000001);
assert.ok(d.data.totals.coverage === null);
const r = await fetch(base + "/api/export?entity=dcp", {
  headers: { cookie: admin },
});
assert.equal(r.status, 200);
const wb = XLSX.read(Buffer.from(await r.arrayBuffer()));
assert.equal(wb.SheetNames.length, 9);
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Executive Summary"], {
  header: 1,
});
assert.equal(rows[4][0], "DCP");
assert.ok(Math.abs(rows[4][6] - 201.275) < 0.001);
assert.ok(
  XLSX.utils
    .sheet_to_json(wb.Sheets["Weekly Review"], { header: 1 })
    .every((r, i) => !i || r[0] === "DCP"),
);
const exclusions = XLSX.utils.sheet_to_json(
  wb.Sheets["Intercompany Exclusions"],
  { header: 1 },
);
assert.equal(exclusions.length, 2);
assert.ok(
  Math.abs(exclusions[1][3] - 6.161) < 0.000001,
);
const detail = XLSX.utils.sheet_to_json(wb.Sheets["Orderbook Detail"], {
  header: 1,
});
assert.ok(detail.slice(1).every((row) => !["DEHK", "DDC"].includes(row[3])));
const ddc = await (
  await fetch(base + "/api/dashboard?entity=ddc&scenario=Sales", {
    headers: { cookie: admin },
  })
).json();
assert.ok(Math.abs(ddc.data.totals.base - 7158.8329) < 0.000001);
assert.ok(Math.abs(ddc.data.totals.remaining - 819.7699) < 0.000001);
assert.ok(
  Math.abs(ddc.data.totals.cumulative[11].base - ddc.data.totals.base) <
    0.000001,
);

assert.equal(ddc.data.rows[0].snapshot.week, 40);
assert.ok(Math.abs(ddc.data.totals.sales - 5136.274) < 0.000001);
assert.ok(Math.abs(ddc.data.totals.orderbook - 2022.5589) < 0.000001);
const ddcExport = await fetch(base + "/api/export?entity=ddc&scenario=Sales", {
  headers: { cookie: admin },
});
assert.equal(ddcExport.status, 200);
const dw = XLSX.read(Buffer.from(await ddcExport.arrayBuffer()));
const summary = XLSX.utils.sheet_to_json(dw.Sheets["Executive Summary"], {
  header: 1,
});
assert.ok(Math.abs(summary[4][4] - 7158.8329) < 0.000001);
assert.ok(Math.abs(summary[4][2] - 5136.274) < 0.000001);
assert.ok(Math.abs(summary[4][3] - 2022.5589) < 0.000001);
const excludedDDC = XLSX.utils.sheet_to_json(
  dw.Sheets["Intercompany Exclusions"],
  { header: 1 },
);
assert.ok(Math.abs(excludedDDC[1][3] - 2872.248) < 0.000001);
const next = await (
  await fetch(base + "/api/dashboard?entity=dhk&year=2027&scenario=Sales", {
    headers: { cookie: admin },
  })
).json();
assert.equal(next.data.totals.budget, 29014);
assert.equal(next.data.totals.orderbook, 2597);
assert.ok(next.data.totals.monthly.every((m) => m.orderbook === null));
const nextExport = await fetch(
  base + "/api/export?entity=dhk&year=2027&scenario=Sales",
  { headers: { cookie: admin } },
);
const nw = XLSX.read(Buffer.from(await nextExport.arrayBuffer()));
const ns = XLSX.utils.sheet_to_json(nw.Sheets["Executive Summary"], {
  header: 1,
});
assert.equal(ns[4][1], 29014);
assert.equal(ns[4][3], 2597);

for (const bu of ["DEHK", "DHK"]) {
  const res = await fetch(
    base + "/api/dashboard?bu=" + bu + "&scenario=Sales",
    { headers: { cookie: admin } },
  );
  const h = await res.json();
  assert.equal(h.data.rows.length, 1);
  assert.equal(h.data.rows[0].entity.code, "DEHK");
  assert.equal(h.data.rows[0].entity.businessUnit, "DEHK");
  assert.ok(Math.abs(h.data.totals.base - 32518.276) < 0.000001);
}
assert.equal(ns[4][0], "DEHK");

const annual=await(await fetch(base+"/api/dashboard?year=2027&region=APAC&scenario=Sales",{headers:{cookie:admin}})).json();
assert.equal(annual.data.totals.budget,35031);assert.equal(annual.data.totals.budgetComplete,false);
assert.equal(annual.data.totals.coverage,null);assert.equal(annual.data.totals.gap,null);
for(const id of ["dcp","dsi","ddi","ddj"]){const row=annual.data.rows.find(r=>r.entity.id===id);assert.equal(row.metrics.budget,0);assert.equal(row.metrics.budgetComplete,false);}
const ar=await fetch(base+"/api/export?year=2027&region=APAC&scenario=Sales",{headers:{cookie:admin}});
assert.equal(ar.status,200);const aw=XLSX.read(Buffer.from(await ar.arrayBuffer()));const as=XLSX.utils.sheet_to_json(aw.Sheets["Executive Summary"],{header:1});
assert.equal(as.find(r=>r[0]==="Selected total")[1],35031);
assert.ok(as.some(r=>String(r[0]).includes("pending FY2027 budgets displayed as 0")));
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
