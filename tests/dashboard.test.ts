import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import source from "../data/apac-dashboard.json";
import { entities } from "../lib/entities";
import { canView, canEdit, canPublish } from "../lib/permissions";
import {
  getDashboardSnapshot,
  defaultFilters,
  entityMetric,
} from "../lib/dashboard";
import { parseDashboardWorkbook } from "../lib/workbook-parser";
import { manualBatch } from "../lib/import-validation";
import type { Store, User, Snapshot, OrderBookLine } from "../lib/types";
const admin: User = {
  id: "test-admin",
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
  users: [admin],
  snapshots: source.snapshots as unknown as Snapshot[],
  lines: source.lines as OrderBookLine[],
  batches: [],
  audit: [],
};
const close = (a: number | null, b: number) =>
  assert.ok(a !== null && Math.abs(a - b) < 0.001, `${a} != ${b}`);
const input = () => ({
  entityId: "ddc",
  year: 2026,
  week: 37,
  month: 9,
  turnoverExternal: 100,
  turnoverGroup: 50,
  monthTurnoverExternal: 10,
  monthTurnoverGroup: 5,
  monthEstimateExternal: 30,
  monthEstimateGroup: 20,
  prospect: 10,
  nextProspect: 2,
  annualBudget: 200,
  nextAnnualBudget: 50,
  source: "Test source",
  lines: [
    {
      product: "Order",
      customer: "Customer",
      customerType: "External",
      total2026: 20,
      total2027: 40,
      monthly2026: Array.from({ length: 12 }, (_, i) => (i === 8 ? 20 : 0)),
      monthly2027: Array.from({ length: 12 }, (_, i) => (i === 0 ? 40 : 0)),
    },
  ],
});
test("source parser reads YTD instead of Synth MTD and skips empty future templates", () => {
  const p = parseDashboardWorkbook(
    fs.readFileSync("Dashboard/Dashboard 2026 - DEHK.xlsx"),
    "Dashboard 2026 - DEHK.xlsx",
  );
  assert.equal(p.snapshots.length, 36);
  const s = p.snapshots.at(-1)!;
  assert.equal(s.week, 36);
  close(s.turnover.external, 16792.738);
  close(s.monthTurnover.external, 308.88);
  assert.ok(p.lines.every((l) => l.sourceRow >= 24));
});
test("China hierarchy, missing budgets, and DCP mapping retain source limitations", () => {
  const d = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    scenario: "Sales",
  });
  assert.deepEqual(
    d.rows.map((r) => r.entity.code),
    ["DHK", "DCP", "DDC"],
  );
  close(d.totals.base, 33028.444 + 23642.9539 + 2961.9134);
  assert.equal(d.totals.coverage, null);
  assert.equal(d.totals.gap, null);
  assert.deepEqual(d.weeks, [35, 36]);
  const dcp = d.rows.find((r) => r.entity.id === "dcp")!;
  close(dcp.metrics.budget, 10627.065097208331);
  close(dcp.metrics.prospect, 271);
  assert.equal(dcp.metrics.sales, null);
});
test("entity matrix preserves differences and cumulative December matches annual base", () => {
  for (const id of ["dhk", "ddc", "dcp"]) {
    const d = getDashboardSnapshot(state, admin, {
      ...defaultFilters,
      entity: id,
      scenario: "Sales",
    });
    close(d.totals.cumulative[11].base, d.totals.base!);
  }
  const d = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    scenario: "Sales",
  });
  assert.notDeepEqual(d.rows[0].metrics.monthly, d.rows[1].metrics.monthly);
});
test("restricted editor cannot see or edit other accounts; cross-region view never grants edit", () => {
  const user: User = {
    ...admin,
    role: "editor",
    permissions: { dhk: ["view", "edit"] },
  };
  assert.equal(
    canEdit(
      user,
      entities.find((e) => e.id === "ddc")!,
    ),
    false,
  );
  assert.equal(
    canView(
      user,
      entities.find((e) => e.id === "ddc")!,
    ),
    false,
  );
  assert.equal(canPublish(user, entities[0]), false);
  const d = getDashboardSnapshot(state, user, defaultFilters);
  assert.deepEqual(
    d.entities.map((e) => e.id),
    ["dhk"],
  );
  assert.deepEqual(
    d.china.map((e) => e.entity.id),
    ["dhk"],
  );
  const cross = {
    ...user,
    role: "region_admin" as const,
    region: "Europe",
    crossRegionView: true,
  };
  assert.equal(canView(cross, entities[0]), true);
  assert.equal(canEdit(cross, entities[0]), false);
});
test("2027 and sales-type filters use source splits and cannot invent missing budgets", () => {
  const d = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    entity: "dhk",
    year: 2027,
    scenario: "Sales",
  });
  close(d.totals.base, 210);
  assert.equal(d.totals.budget, null);
  assert.equal(d.totals.remaining, null);
  const e = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    entity: "dhk",
    salesType: "external",
    scenario: "Sales",
  });
  close(e.totals.base, 24307.57);
  assert.equal(e.totals.coverage, null);
});
test("manual import preserves YTD/MTD, both order years, Prospect and source note", () => {
  const b = manualBatch(input(), admin),
    s = b.snapshots[0];
  close(s.turnover.external, 100);
  close(s.turnover.group, 50);
  close(s.monthTurnover.external, 10);
  close(s.nextOrderbook.external, 40);
  close(s.prospect, 10);
  assert.equal(s.sourceNote, "Test source");
  const m = entityMetric(s, defaultFilters);
  close(m.scenario, 180);
  close(m.coverage, 0.9);
  close(m.gap, 20);
  close(m.remaining, 35);
});
test("validation rejects nonfinite/fractional weeks, unknown entity and inconsistent allocation", () => {
  for (const patch of [
    { week: "abc" },
    { week: 1.5 },
    { entityId: "unknown" },
    { turnoverExternal: "Infinity" },
    { monthTurnoverExternal: 101 },
    { prospect: "NaN" },
  ])
    assert.throws(() => manualBatch({ ...input(), ...patch }, admin));
  const b = input();
  b.lines[0].total2026 = 21;
  assert.throws(() => manualBatch(b, admin));
});
test("publish requires permission and review, is idempotent and replaces same-grain revisions", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "diam-test-"));
  process.env.DIAM_DATA_PATH = path.join(dir, "state.json");
  const { repository } = await import("../lib/repository");
  const { storage } = await import("../lib/storage");
  const batch = manualBatch(input(), admin);
  await repository.createImportBatch(batch, admin);
  const editor = {
    ...admin,
    role: "editor" as const,
    permissions: { ddc: ["view", "edit"] as ("view" | "edit")[] },
  };
  await assert.rejects(repository.publishImportBatch(batch.id, editor, true));
  await assert.rejects(repository.publishImportBatch(batch.id, admin, false));
  await repository.publishImportBatch(batch.id, admin, true);
  await repository.publishImportBatch(batch.id, admin, true);
  let s = await storage.read();
  assert.equal(
    s.lines.filter((l) => l.entityId === "ddc" && l.week === 37).length,
    1,
  );
  assert.equal(s.revision, 2);
  const revision = manualBatch({ ...input(), prospect: 15 }, admin);
  await repository.createImportBatch(revision, admin);
  await repository.publishImportBatch(revision.id, admin, true);
  s = await storage.read();
  assert.equal(
    s.lines.filter((l) => l.entityId === "ddc" && l.week === 37).length,
    1,
  );
  close(
    s.snapshots.find((x) => x.entityId === "ddc" && x.week === 37)!.prospect,
    15,
  );
  assert.equal(s.batches.length, 2);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8")).revision,
    3,
  );
});

test("reporting regions select their BUs and APAC includes all six", () => {
  const expected: Record<string, string[]> = {
    APAC: ["DHK", "DCP", "DDC", "DSI", "DDI", "DDJ"],
    China: ["DHK", "DCP", "DDC"],
    Singapore: ["DSI"],
    India: ["DDI"],
    Japan: ["DDJ"],
  };
  for (const [region, codes] of Object.entries(expected)) {
    const d = getDashboardSnapshot(state, admin, {
      ...defaultFilters,
      region,
      bu: "all",
    });
    assert.deepEqual(
      d.rows.map((r) => r.entity.businessUnit),
      codes,
    );
    assert.deepEqual(
      d.buGroups.map((r) => r.name),
      codes,
    );
    assert.equal(d.china.length, 3);
    if (["Singapore", "India", "Japan"].includes(region))
      assert.equal(d.totals.base, null);
  }
  const d = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    region: "China",
    bu: "DCP",
  });
  assert.deepEqual(
    d.rows.map((r) => r.entity.id),
    ["dcp"],
  );
  const invalid = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    region: "Singapore",
    bu: "DHK",
  });
  assert.equal(invalid.rows.length, 0);
});
