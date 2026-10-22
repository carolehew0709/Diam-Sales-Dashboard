import test from "node:test";
import assert from "node:assert/strict";
import { performanceChartSeries } from "../lib/performance-chart";

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
