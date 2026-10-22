import test from "node:test";
import assert from "node:assert/strict";
import {
  firstOpenMonth,
  performanceChartSeries,
} from "../lib/performance-chart";

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
