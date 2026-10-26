import test from "node:test";
import assert from "node:assert/strict";
import {
  firstOpenMonth,
  performanceChartSeries,
  monthlyPerformanceSeries,
  teamMonthlyPerformance,
} from "../lib/performance-chart";
import type { Metric } from "../lib/dashboard";

test("local team trend sums delivery months and accumulates only the selected teams' OB", () => {
  const a = { monthly: [0, 12.25, -2, ...Array(9).fill(0)] };
  const b = { monthly: [1, 3, 0, ...Array(9).fill(0)] };
  const selected = teamMonthlyPerformance([a]);
  assert.deepEqual(selected.slice(0, 3), [
    { monthly: 0, ytd: 0 },
    { monthly: 12.25, ytd: 12.25 },
    { monthly: -2, ytd: 10.25 },
  ]);
  assert.equal(selected[11].ytd, 10.25);
  const all = teamMonthlyPerformance([a, b]);
  assert.equal(all[1].monthly, 15.25);
  assert.equal(all[11].ytd, 14.25);
  assert.equal(a.monthly[1], 12.25);
});

test("team trend preserves missing months, partial allocations and empty scopes instead of zero filling", () => {
  assert.ok(teamMonthlyPerformance([]).every((point) => point.monthly === null && point.ytd === null));
  const points = teamMonthlyPerformance([{ monthly: [0, 2, null, 3] }]);
  assert.deepEqual(points.slice(0, 4), [
    { monthly: 0, ytd: 0 },
    { monthly: 2, ytd: 2 },
    { monthly: null, ytd: null },
    { monthly: 3, ytd: null },
  ]);
  assert.equal(points[11].monthly, null);
});

test("team monthly OB is scenario independent and cumulative gaps remain missing", () => {
  const metrics = {
    monthly: [0, 12.25, null, 3].map((orderbook, i) => ({
      label: String(i),
      orderbook,
      base: 999,
      scenario: 1999,
    })),
    cumulative: [0, 0, 0, 0].map(() => ({ base: 999, scenario: 1999 })),
  } as Pick<Metric, "monthly" | "cumulative">;
  const view = monthlyPerformanceSeries(metrics, "Sales", "Team A");
  assert.deepEqual(
    view.points.map((p) => p.monthly),
    [0, 12.25, null, 3],
  );
  assert.deepEqual(
    view.points.map((p) => p.ytd),
    [0, 12.25, null, null],
  );
  assert.deepEqual(
    view,
    monthlyPerformanceSeries(metrics, "Sales + Prospect", "Team A"),
  );
});

test("current reporting month stays unfinished alongside future months", () => {
  assert.equal(firstOpenMonth(2026, [{ year: 2026, month: 10 }]), 9);
  assert.equal(firstOpenMonth(2026, [{ year: 2026, month: 1 }]), 0);
  assert.equal(firstOpenMonth(2026, [{ year: 2026, month: 12 }]), 11);
});

test("mixed reporting months use the earliest; future-year planning is entirely open", () => {
  const reports = [
    { year: 2026, month: 10 },
    { year: 2026, month: 9 },
  ];
  assert.equal(firstOpenMonth(2026, reports), 8);
  assert.equal(firstOpenMonth(2027, reports), 0);
  assert.equal(firstOpenMonth(2025, reports), 12);
});

test("missing or invalid reporting periods do not invent a completed-month cutoff", () => {
  for (const reports of [
    [],
    [undefined],
    [{ year: 2026, month: 10 }, undefined],
    [{ year: 2026, month: 0 }],
    [{ year: 2026, month: 13 }],
  ])
    assert.equal(firstOpenMonth(2026, reports), null);
});

test("empty scenarios are omitted without treating a real zero as missing", () => {
  assert.deepEqual(performanceChartSeries([{ base: 12, scenario: null }]), {
    keys: ["base"],
    scenario: "unavailable",
  });
  assert.deepEqual(performanceChartSeries([{ base: null, scenario: 0 }]), {
    keys: ["scenario"],
    scenario: "distinct",
  });
  assert.deepEqual(performanceChartSeries([{ base: null, scenario: null }]), {
    keys: [],
    scenario: "unavailable",
  });
});

test("identical series merge, including signed amounts, zeros and matching missing months", () => {
  assert.deepEqual(
    performanceChartSeries([
      { base: -4, scenario: -4 },
      { base: 0, scenario: 0 },
      { base: 12.3456789, scenario: 12.3456789 },
      { base: null, scenario: null },
    ]),
    { keys: ["base"], scenario: "same" },
  );
});

test("genuine differences and different source coverage keep separate series", () => {
  for (const rows of [
    [
      { base: 10, scenario: 10 },
      { base: 20, scenario: 20.00000001 },
    ],
    [
      { base: 10, scenario: 10 },
      { base: 20, scenario: null },
    ],
  ])
    assert.deepEqual(performanceChartSeries(rows), {
      keys: ["base", "scenario"],
      scenario: "distinct",
    });
});
