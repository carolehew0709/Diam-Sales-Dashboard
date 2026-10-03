import {
  reportingState,
  isDuplicateIntercompanyOrder,
} from "../lib/intercompany";
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
  filtersFrom,
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
test("China uses fixed budgets and latest entity-specific operating sources", () => {
  const d = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    scenario: "Sales",
  });
  assert.deepEqual(
    d.rows.map((r) => r.entity.code),
    ["DEHK", "DCP", "DDC"],
  );
  close(d.totals.base, 32518.276 + 7158.8329 + 2620.651);
  close(d.totals.budget, 33207);
  close(d.totals.coverage, 42297.7599 / 33207);
  close(d.totals.gap, 33207 - 42297.7599);
  assert.deepEqual(d.weeks, [38, 40]);
  const dcp = d.rows.find((r) => r.entity.id === "dcp")!;
  close(dcp.metrics.budget, 2608);
  assert.equal(dcp.metrics.prospect, null);
  close(dcp.metrics.sales, 2620.651);
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
test("2027 uses supplied budgets and orderbook; sales-type budgets stay unknown", () => {
  const d = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    entity: "dhk",
    year: 2027,
    scenario: "Sales",
  });
  close(d.totals.base, 2597);
  close(d.totals.budget, 29014);
  close(d.totals.coverage, 2597 / 29014);
  assert.equal(d.totals.remaining, null);
  const e = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    entity: "dhk",
    salesType: "external",
    scenario: "Sales",
  });
  close(e.totals.base, 23538.598);
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
  close(m.scenario, 130);
  close(m.coverage, 130 / 5769);
  close(m.gap, 5769 - 130);
  close(m.remaining, 20);
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
    APAC: ["DEHK", "DCP", "DDC", "DSI", "DDI", "DDJ"],
    China: ["DEHK", "DCP", "DDC"],
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

test("W40 refresh reconciles metrics and fixed budgets ignore weekly overrides", () => {
  for (const [id, budget, base, remaining] of [
    ["dhk", 24830, 32518.276, 1983.186],
    ["ddc", 5769, 7158.8329, 819.7699],
  ] as const) {
    const d = getDashboardSnapshot(state, admin, {
      ...defaultFilters,
      entity: id,
      scenario: "Sales",
    });
    const s = d.rows[0].snapshot!;
    assert.equal(s.week, 40);
    close(d.totals.base, base);
    close(d.totals.remaining, remaining);
    close(d.totals.budget, budget);
    for (const week of [1, 20, 39, 52]) {
      const m = entityMetric(
        { ...s, week, annualBudget: 99999 },
        { ...defaultFilters, scenario: "Sales" },
      );
      close(m.budget, budget);
      assert.ok(m.monthly.every((x) => x.budget === null));
    }
  }
  const scenario = getDashboardSnapshot(state, admin, defaultFilters);
  close(scenario.totals.budget, 33207);
  assert.equal(scenario.totals.coverage, null); // Missing Prospect remains unknown.
  const all = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    region: "APAC",
  });
  assert.equal(all.totals.budget, null); // No invented DSI/DDI/DDJ budgets.
});

test("DCP W38 uses direct entity data and handles shifted used ranges", () => {
  const parsed = parseDashboardWorkbook(
    fs.readFileSync("Dashboard/W38-- Dashboard 2026 - DCP.xlsx"),
    "W38-- Dashboard 2026 - DCP.xlsx",
  );
  assert.equal(parsed.snapshots.length, 37);
  assert.equal(parsed.findings.filter((f) => f.severity === "error").length, 0);
  for (const week of [19, 20, 22]) {
    const s = parsed.snapshots.find((s) => s.week === week)!;
    assert.equal(s.entityId, "dcp");
    assert.equal(s.sourceCells.turnover, "H10:H11");
  }
  const s = parsed.snapshots.at(-1)!;
  assert.equal(s.week, 38);
  assert.equal(s.baseOverride, null);
  close(s.turnover.external, 199.275);
  close(s.turnover.group, 2421.376);
  const m = entityMetric(s, { ...defaultFilters, scenario: "Sales" });
  close(m.budget, 2608);
  close(m.base, 2622.104117529132);
  close(m.orderbook, 1.45311752913171);
  close(m.remaining, 1.45311752913171);
  close(m.coverage, 2622.104117529132 / 2608);
  assert.equal(s.prospect, null); // Never carry forward legacy PDA Prospect.
});

test("intercompany projection reconciles all metrics without modifying sources or double subtracting", () => {
  const before = JSON.stringify(state);
  const adjusted = reportingState(state);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(reportingState(adjusted).snapshots, adjusted.snapshots);
  for (const [id, base, remaining, removed] of [
    ["ddc", 7158.8329, 819.7699, 2872.248],
    ["dcp", 2620.651, 0, 1.45311752913171],
  ] as const) {
    const d = getDashboardSnapshot(state, admin, {
      ...defaultFilters,
      entity: id,
      scenario: "Sales",
    });
    close(d.totals.base, base);
    close(d.totals.remaining, remaining);
    close(d.totals.cumulative[11].base, base);
    close(d.totals.coverage, base / d.totals.budget!);
    close(d.totals.gap, d.totals.budget! - base);
    const s = d.rows[0].snapshot!;
    const gross = state.snapshots.find(
      (x) => x.entityId === id && x.week === s.week,
    )!;
    close(gross.orderbook.group! - s.orderbook.group!, removed);
    if (id === "ddc") {
      close(s.turnover.external, gross.turnover.external!);
      close(s.turnover.group, 0);
    } else assert.deepEqual(gross.turnover, s.turnover);
    assert.deepEqual(gross.monthTurnover, s.monthTurnover);
    close(s.monthlyOrderbook.group[s.month - 1], 0);
    assert.ok(
      !d.commercial.some((c) =>
        ["DEHK HK", "DEHK", "DDC"].includes(c.customer),
      ),
    );
    const external = getDashboardSnapshot(state, admin, {
      ...defaultFilters,
      entity: id,
      scenario: "Sales",
      salesType: "external",
    });
    close(
      external.totals.base,
      gross.turnover.external! + gross.orderbook.external!,
    );
  }
  const china = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    scenario: "Sales",
  });
  close(china.totals.base, 42297.7599);
  close(china.totals.remaining, 2802.9559);
});

test("intercompany rules match counterparties rather than row numbers or all Group sales", () => {
  const l = state.lines.find(
    (l) => l.entityId === "ddc" && l.week === 39 && l.sourceRow === 24,
  )!;
  assert.equal(
    isDuplicateIntercompanyOrder({
      ...l,
      sourceRow: 99,
      customer: " dehk hk ",
    }),
    true,
  );
  assert.equal(
    isDuplicateIntercompanyOrder({ ...l, customer: "Another group company" }),
    false,
  );
  assert.equal(
    isDuplicateIntercompanyOrder({
      ...l,
      customer: "DEHK HK",
      customerType: "External",
    }),
    false,
  );
  assert.equal(isDuplicateIntercompanyOrder({ ...l, entityId: "dhk" }), false);
  assert.equal(
    isDuplicateIntercompanyOrder({ ...l, entityId: "dcp", customer: "DDC" }),
    true,
  );
  const original = state.snapshots.find(
    (s) => s.entityId === "ddc" && s.week === 39,
  )!;
  const s = {
    ...original,
    nextOrderbook: { external: 0, group: 30 },
    nextMonthlyOrderbook: {
      external: Array(12).fill(0),
      group: [30, ...Array(11).fill(0)],
    },
  };
  const adjusted = reportingState({
    ...state,
    snapshots: [s],
    lines: [{ ...l, total2027: 25, monthly2027: [25, ...Array(11).fill(0)] }],
  });
  close(adjusted.snapshots[0].nextOrderbook.group, 5);
  close(adjusted.snapshots[0].nextMonthlyOrderbook.group[0], 5);
  assert.equal(adjusted.lines.length, 0);
});

test("FY2027 budgets and WK40 owner orderbook confirmation preserve source and missing allocations", () => {
  for (const [id, budget] of [
    ["dhk", 29014],
    ["ddc", 6017],
  ] as const) {
    const d = getDashboardSnapshot(state, admin, {
      ...defaultFilters,
      entity: id,
      year: 2027,
      scenario: "Sales",
    });
    close(d.totals.budget, budget);
    const s = d.rows[0].snapshot!;
    close(
      entityMetric(
        { ...s, nextAnnualBudget: 99999 },
        { ...defaultFilters, year: 2027 },
      ).budget,
      budget,
    );
    close(
      entityMetric(
        { ...s, year: 2027, annualBudget: 99999 },
        { ...defaultFilters, year: 2026 },
      ).budget,
      budget,
    );
  }
  const d = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    entity: "dhk",
    year: 2027,
    scenario: "Sales",
  });
  close(d.totals.orderbook, 2597);
  close(d.totals.gap, 29014 - 2597);
  assert.ok(
    d.totals.monthly.every((m) => m.base === null && m.budget === null),
  );
  const raw = state.snapshots.find(
    (s) => s.entityId === "dhk" && s.week === 40,
  )!;
  close(raw.nextOrderbook.external! + raw.nextOrderbook.group!, 2579.224);
  assert.equal(raw.nextOrderbookOverride, undefined);
  assert.ok(
    d.rows[0].snapshot!.sourceCells.nextOrderbookOverride.includes("17.776"),
  );
  const previous = state.snapshots.find(
    (s) => s.entityId === "dhk" && s.week === 39,
  )!;
  close(
    entityMetric(previous, { ...defaultFilters, year: 2027, scenario: "Sales" })
      .orderbook,
    601.224,
  );
  const china = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    year: 2027,
    scenario: "Sales",
  });
  assert.equal(china.totals.budget, null); // DCP FY2027 remains unprovided.
});

test("DEHK display code and legacy BU filters preserve entity identity and reconciliation", () => {
  const f = filtersFrom(
    new URL("http://localhost/api/dashboard?bu=DHK&scenario=Sales"),
  );
  assert.equal(f.bu, "DEHK");
  for (const bu of ["DEHK", "DHK"]) {
    const d = getDashboardSnapshot(state, admin, {
      ...defaultFilters,
      bu,
      scenario: "Sales",
    });
    assert.equal(d.rows.length, 1);
    assert.equal(d.rows[0].entity.id, "dhk");
    assert.equal(d.rows[0].entity.code, "DEHK");
    assert.equal(d.rows[0].entity.businessUnit, "DEHK");
    close(d.totals.sales, 26606.729);
    close(d.totals.orderbook, 5911.547);
    close(d.totals.base, 32518.276);
  }
  const china = getDashboardSnapshot(state, admin, defaultFilters);
  close(china.totals.sales, 34363.654);
  close(china.totals.orderbook, 7934.1059);
  close(china.totals.base, china.totals.sales! + china.totals.orderbook!);
  assert.equal(china.totals.scenarioComplete, false);
  assert.equal(china.totals.prospect, null);
});

test("DDC H10/O10 reporting preserves raw Group sources and other BUs", () => {
  const before = JSON.stringify(state);
  const d = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    entity: "ddc",
    scenario: "Sales",
  });
  close(d.totals.sales, 5136.274);
  close(d.totals.orderbook, 2022.5589);
  close(d.totals.base, 7158.8329);
  assert.equal(d.rows[0].snapshot!.sourceCells.ddcAnnualTotal, "O10");
  const raw = state.snapshots.find(
    (s) => s.entityId === "ddc" && s.week === 40,
  )!;
  close(raw.turnover.group, 15485.638);
  close(raw.ddcAnnualTotal!, 7158.8329);
  close(d.totals.cumulative[11].base, 7158.8329);
  const adjusted = reportingState(state);
  assert.deepEqual(reportingState(adjusted).snapshots, adjusted.snapshots);
  assert.equal(JSON.stringify(state), before);
  for (const s of state.snapshots.filter((s) => s.entityId === "ddc")) {
    const h = getDashboardSnapshot(
      {
        ...state,
        snapshots: [s],
        lines: state.lines.filter(
          (l) => l.entityId === "ddc" && l.week === s.week,
        ),
      },
      admin,
      { ...defaultFilters, entity: "ddc", scenario: "Sales" },
    );
    close(h.totals.sales, s.turnover.external!);
    close(h.totals.base, s.ddcAnnualTotal!);
  }
  close(
    getDashboardSnapshot(state, admin, {
      ...defaultFilters,
      entity: "dhk",
      scenario: "Sales",
    }).totals.base,
    32518.276,
  );
  close(
    getDashboardSnapshot(state, admin, {
      ...defaultFilters,
      entity: "dcp",
      scenario: "Sales",
    }).totals.base,
    2620.651,
  );
});
