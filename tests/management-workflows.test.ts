import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import source from "../data/apac-dashboard.json";
import { emptySnapshot, parseDashboardWorkbook } from "../lib/workbook-parser";
import {
  previewImport,
  publishReviewed,
  previewRestore,
  restoreReviewed,
  batchScopes,
} from "../lib/import-review";
import {
  resetAccountPassword,
  setAccountStatus,
  securityChanged,
  guardAdministrator,
} from "../lib/account-management";
import { verifyPassword } from "../lib/auth";
import { ensureGovernance } from "../lib/governance";
import {
  previewGovernance,
  commitGovernance,
} from "../lib/governance-management";
import { getDashboardSnapshot, defaultFilters } from "../lib/dashboard";
import { integerAxis } from "../lib/chart-axis";
import {
  identifyWorkbook,
  supplementMonthlyHistory,
} from "../lib/workbook-intake";
import type { ImportBatch, Store, User } from "../lib/types";
const admin: User = {
  id: "admin",
  name: "Admin",
  email: "admin@example.test",
  role: "superadmin",
  region: "APAC",
  crossRegionView: false,
  permissions: {},
  sessionVersion: 1,
};
function store(): Store {
  return {
    version: 2,
    revision: 1,
    users: [structuredClone(admin)],
    snapshots: [],
    lines: [],
    batches: [],
    audit: [],
  };
}
function snapshot(week: number, value = 10, year = 2026) {
  const s = emptySnapshot("ddi", year, week, 1, "synthetic.xlsx", `W${week}`);
  s.turnover = { external: value, group: 0 };
  s.orderbook = { external: 2, group: 0 };
  s.nextOrderbook = { external: 7, group: 0 };
  s.monthTurnover = { external: value, group: 0 };
  return s;
}
function batch(id: string, weeks: number[]): ImportBatch {
  return {
    id,
    fileName: "synthetic.xlsx",
    sourceType: "Excel",
    status: "review",
    entityIds: ["ddi"],
    submittedBy: admin.id,
    submittedAt: "2026-10-26",
    findings: [],
    snapshots: weeks.map((w) => snapshot(w)),
    lines: [],
    sheets: [],
  };
}
function publish(s: Store, b: ImportBatch) {
  const p = previewImport(s, b, batchScopes(b));
  return publishReviewed(s, b, admin, {
    ...p,
    reason: "Reviewed synthetic differences",
  });
}

test("password and status administration revoke sessions, preserve names, reject system identities and self-disable", () => {
  const s = store(),
    employee: User = {
      ...admin,
      id: "employee",
      role: "editor",
      permissions: { ddi: ["view", "edit"] },
    };
  s.users.push(employee);
  const phrase = "River-Mango-Cloud-72";
  resetAccountPassword(s, admin, employee.id, phrase, phrase);
  assert.equal(employee.sessionVersion, 2);
  assert.ok(verifyPassword(phrase, employee.passwordHash));
  assert.ok(!JSON.stringify(s.audit).includes(phrase));
  assert.equal(
    securityChanged(employee, { ...employee, name: "Renamed" }),
    false,
  );
  assert.equal(
    securityChanged(employee, { ...employee, permissions: { ddi: ["view"] } }),
    true,
  );
  assert.throws(() =>
    resetAccountPassword(s, employee, admin.id, phrase, phrase),
  );
  setAccountStatus(s, admin, employee.id, true);
  assert.equal(employee.sessionVersion, 3);
  setAccountStatus(s, admin, employee.id, false);
  assert.equal(employee.sessionVersion, 4);
  assert.ok(verifyPassword(phrase, employee.passwordHash));
  assert.throws(() => setAccountStatus(s, admin, admin.id, true));
  assert.throws(() =>
    guardAdministrator(s, { ...admin, id: "another" }, admin, {
      ...admin,
      role: "viewer",
    }),
  );
  s.users.push({ ...employee, id: "health", systemIdentity: "india-health" });
  assert.throws(() => resetAccountPassword(s, admin, "health", phrase, phrase));
  const result = resetAccountPassword(s, admin, admin.id, phrase, phrase);
  assert.equal(result.reauthenticate, true);
  assert.throws(() => setAccountStatus(s, admin, employee.id, true)); // stale administrator session
});
test("selection defaults include new and changed latest weeks, but not history or gaps", () => {
  const s = store(),
    b = batch("one", [1, 2, 3, 4]);
  s.snapshots = [snapshot(2, 9), snapshot(3, 9)];
  assert.deepEqual(previewImport(s, b).selectedScopes, [
    "sales:ddi:2026:3",
    "sales:ddi:2026:4",
  ]);
  assert.deepEqual(previewImport(store(), b).selectedScopes, batchScopes(b));
  s.snapshots = [snapshot(3)];
  assert.deepEqual(previewImport(s, b).selectedScopes, ["sales:ddi:2026:4"]);
});
test("publish protects review version, exact scope, unchanged retries, permissions and budget changes", () => {
  const s = store(),
    b = batch("one", [1, 2]);
  s.snapshots = [snapshot(1, 1)];
  s.batches.push(b);
  const p = previewImport(s, b, ["sales:ddi:2026:2"]);
  s.snapshots.push(snapshot(2, 3));
  assert.throws(() => publishReviewed(s, b, admin, p), /Refresh/);
  const next = previewImport(s, b, ["sales:ddi:2026:2"]);
  publishReviewed(s, b, admin, next);
  assert.equal(s.snapshots.find((v) => v.week === 1)?.turnover.external, 1);
  assert.equal(s.revision, 2);
  publishReviewed(s, b, admin, next);
  assert.equal(s.revision, 2);
  const repeat = batch("same", [2]);
  assert.equal(previewImport(s, repeat).selectedScopes.length, 0);
  const another = batch("third", [3]),
    before = previewImport(s, another);
  ensureGovernance(s);
  assert.throws(() => publishReviewed(s, another, admin, before), /Refresh/);
  assert.throws(
    () =>
      publishReviewed(
        s,
        another,
        { ...admin, role: "viewer" },
        previewImport(s, another),
      ),
    /not permitted/,
  );
});
test("restore is range-only, blocks later overlap and never restores accounts", () => {
  const s = store(),
    one = batch("one", [1]);
  s.batches.push(one);
  publish(s, one);
  const two = batch("two", [1]);
  two.snapshots[0].turnover.external = 20;
  s.batches.push(two);
  publish(s, two);
  assert.throws(() => previewRestore(s, one), /later publication/);
  s.users.push({ ...admin, id: "unrelated" });
  s.snapshots.push({ ...snapshot(8), entityId: "ddj" });
  restoreReviewed(
    s,
    two,
    admin,
    previewRestore(s, two).reviewVersion,
    "Correct mistaken source",
  );
  assert.equal(
    s.snapshots.find((v) => v.entityId === "ddi")?.turnover.external,
    10,
  );
  restoreReviewed(
    s,
    one,
    admin,
    previewRestore(s, one).reviewVersion,
    "Correct mistaken source",
  );
  assert.equal(s.snapshots.length, 1);
  assert.equal(s.users.length, 2);
  assert.throws(
    () =>
      previewRestore(s, {
        ...one,
        status: "published",
        publication: undefined,
      }),
    /no restorable/,
  );
});
test("migration preserves approved historical KPIs, including pending budgets and exact DCP correction expiry", () => {
  const raw: Store = {
    ...store(),
    snapshots: source.snapshots as Store["snapshots"],
    lines: source.lines as Store["lines"],
  };
  const migrated = ensureGovernance(structuredClone(raw));
  for (const year of [2026, 2027])
    for (const salesType of ["all", "external", "group"] as const) {
      const filters = { ...defaultFilters, year, salesType };
      const a = getDashboardSnapshot(raw, admin, filters),
        b = getDashboardSnapshot(migrated, admin, filters);
      for (const k of [
        "sales",
        "orderbook",
        "base",
        "budget",
        "coverage",
        "gap",
      ] as const)
        assert.equal(b.totals[k], a.totals[k], `${year} ${salesType} ${k}`);
    }
  const dcp = migrated.snapshots.find(
    (v) => v.entityId === "dcp" && v.week === 42,
  )!;
  migrated.snapshots = [{ ...dcp, week: 44 }];
  assert.equal(
    getDashboardSnapshot(migrated, admin, { ...defaultFilters, entity: "dcp" })
      .totals.sales,
    dcp.turnover.external,
  );
});
test("budget and correction approvals preview, preserve raw amounts and reject stale or invalid policy", () => {
  const s = ensureGovernance(store());
  s.snapshots = [snapshot(1)];
  const change = {
    kind: "budget" as const,
    entityId: "ddi",
    year: 2026,
    total: 200,
    external: null,
    group: null,
    reason: "Approved board budget",
  };
  const p = previewGovernance(s, admin, change);
  assert.equal(p.after.budget, 200);
  commitGovernance(s, admin, change, p.reviewVersion);
  assert.equal(
    getDashboardSnapshot(s, admin, {
      ...defaultFilters,
      region: "India",
      salesType: "external",
    }).totals.budget,
    null,
  );
  assert.throws(
    () => commitGovernance(s, admin, change, p.reviewVersion),
    /refresh/,
  );
  const correction = {
    kind: "correction" as const,
    entityId: "ddi",
    year: 2026,
    weeks: [1],
    salesType: "all",
    metric: "sales",
    value: 30,
    reason: "Approved source correction",
  };
  const q = previewGovernance(s, admin, correction);
  assert.equal(q.after.sales, 30);
  assert.deepEqual(q.after.monthly, q.before.monthly);
  commitGovernance(s, admin, correction, q.reviewVersion);
  assert.equal(s.snapshots[0].turnover.external, 10);
  assert.throws(
    () => previewGovernance(s, admin, { ...change, external: 1, group: 2 }),
    /matching/,
  );
});
test("actual fiscal-year source overrides previous outlook; permitted years never expose other entities", () => {
  const s = store();
  s.snapshots = [
    snapshot(52, 100, 2026),
    snapshot(1, 20, 2027),
    { ...snapshot(1, 99, 2030), entityId: "ddj" },
  ];
  const india = {
    ...admin,
    role: "viewer" as const,
    permissions: { ddi: ["view" as const] },
  };
  const view = getDashboardSnapshot(s, india, {
    ...defaultFilters,
    region: "India",
    year: 2027,
  });
  assert.equal(view.totals.sales, 20);
  assert.equal(view.totals.orderbook, 2);
  assert.equal(view.rows[0].snapshot?.year, 2027);
  assert.ok(!view.availableYears.includes(2030));
  const outlook = getDashboardSnapshot(s, india, {
    ...defaultFilters,
    region: "India",
    year: 2028,
  });
  assert.equal(outlook.totals.sales, 0);
  assert.equal(outlook.totals.orderbook, 7);
  assert.ok(outlook.checks.some((c) => c.message.includes("outlook")));
});
function workbook(year = 2028, missingCache = false, missingYear = false) {
  const ws = XLSX.utils.aoa_to_sheet([]);
  const values: Record<string, string | number> = {
    E2: "ENTITY NAME :",
    G2: "Diam India",
    G4: "W1",
    G6: "January",
    K16: `Total amount ${year}`,
    L16: `Total amount ${year + 1}`,
    H10: 10,
    H11: 0,
    H12: 10,
    J10: 10,
    J11: 0,
    L10: 10,
    L11: 0,
    K17: 2,
    K18: 0,
    L17: 0,
    L18: 0,
    E24: "Brand",
    F24: "External",
    G24: "Customer",
    K24: 2,
    L24: 0,
    N24: 2,
    J21: "OK",
  };
  for (const [address, v] of Object.entries(values))
    ws[address] = { t: typeof v === "number" ? "n" : "s", v };
  ws.K17.f = 'SUMIF(F24:F24,"External",K24:K24)';
  if (missingCache) delete ws.K17.v;
  if (missingYear) delete ws.K16;
  ws["!ref"] = "D1:AL24";
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, "W1");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
test("intake reads explicit fiscal years, retains zero allocations and blocks formula cache and ambiguous headers", () => {
  const p = parseDashboardWorkbook(workbook(), "weekly.xlsx");
  assert.equal(p.snapshots[0].year, 2028);
  assert.equal(p.lines[0].amountsByYear?.[2028].monthly[0], 2);
  assert.equal(p.lines[0].amountsByYear?.[2028].monthly[1], 0);
  assert.ok(
    parseDashboardWorkbook(workbook(2028, true), "weekly.xlsx").findings.some(
      (f) => f.severity === "error" && f.message.includes("cache"),
    ),
  );
  assert.ok(
    parseDashboardWorkbook(
      workbook(2028, false, true),
      "weekly.xlsx",
    ).findings.some((f) => f.severity === "error"),
  );
  assert.ok(
    parseDashboardWorkbook(workbook(), "2026.xlsx").findings.some(
      (f) => f.severity === "error",
    ),
  );
  const b = XLSX.read(workbook());
  XLSX.utils.book_append_sheet(
    b,
    XLSX.utils.aoa_to_sheet([[1]]),
    "DEHK OVERDUE",
  );
  assert.throws(
    () => identifyWorkbook(XLSX.write(b, { type: "buffer", bookType: "xlsx" })),
    /one supported/,
  );
});
test("historical source supplements missing months without changing previous records", () => {
  const a = snapshot(6, 30);
  a.month = 2;
  a.monthTurnover.external = 10;
  const b = snapshot(10, 60);
  b.month = 3;
  b.monthTurnover.external = 15;
  const before = JSON.stringify(a);
  supplementMonthlyHistory([b], [a]);
  assert.equal(b.monthlySales.external[0], 20);
  assert.equal(b.monthlySales.external[1], 25);
  assert.equal(JSON.stringify(a), before);
  assert.ok(b.sourceCells["history.external.1"]);
});
test("integer axes stay dynamic, nonduplicated and cover tiny, zero, mixed and large values without rounding source", () => {
  for (const values of [
    [0],
    [0.1, 0.2],
    [12.4, 15.1],
    [-0.4, 0.2],
    [-90, -4],
    [1e7, 8e7],
    [],
  ]) {
    const copy = [...values],
      a = integerAxis(values);
    assert.ok(a.ticks.every(Number.isInteger));
    assert.equal(new Set(a.ticks).size, a.ticks.length);
    assert.ok(a.min <= Math.min(0, ...values));
    assert.ok(a.max >= Math.max(0, ...values));
    assert.deepEqual(values, copy);
  }
  assert.notEqual(integerAxis([1, 2]).step, integerAxis([5000]).step);
});
