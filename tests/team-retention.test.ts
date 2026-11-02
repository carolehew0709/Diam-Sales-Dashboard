import test from "node:test";
import assert from "node:assert/strict";
import { retainTeamSource } from "../lib/team-reporting";
import { getDashboardSnapshot, defaultFilters } from "../lib/dashboard";
import { emptySnapshot } from "../lib/workbook-parser";
import type { Store, User, OrderBookLine } from "../lib/types";
import { selectImportWeeks } from "../lib/import-scope";
const admin: User = {
  id: "test",
  name: "Test",
  email: "test@example.test",
  role: "superadmin",
  region: "APAC",
  crossRegionView: false,
  permissions: {},
};
function fixture(week: number, amount: number) {
  const s = emptySnapshot("dhk", 2026, week, 10, "synthetic.xlsx", `W${week}`);
  s.turnover = { external: amount * 10, group: 0 };
  s.orderbook = { external: amount, group: 0 };
  s.monthlyOrderbook = {
    external: Array.from({ length: 12 }, (_, i) => (i === 9 ? amount : 0)),
    group: Array(12).fill(0),
  };
  const l: OrderBookLine = {
    id: `test-${week}`,
    entityId: "dhk",
    year: 2026,
    week,
    product: "Client",
    customer: "Client",
    customerType: "External",
    salesTeam: "Prior team",
    dgc: "E",
    quantity: 1,
    total2026: amount,
    total2027: 0,
    monthly2026: s.monthlyOrderbook.external,
    monthly2027: Array(12).fill(0),
    sourceFile: s.sourceFile,
    sourceSheet: s.sourceSheet,
    sourceRow: 24,
  };
  return { s, l };
}
test("retained team charts preserve amounts, periods and source as other weekly sales advance", () => {
  const old = fixture(43, 10),
    next = fixture(44, 20);
  const state: Store = {
    version: 2,
    revision: 1,
    users: [admin],
    snapshots: [old.s],
    lines: [old.l],
    batches: [],
    audit: [],
  };
  const before = getDashboardSnapshot(state, admin, defaultFilters);
  retainTeamSource(state, "2026-11-02");
  const pinned = JSON.stringify(state.retainedTeamSource);
  state.snapshots.push(next.s);
  state.lines.push({ ...next.l, salesTeam: "Unverified new team" });
  const after = getDashboardSnapshot(state, admin, defaultFilters);
  assert.equal(after.totals.base, 220);
  assert.deepEqual(after.weeks, [44]);
  assert.deepEqual(after.graphics.teams, before.graphics.teams);
  assert.deepEqual(after.salesTeams, before.salesTeams);
  assert.deepEqual(after.graphics.teamSource?.weeks, [43]);
  assert.deepEqual(after.graphics.teamSource?.files, ["synthetic.xlsx"]);
  retainTeamSource(state, "later");
  assert.equal(JSON.stringify(state.retainedTeamSource), pinned);
  const team = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    salesTeam: "Prior team",
  });
  assert.equal(team.totals.orderbook, 10);
  assert.deepEqual(team.weeks, [43]);
  assert.equal(next.s.orderbook.external, 20);
});
test("frozen team source remains within account, Entity, customer and sales-type scope", () => {
  const old = fixture(43, 10);
  const state: Store = {
    version: 2,
    revision: 1,
    users: [admin],
    snapshots: [old.s],
    lines: [old.l],
    batches: [],
    audit: [],
  };
  retainTeamSource(state, "now");
  const india: User = {
    ...admin,
    role: "viewer",
    permissions: { ddi: ["view"] },
  };
  const hidden = getDashboardSnapshot(state, india, {
    ...defaultFilters,
    region: "India",
  });
  assert.deepEqual(hidden.graphics.teams, []);
  assert.deepEqual(hidden.salesTeams, []);
  assert.deepEqual(hidden.graphics.teamSource?.files, []);
  const missing = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    customer: "Missing",
  });
  assert.deepEqual(missing.graphics.teams, []);
  const group = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    salesType: "group",
  });
  assert.deepEqual(group.graphics.teams, []);
  assert.deepEqual(state.retainedTeamSource?.lines, [old.l]);
});
test("explicit import week selection cannot overwrite historical weeks or select invalid/independent data", () => {
  const old = fixture(43, 10),
    next = fixture(44, 20),
    p = { snapshots: [old.s, next.s], lines: [old.l, next.l] };
  const scoped = selectImportWeeks(p, "44");
  assert.deepEqual(scoped.snapshots, [next.s]);
  assert.deepEqual(scoped.lines, [next.l]);
  assert.equal(p.snapshots.length, 2);
  assert.equal(selectImportWeeks(p, null), p);
  for (const bad of ["", "45", "44,44", "0", "54", "44,abc"])
    assert.throws(() => selectImportWeeks(p, bad));
  assert.throws(() => selectImportWeeks({ ...p, receivables: [] }, "44"));
});
