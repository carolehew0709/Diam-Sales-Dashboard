import test from "node:test";
import assert from "node:assert/strict";
import { teamPerformanceSeries } from "../lib/team-performance";

const actuals = {
  month: 2,
  monthly: [10.25, 20, ...Array(10).fill(null)],
  groups: [{ entityIds: ["dhk", "ddc"] }],
};
const teams = [
  { monthly: [0, 2, 3, ...Array(9).fill(0)], entityIds: ["ddc", "dhk"] },
];

test("combined team planning carries completed actual YTD, never inventing future actuals", () => {
  const view = teamPerformanceSeries(actuals, teams);
  assert.equal(view.coverage, "same");
  assert.deepEqual(view.points[2], {
    sales: null,
    prospect: 3,
    cumulativeSales: null,
    cumulativeProspect: 5,
    cumulativeCombined: 35.25,
  });
  assert.equal(view.points[0].cumulativeCombined, 10.25);
  assert.equal(view.points[1].cumulativeCombined, 32.25);
  assert.equal(view.points[11].cumulativeCombined, 35.25);
  assert.equal(actuals.monthly[2], null);
});

test("a missing closed actual or Prospect allocation interrupts the combined cumulative line", () => {
  const missingSales = teamPerformanceSeries(
    { ...actuals, monthly: [10.25, null, ...Array(10).fill(null)] },
    teams,
  );
  assert.equal(missingSales.points[1].cumulativeCombined, null);
  assert.equal(missingSales.points[11].cumulativeCombined, null);
  const missingProspect = teamPerformanceSeries(actuals, [
    { ...teams[0], monthly: [0, null, 3, ...Array(9).fill(0)] },
  ]);
  assert.equal(missingProspect.points[1].cumulativeCombined, null);
  assert.equal(missingProspect.points[2].prospect, 3);
  assert.equal(missingProspect.points[2].cumulativeCombined, null);
});

test("unequal Entity coverage is explicit and known source amounts stay unchanged", () => {
  const view = teamPerformanceSeries(actuals, [
    ...teams,
    { monthly: Array(12).fill(1), entityIds: ["dcp"] },
  ]);
  assert.equal(view.coverage, "partial");
  assert.deepEqual(view.actualEntities, ["ddc", "dhk"]);
  assert.deepEqual(view.prospectEntities, ["dcp", "ddc", "dhk"]);
  assert.equal(view.points[0].sales, 10.25);
  assert.equal(view.points[0].prospect, 1);
  assert.equal(view.points[0].cumulativeCombined, 11.25);
});

test("unsupported actual sources keep Prospect independent and combined values absent", () => {
  const view = teamPerformanceSeries(null, teams);
  assert.equal(view.coverage, "unavailable");
  assert.equal(view.points[2].cumulativeProspect, 5);
  assert.ok(
    view.points.every((p) => p.sales === null && p.cumulativeCombined === null),
  );
  const empty = teamPerformanceSeries(actuals, []);
  assert.equal(empty.points[1].cumulativeSales, 30.25);
  assert.ok(
    empty.points.every(
      (p) => p.prospect === null && p.cumulativeCombined === null,
    ),
  );
});

test("credits, true zeros and decimal precision survive combined series", () => {
  const view = teamPerformanceSeries(
    { month: 2, monthly: [0, -2.125], groups: [{ entityIds: ["dhk"] }] },
    [{ monthly: [1.25, -0.5, ...Array(10).fill(0)], entityIds: ["dhk"] }],
  );
  assert.equal(view.points[0].sales, 0);
  assert.equal(view.points[1].sales, -2.125);
  assert.equal(view.points[1].cumulativeCombined, -1.375);
  assert.equal(view.points[2].cumulativeCombined, -1.375);
});
