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

test("planning combo retains old monthly and cumulative numbers, gaps and supplied zero", () => {
  const m = getDashboardSnapshot(state, admin, defaultFilters).totals;
  const metrics = {
    ...m,
    monthly: m.monthly.map((r, i) => ({
      ...r,
      base: i + 1,
      scenario: i === 0 ? 0 : i === 1 ? 5 : null,
    })),
    cumulative: m.cumulative.map((r, i) => ({
      ...r,
      base: (i + 1) * 10,
      scenario: i === 0 ? 0 : i === 1 ? 5 : null,
    })),
  };
  const forecast = monthlyPerformanceSeries(metrics, "Sales + Prospect");
  assert.equal(forecast.key, "scenario");
  assert.equal(forecast.partial, true);
  assert.equal(forecast.points[0].monthly, 0);
  assert.equal(forecast.points[1].ytd, 5);
  assert.equal(forecast.points[2].monthly, null);
  assert.equal(forecast.points[2].ytd, null);
  const baseline = monthlyPerformanceSeries(metrics, "Sales");
  assert.equal(baseline.key, "base");
  assert.equal(baseline.partial, false);
  assert.equal(baseline.points[2].monthly, 3);
  assert.equal(baseline.points[2].ytd, 30);
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
    assert.deepEqual(
      view.points.map((p) => p.monthly),
      data.totals.monthly.map((m) => m[view.key]),
    );
    assert.deepEqual(
      view.points.map((p) => p.ytd),
      data.totals.cumulative.map((m) => m[view.key]),
    );
    if (filters.scenario === "Sales") assert.equal(view.key, "base");
    assert.ok(
      data.rows.every(
        (r) => filters.bu === "all" || r.entity.businessUnit === filters.bu,
      ),
    );
  }
  const china = getDashboardSnapshot(state, admin, defaultFilters);
  const view = monthlyPerformanceSeries(china.totals, "Sales + Prospect");
  assert.equal(view.key, "base");
  assert.equal(view.partial, true);
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

test("team scope never invents invoiced performance or leaks whole-BU figures", () => {
  const team = getDashboardSnapshot(state, admin, defaultFilters).salesTeams[0];
  assert.ok(team);
  const data = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    salesTeam: team,
  });
  assert.equal(data.totals.sales, null);
  const points = monthlyPerformanceSeries(data.totals, "Sales", team).points;
  assert.ok(points.every((p) => p.monthly === null && p.ytd === null));
  assert.ok(data.graphics.teams.every((r) => r.name === team));
});
