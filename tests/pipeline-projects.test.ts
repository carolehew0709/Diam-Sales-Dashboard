import test from "node:test";
import assert from "node:assert/strict";
import {
  pipelineProjectMovement,
  projectPeriodRows,
  projectStatusTrend,
  projectTotals,
} from "../lib/pipeline-projects";
import type { Opportunity } from "../lib/pipeline";
const row = (id: string, patch: Partial<Opportunity> = {}): Opportunity => ({
  id,
  project: "P1",
  entityId: "dhk",
  created: "2026-10-01",
  decided: null,
  status: "active",
  stage: "quote",
  name: id,
  team: "Team",
  brand: "Brand",
  customerGroup: "Brand",
  customer: "Customer",
  currency: "EUR",
  amount: 1000,
  keyProject: false,
  sourceRow: 2,
  ...patch,
});
test("Project movements deduplicate Entity/project and use earliest creation without recounting added source rows", () => {
  const rows = [
    row("old"),
    row("late", { created: "2026-11-16", amount: 2000 }),
    row("other-entity", {
      entityId: "ddc",
      created: "2026-11-16",
      currency: "RMB",
      amount: 7700,
    }),
    row("loss", {
      project: "Lost",
      created: "2026-11-01",
      status: "lost",
      decided: "2026-11-16",
      amount: null,
    }),
    row("loss-copy", {
      project: "Lost",
      created: "2026-11-02",
      status: "lost",
      decided: "2026-11-16",
      amount: null,
    }),
    row("future", { project: "Future", created: "2026-11-17", amount: 99000 }),
  ];
  const m = pipelineProjectMovement(rows, "2026-11-16");
  assert.deepEqual(
    [m.ytdAdded, m.weekAdded, m.ytdLost, m.weekLost],
    [3, 1, 1, 1],
  );
  assert.deepEqual(m.income.weekAdded, { kEUR: 1, missing: 0 });
  assert.deepEqual(m.income.ytdAdded, { kEUR: 4, missing: 1 });
  assert.deepEqual(projectTotals(rows.slice(0, 2)), {
    projects: 1,
    kEUR: 3,
    missing: 0,
  });
  assert.deepEqual(
    projectPeriodRows(rows, rows, "2026-11-16", "weekly").map((r) => r.id),
    ["other-entity"],
  );
  assert.deepEqual(m.trend.at(-1), { week: "2026-11-16", added: 3, lost: 1 });
  assert.equal(
    pipelineProjectMovement([rows[1]], "2026-11-16", rows).weekAdded,
    0,
    "a dimension filter cannot recreate an existing project",
  );
});
test("Weekly and YTD status trends follow project creation cohorts and current stage while preserving missing amounts", () => {
  const rows = [
    row("a"),
    row("b", { created: "2026-11-16", project: "P2", amount: null }),
    row("won", {
      created: "2026-11-16",
      project: "P3",
      status: "won",
      stage: "complete",
    }),
  ];
  const weekly = projectStatusTrend(
    rows,
    rows,
    "2026-11-16",
    "weekly",
    ["active", "lost"],
    false,
  );
  assert.deepEqual(
    weekly.at(-1)!.values.map((v) => [v.key, v.projects, v.kEUR]),
    [
      ["active", 1, null],
      ["lost", 0, 0],
    ],
  );
  const ytd = projectStatusTrend(
    rows,
    rows,
    "2026-11-16",
    "ytd",
    ["active", "lost"],
    false,
  );
  assert.equal(ytd.at(-1)!.values[0].projects, 2);
  const stages = projectStatusTrend(
    rows,
    rows,
    "2026-11-16",
    "weekly",
    ["complete"],
    true,
  );
  assert.equal(
    stages.at(-1)!.values[0].projects,
    1,
    "ERP/OB filtering is explicitly deferred",
  );
});
