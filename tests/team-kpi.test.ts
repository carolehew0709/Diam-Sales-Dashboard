import test from "node:test";
import assert from "node:assert/strict";
import {
  getDashboardSnapshot,
  defaultFilters,
  chinaStripAmount,
} from "../lib/dashboard";
import { emptySnapshot } from "../lib/workbook-parser";
import { monthlyPerformanceSeries } from "../lib/performance-chart";
import type { Store, User, OrderBookLine } from "../lib/types";
const admin = {
  id: "a",
  role: "superadmin",
  region: "APAC",
  permissions: {},
} as User;
function state(): Store {
  const snap = (id: string) => {
    const s = emptySnapshot(id, 2026, 43, 10, "weekly.xlsx", "W43");
    s.turnover = { external: 999, group: 999 };
    s.orderbook = { external: 2, group: 0 };
    s.monthlyOrderbook = {
      external: [...Array(10).fill(0), 2, 0],
      group: Array(12).fill(0),
    };
    return s;
  };
  const snapshots = ["dhk", "ddc", "dcp"].map(snap);
  const line = (entityId: string) =>
    ({
      id: entityId,
      entityId,
      year: 2026,
      week: 43,
      salesTeam: "BD",
      customer: "Client",
      product: "Brand",
      customerType: "External",
      total2026: 2,
      total2027: 0,
      monthly2026: [...Array(10).fill(0), 2, 0],
      monthly2027: Array(12).fill(0),
      sourceFile: "weekly.xlsx",
      sourceSheet: "W43",
      sourceRow: 24,
    }) as OrderBookLine;
  return {
    version: 2,
    revision: 1,
    users: [admin],
    snapshots,
    lines: snapshots.map((s) => line(s.entityId)),
    batches: [],
    audit: [],
    retainedTeamSource: {
      snapshots: structuredClone(snapshots),
      lines: snapshots.map((s) => line(s.entityId)),
      retainedAt: "x",
    },
    teamActualData: {
      year: 2026,
      month: 10,
      reportingWeek: 44,
      currency: "EUR",
      unit: "kEUR",
      sourceFile: "actual.xlsx",
      sourceSheet: "Sales Forecast",
      mappings: { BD: "Elly Team" },
      rows: [
        {
          entityId: "dhk",
          salesType: "external",
          team: "Elly Team",
          originalTeam: "BD",
          customer: "Client",
          monthly: [10, ...Array(8).fill(0), 20, null, null],
          ytd: 30,
          budget: 100,
          sourceRow: 4,
        },
        {
          entityId: "ddc",
          salesType: "group",
          team: "Elly Team",
          originalTeam: "BD",
          customer: "Internal",
          monthly: [999, ...Array(9).fill(0), null, null],
          ytd: 999,
          budget: 999,
          sourceRow: 5,
        },
      ],
    },
  };
}
test("global team KPI uses supplied YTD/budget and separately retained Prospect without uncovered Entity blocking", () => {
  const s = state(),
    before = JSON.stringify(s);
  const d = getDashboardSnapshot(s, admin, {
    ...defaultFilters,
    salesTeam: "Elly Team",
  });
  assert.deepEqual(
    d.rows.map((r) => r.entity.id),
    ["dhk", "ddc"],
  );
  assert.equal(d.totals.sales, 30);
  assert.equal(d.totals.budget, 100);
  assert.equal(d.totals.orderbook, 4);
  assert.equal(d.totals.base, 34);
  assert.equal(d.totals.coverage, 0.34);
  assert.equal(d.totals.gap, -66);
  assert.equal(d.totals.remaining, 0);
  assert.deepEqual(d.weeks, [44]);
  assert.deepEqual(d.graphics.teamSource?.weeks, [43]);
  assert.equal(d.graphics.teamKpiSource?.week, 44);
  assert.equal(d.graphics.series[0].points[9].ytd, 30);
  assert.equal(d.history[0].records.length, 0);
  assert.equal(JSON.stringify(s), before);
  const sales = getDashboardSnapshot(s, admin, {
    ...defaultFilters,
    salesTeam: "Elly Team",
    scenario: "Sales",
  });
  assert.equal(chinaStripAmount(sales.rows[0], sales.filters), 30);
});
test("team monthly curves follow actual Sales scenario and combined annual base, no monthly budget allocation", () => {
  const d = getDashboardSnapshot(state(), admin, {
    ...defaultFilters,
    salesTeam: "Elly Team",
  });
  const sales = monthlyPerformanceSeries(
    d.totals,
    "Sales",
    true,
  );
  assert.equal(sales.points[9].ytd, 30);
  assert.equal(sales.points[10].monthly, null);
  const combined = monthlyPerformanceSeries(
    d.totals,
    "Sales + Prospect",
    true,
  );
  assert.equal(combined.points[11].ytd, 34);
  assert.ok(d.totals.monthly.every((m) => m.budget === null));
});
test("selected Entity, source classifications, permissions and missing customer allocations stay bounded", () => {
  const s = state();
  const one = getDashboardSnapshot(
    s,
    { ...admin, role: "viewer", permissions: { dhk: ["view"] } } as User,
    { ...defaultFilters, salesTeam: "Elly Team" },
  );
  assert.equal(one.totals.base, 32);
  assert.equal(one.totals.sales, 30);
  assert.equal(one.totals.budget, 100);
  assert.deepEqual(
    one.rows.map((r) => r.entity.id),
    ["dhk"],
  );
  const india = getDashboardSnapshot(
    s,
    { ...admin, role: "viewer", permissions: { ddi: ["view"] } } as User,
    { ...defaultFilters, region: "India", salesTeam: "Elly Team" },
  );
  assert.equal(india.totals.sales, null);
  assert.equal(india.graphics.teamKpiSource, null);
  const customer = getDashboardSnapshot(s, admin, {
    ...defaultFilters,
    salesTeam: "Elly Team",
    customer: "Brand",
  });
  assert.equal(customer.totals.sales, null);
  assert.equal(customer.graphics.teamKpiSource, null);
  const future = getDashboardSnapshot(s, admin, {
    ...defaultFilters,
    salesTeam: "Elly Team",
    year: 2027,
  });
  assert.equal(future.totals.budget, null);
  assert.equal(future.graphics.teamKpiSource, null);
});
test("all-teams financials and historical snapshots remain independent of monthly team source", () => {
  const a = state(),
    b = structuredClone(a);
  delete b.teamActualData;
  const da = getDashboardSnapshot(a, admin, defaultFilters),
    db = getDashboardSnapshot(b, admin, defaultFilters);
  assert.deepEqual(da.totals, db.totals);
  assert.deepEqual(da.weeks, db.weeks);
  a.snapshots.push({ ...a.snapshots[0], week: 42 });
  a.lines.push({ ...a.lines[0], id: "old", week: 42 });
  const d = getDashboardSnapshot(a, admin, {
    ...defaultFilters,
    salesTeam: "Elly Team",
  });
  assert.equal(a.snapshots.find((s) => s.week === 42)!.turnover.external, 999);
  assert.equal(d.totals.sales, 30);
});
