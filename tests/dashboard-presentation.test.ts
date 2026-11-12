import test from "node:test";
import assert from "node:assert/strict";
import source from "../data/apac-dashboard.json";
import { defaultFilters, getDashboardSnapshot } from "../lib/dashboard";
import { monthlyPerformanceSeries } from "../lib/performance-chart";
import {
  dashboardFilterKey,
  showProspectForecast,
  customerAnalysisQuery,
} from "../lib/dashboard-presentation";
import type { Filters, Store, User } from "../lib/types";

const admin: User = {
  id: "test",
  name: "Test",
  email: "test@example.com",
  role: "superadmin",
  region: "APAC",
  crossRegionView: false,
  permissions: {},
};
const state: Store = {
  version: 2,
  revision: 1,
  users: [],
  snapshots: source.snapshots as Store["snapshots"],
  lines: source.lines as Store["lines"],
  batches: [],
  audit: [],
};

test("switching weekly scenario does not reload the independent monthly customer source", () => {
  const query = customerAnalysisQuery(defaultFilters, "2026-08");
  assert.equal(
    customerAnalysisQuery({ ...defaultFilters, scenario: "Sales" }, "2026-08"),
    query,
  );
  for (const patch of [
    { region: "India" },
    { bu: "DDC" },
    { entity: "ddc" },
    { year: 2027 },
    { salesType: "external" },
    { salesTeam: "Team A" },
  ] as Partial<Filters>[])
    assert.notEqual(
      customerAnalysisQuery({ ...defaultFilters, ...patch }, "2026-08"),
      query,
    );
  assert.notEqual(customerAnalysisQuery(defaultFilters, "2026-09"), query);
});

test("every global filter changes presentation identity; omitted team means all", () => {
  const initial = dashboardFilterKey(defaultFilters);
  for (const patch of [
    { region: "India" },
    { bu: "DDC" },
    { entity: "ddc" },
    { year: 2027 },
    { salesType: "external" },
    { scenario: "Sales" },
    { salesTeam: "Team A" },
  ] as Partial<Filters>[])
    assert.notEqual(
      dashboardFilterKey({ ...defaultFilters, ...patch }),
      initial,
    );
  assert.equal(
    dashboardFilterKey({ ...defaultFilters, salesTeam: undefined }),
    initial,
  );
});

test("forecast card appears only for a supplied, different Prospect result in that scenario", () => {
  const metrics = { base: 100, scenario: 100, prospect: null };
  assert.equal(showProspectForecast(defaultFilters, metrics), false);
  assert.equal(
    showProspectForecast(defaultFilters, { ...metrics, prospect: 0 }),
    false,
  );
  assert.equal(
    showProspectForecast(defaultFilters, { ...metrics, prospect: 5 }),
    false,
  );
  assert.equal(
    showProspectForecast(defaultFilters, {
      ...metrics,
      scenario: null,
      prospect: 5,
    }),
    false,
  );
  assert.equal(
    showProspectForecast(defaultFilters, {
      ...metrics,
      scenario: 105,
      prospect: 5,
    }),
    true,
  );
  assert.equal(
    showProspectForecast(defaultFilters, {
      ...metrics,
      scenario: 95,
      prospect: -5,
    }),
    true,
  );
  assert.equal(
    showProspectForecast(
      { scenario: "Sales" },
      { ...metrics, scenario: 105, prospect: 5 },
    ),
    false,
  );
});

test("trend scenarios select invoicing or invoicing plus committed Prospect independently of P1", () => {
  const m = getDashboardSnapshot(state, admin, defaultFilters).totals;
  const metrics = {
    ...m,
    monthly: m.monthly.map((r, i) => ({
      ...r,
      sales: i === 0 ? 0 : i === 1 ? 4 : null,
      base: i + 1,
      scenario: null,
    })),
    cumulative: m.cumulative.map((r, i) => ({
      ...r,
      sales: i === 0 ? 0 : i === 1 ? 4 : null,
      base: (i + 1) * 10,
      scenario: null,
    })),
  };
  const forecast = monthlyPerformanceSeries(metrics, "Sales + Prospect");
  assert.equal(forecast.key, "base");
  assert.equal(forecast.points[2].monthly, 3);
  assert.equal(forecast.points[2].ytd, 30);
  const baseline = monthlyPerformanceSeries(metrics, "Sales");
  assert.equal(baseline.key, "sales");
  assert.equal(baseline.points[0].monthly, 0);
  assert.equal(baseline.points[1].ytd, 4);
  assert.equal(baseline.points[2].monthly, null);
  assert.equal(baseline.points[2].ytd, null);
});

test("scope-linked main planning chart uses the same reviewed monthly metrics as the matrix", () => {
  for (const patch of [
    {},
    { bu: "DEHK" },
    { bu: "DCP", salesType: "external" },
    { bu: "DDC" },
    { entity: "dhk", salesType: "group" },
    { region: "India" },
    { year: 2027 },
    { scenario: "Sales" },
  ] as Partial<Filters>[]) {
    const filters = { ...defaultFilters, ...patch };
    const data = getDashboardSnapshot(state, admin, filters);
    const view = monthlyPerformanceSeries(data.totals, filters.scenario);
    assert.notEqual(view.key, "orderbook");
    if (view.key === "orderbook") throw new Error("Unexpected scoped Prospect");
    const key = view.key;
    assert.deepEqual(
      view.points.map((p) => p.monthly),
      data.totals.monthly.map((m) => m[key]),
    );
    assert.deepEqual(
      view.points.map((p) => p.ytd),
      data.totals.cumulative.map((m) => m[key]),
    );
    if (filters.scenario === "Sales") assert.equal(view.key, "sales");
    assert.ok(
      data.rows.every(
        (r) => filters.bu === "all" || r.entity.businessUnit === filters.bu,
      ),
    );
  }
  const china = getDashboardSnapshot(state, admin, defaultFilters);
  const view = monthlyPerformanceSeries(china.totals, "Sales + Prospect");
  assert.equal(view.key, "base");
  assert.equal(view.points[11].ytd, china.totals.base);
  // The retained invoices-only provenance series is not silently substituted for planning.
  assert.equal(china.graphics.series[0].points[11].monthly, null);
  assert.notEqual(view.points[11].monthly, null);
  const scoped = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    bu: "DDC",
  });
  assert.notDeepEqual(
    monthlyPerformanceSeries(scoped.totals, "Sales").points,
    view.points,
  );
});

test("team monthly chart shows only its source OB, without inventing invoiced performance", () => {
  const team = getDashboardSnapshot(state, admin, defaultFilters).salesTeams[0];
  assert.ok(team);
  const data = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    salesTeam: team,
  });
  assert.equal(data.totals.sales, null);
  const sales = monthlyPerformanceSeries(data.totals, "Sales", true);
  assert.ok(sales.points.every((point) => point.monthly === null && point.ytd === null));
  const points = monthlyPerformanceSeries(data.totals, "Sales + Prospect", true).points;
  assert.equal(data.totals.budget, null);
  assert.equal(data.totals.prospect, null);
  assert.deepEqual(
    points.map((p) => p.monthly),
    data.totals.monthly.map((m) => m.orderbook),
  );
  assert.ok(Math.abs(points[11].ytd! - data.totals.orderbook!) < 1e-6);
  assert.ok(data.graphics.teams.every((r) => r.name === team));
});
