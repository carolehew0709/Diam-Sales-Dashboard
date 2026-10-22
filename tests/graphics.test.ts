import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import source from "../data/apac-dashboard.json";
import customerSeed from "../data/customer-analysis.json";
import { customerAnalysisView } from "../lib/customer-analysis";
import { parseCustomerAnalysisWorkbook } from "../lib/customer-analysis-parser";
import { getDashboardSnapshot, defaultFilters } from "../lib/dashboard";
import { wrapChartText } from "../lib/chart-export";
import { businessUnitShares } from "../lib/sales-graphics";
import type { CustomerAnalysis } from "../lib/graphics-types";
import type { Store, User, ImportBatch } from "../lib/types";

const admin: User = {
  id: "test",
  name: "Test",
  email: "test@example.com",
  role: "superadmin",
  region: "APAC",
  crossRegionView: false,
  permissions: {},
};
const analysis = customerSeed.analyses[0] as CustomerAnalysis;
const state: Store = {
  version: 2,
  revision: 1,
  users: [],
  snapshots: source.snapshots as Store["snapshots"],
  lines: source.lines as Store["lines"],
  batches: [],
  audit: [],
  customerAnalyses: [analysis],
};
const close = (value: number | null, expected: number) =>
  assert.ok(
    value !== null && Math.abs(value - expected) < 1e-6,
    `${value} != ${expected}`,
  );

test("BU shares use the complete filtered annual Sales + OB scope", () => {
  for (const filters of [
    defaultFilters,
    { ...defaultFilters, bu: "DCP" },
    { ...defaultFilters, salesType: "external" as const },
  ]) {
    const data = getDashboardSnapshot(state, admin, filters);
    const values = data.rows.map((r) => r.metrics.base);
    const shares = businessUnitShares(values);
    close(
      shares.reduce<number>((sum, share) => sum + share!, 0),
      1,
    );
    shares.forEach((share, i) => close(share, values[i]! / data.totals.base!));
    if (values.length === 1) assert.deepEqual(shares, [1]);
  }
});

test("BU shares preserve genuine zero and do not invent shares for incomplete or non-compositional totals", () => {
  assert.deepEqual(businessUnitShares([0, 20]), [0, 1]);
  for (const values of [
    [null, 20],
    [0, 0],
    [-10, 20],
    [NaN, 20],
    [Infinity, 20],
  ])
    assert.deepEqual(
      businessUnitShares(values),
      values.map(() => null),
    );
  assert.deepEqual(businessUnitShares([]), []);
});

test("monthly customer source preserves August totals without double-counting intergroup subtotal", () => {
  const view = customerAnalysisView(state, admin, defaultFilters);
  assert.deepEqual(view.months, ["2026-08"]);
  assert.equal(view.analysis?.sourceLabel, "Tiger Plan Aug data");
  assert.equal(
    analysis.breakdown.reduce((n, r) => n + r.values[3], 0),
    29182,
  );
  assert.equal(
    analysis.breakdown.reduce((n, r) => n + r.values[0], 0),
    41507,
  );
  assert.equal(
    analysis.customers.reduce((n, r) => n + r.current, 0),
    11923,
  );
  assert.equal(
    analysis.customers.reduce((n, r) => n + r.prior, 0),
    11873,
  );
  assert.equal(
    analysis.customers.find((c) => c.name === "Sephora")?.current,
    2875,
  );
});

test("aggregate customer records never leak to India, partial China permissions or incompatible filters", () => {
  for (const permissions of [
    { ddi: ["view"] },
    { dhk: ["view"], ddc: ["view"] },
    {},
  ]) {
    const user = { ...admin, role: "viewer", permissions } as User;
    const view = customerAnalysisView(state, user, defaultFilters);
    assert.equal(view.analysis, null);
    assert.deepEqual(view.months, []);
  }
  for (const patch of [
    { bu: "DCP" },
    { entity: "ddc" },
    { region: "India" },
    { salesTeam: "Team A" },
    { salesType: "external" },
    { year: 2027 },
  ]) {
    const view = customerAnalysisView(state, admin, {
      ...defaultFilters,
      ...patch,
    } as typeof defaultFilters);
    assert.equal(view.analysis, null);
    assert.deepEqual(view.months, []);
  }
  assert.equal(
    customerAnalysisView(state, admin, { ...defaultFilters, region: "APAC" })
      .analysis?.month,
    "2026-08",
  );
  assert.equal(
    customerAnalysisView(state, admin, defaultFilters, "2026-09").analysis,
    null,
  );
  assert.equal(
    customerAnalysisView(state, { ...admin, disabled: true }, defaultFilters)
      .analysis,
    null,
  );
});

test("customer month selector keeps monthly periods independent from weekly updates", () => {
  const next = {
    ...analysis,
    month: "2026-09",
    sourceLabel: "Tiger Plan Sep data",
  };
  const newer = { ...state, customerAnalyses: [analysis, next] };
  assert.equal(
    customerAnalysisView(newer, admin, defaultFilters).analysis?.month,
    "2026-09",
  );
  assert.equal(
    customerAnalysisView(newer, admin, defaultFilters, "2026-08").analysis
      ?.month,
    "2026-08",
  );
  assert.equal(
    customerAnalysisView({ ...state, snapshots: [] }, admin, defaultFilters)
      .analysis?.month,
    "2026-08",
  );
});

test("monthly sales use last weekly snapshots, corrected DCP YTD is never allocated to October", () => {
  const data = getDashboardSnapshot(state, admin, defaultFilters);
  const dehk = data.graphics.series.find((s) => s.id === "dhk")!;
  close(dehk.points[0].ytd, 6896.105);
  close(dehk.points[1].monthly, 8373.657 - 6896.105);
  assert.equal(dehk.points[9].week, 42);
  close(
    dehk.points[9].ytd,
    data.rows.find((r) => r.entity.id === "dhk")!.metrics.sales!,
  );
  assert.equal(dehk.points[10].ytd, null);
  assert.equal(dehk.points[11].monthly, null);
  const dcp = data.graphics.series.find((s) => s.id === "dcp")!;
  close(dcp.points[9].ytd, 260.81449);
  assert.equal(dcp.points[9].monthly, null);
  close(dcp.points[0].ytd, 172.34); // Group excluded by existing owner rules.
  close(data.graphics.series[0].points[9].ytd, data.totals.sales!);
  assert.equal(data.graphics.series[0].points[9].monthly, null);
});

test("sales graphics respect region, missing BU data, sales type and team scope", () => {
  const india = {
    ...admin,
    role: "viewer",
    permissions: { ddi: ["view"] },
  } as User;
  const data = getDashboardSnapshot(state, india, {
    ...defaultFilters,
    region: "India",
  });
  assert.deepEqual(
    data.graphics.series.map((s) => s.id),
    ["total", "ddi"],
  );
  const empty = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    region: "Japan",
  });
  assert.ok(
    empty.graphics.series.every((s) =>
      s.points.every((p) => p.ytd === null && p.monthly === null),
    ),
  );
  const external = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    bu: "DEHK",
    salesType: "external",
  });
  close(external.graphics.series[0].points[9].ytd, external.totals.sales!);
  const team = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    salesTeam: "__unassigned__",
  });
  assert.ok(
    team.graphics.series.every((s) => s.points.every((p) => p.ytd === null)),
  );
  const future = getDashboardSnapshot(state, admin, {
    ...defaultFilters,
    year: 2027,
  });
  assert.ok(
    future.graphics.series.every((s) =>
      s.points.every((p) => p.ytd === null && p.monthly === null),
    ),
  );
  const teamTotal = data.graphics.teams.reduce((n, r) => n + r.value, 0);
  assert.ok(teamTotal >= 0);
});

function customerWorkbook(patch?: (book: XLSX.WorkBook) => void) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([["SALES DATA VISUAL SYSTEM"]]),
    "Graphics",
  );
  const breakdown: unknown[][] = [
    ["Customer Breakdown"],
    ["Unit: K€", "", "", "Source: Tiger Plan Aug data"],
    [],
    ["", "Y25 Act", "Y25 YTD Act", "Y26 FCST", "Y26 YTD Act"],
  ];
  for (const r of analysis.breakdown)
    breakdown[r.sourceRow - 1] = [r.name, ...r.values];
  breakdown[6] = ["Intergroup", 21484, 14195, 13163, 13708];
  breakdown[10] = ["Grand Total", 41507, 29620, 33207, 29182];
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet(breakdown),
    analysis.breakdownSheet,
  );
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["Key Customer Contribution & Focus"],
      ["Unit: K€", "Source: Tiger Plan Aug data"],
      [],
      ["Client", "Y25 YTD Act", "Y26 YTD Act", "YoY Growth", "Status"],
      ...analysis.customers.map((c) => [
        c.name,
        c.prior,
        c.current,
        c.sourceGrowth,
        c.status,
      ]),
      ["TOTAL", 11873, 11923],
    ]),
    analysis.customerSheet,
  );
  patch?.(book);
  return Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}

test("monthly import reads source evidence and rejects missing amounts, inconsistent totals and mismatched periods", () => {
  const parsed = parseCustomerAnalysisWorkbook(
    customerWorkbook(),
    "Graphics.xlsx",
  )!;
  assert.equal(
    parsed.findings.some((f) => f.severity === "error"),
    false,
  );
  assert.equal(parsed.customerAnalysis.month, "2026-08");
  assert.equal(parsed.snapshots.length, 0);
  assert.equal(parsed.lines.length, 0);
  assert.equal(parsed.customerAnalysis.customers[4].name, "Coty");
  for (const patch of [
    (b: XLSX.WorkBook) => {
      delete b.Sheets[analysis.customerSheet].C5;
    },
    (b: XLSX.WorkBook) => {
      b.Sheets[analysis.breakdownSheet].E11.v = 1;
    },
    (b: XLSX.WorkBook) => {
      b.Sheets[analysis.breakdownSheet].D2.v = "Source: Tiger Plan Sep data";
    },
    (b: XLSX.WorkBook) => {
      b.Sheets[analysis.customerSheet].B2.v = "Source: Tiger Plan data";
    },
  ])
    assert.ok(
      parseCustomerAnalysisWorkbook(
        customerWorkbook(patch),
        "Graphics.xlsx",
      )!.findings.some((f) => f.severity === "error"),
    );
});

test("export metadata wraps Chinese and long source names without dropping characters", () => {
  for (const text of [
    "中国区客户来源月份为2026年8月".repeat(12),
    "Source: ".repeat(100),
  ]) {
    const lines = wrapChartText(text, 50);
    assert.equal(lines.join(""), text);
    assert.ok(lines.length > 1);
  }
});

test("monthly analyze/review/publish preserves weekly data, requires all China edit/publish scopes and persists month revisions", async (t) => {
  const previousPath = process.env.DIAM_DATA_PATH;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "diam-customer-test-"));
  process.env.DIAM_DATA_PATH = path.join(dir, "state.json");
  t.after(() => {
    if (previousPath === undefined) delete process.env.DIAM_DATA_PATH;
    else process.env.DIAM_DATA_PATH = previousPath;
  });
  fs.writeFileSync(process.env.DIAM_DATA_PATH, JSON.stringify(state));
  const { repository } = await import("../lib/repository");
  const parsed = parseCustomerAnalysisWorkbook(
    customerWorkbook(),
    "Graphics.xlsx",
  )!;
  const batch: ImportBatch = {
    id: "monthly-review",
    fileName: "Graphics.xlsx",
    sourceType: "Excel",
    status: "review",
    entityIds: ["dhk", "dcp", "ddc"],
    submittedBy: admin.id,
    submittedAt: new Date().toISOString(),
    ...parsed,
    customerAnalysis: {
      ...parsed.customerAnalysis,
      month: "2026-09",
      sourceLabel: "Tiger Plan Sep data",
    },
  };
  const partialEditor = {
    ...admin,
    role: "editor",
    permissions: { dhk: ["view", "edit"] },
  } as User;
  await assert.rejects(repository.createImportBatch(batch, partialEditor));
  await repository.createImportBatch(batch, admin);
  assert.equal((await repository.read()).customerAnalyses.length, 1); // Analyze never activates.
  const editor = {
    ...admin,
    role: "editor",
    permissions: {
      dhk: ["view", "edit"],
      dcp: ["view", "edit"],
      ddc: ["view", "edit"],
    },
  } as User;
  await assert.rejects(repository.publishImportBatch(batch.id, editor, true));
  await assert.rejects(repository.publishImportBatch(batch.id, admin, false));
  await repository.publishImportBatch(batch.id, admin, true);
  const published = await repository.read();
  assert.equal(published.customerAnalyses.length, 2);
  assert.deepEqual(published.snapshots, state.snapshots);
  assert.deepEqual(published.lines, state.lines);
  assert.equal(published.dataUpdatedAt, state.dataUpdatedAt);
  assert.equal(published.revision, 2);
  await repository.publishImportBatch(batch.id, admin, true);
  assert.equal((await repository.read()).revision, 2);
  await repository.createImportBatch(
    {
      ...batch,
      id: "monthly-revision",
      customerAnalysis: {
        ...batch.customerAnalysis!,
        sourceLabel: "Revised Sep source",
      },
    },
    admin,
  );
  await repository.publishImportBatch("monthly-revision", admin, true);
  const saved = JSON.parse(
    fs.readFileSync(process.env.DIAM_DATA_PATH, "utf8"),
  ) as Store;
  assert.equal(saved.customerAnalyses?.length, 2);
  assert.equal(
    saved.customerAnalyses?.find((r) => r.month === "2026-09")?.sourceLabel,
    "Revised Sep source",
  );
  assert.equal(saved.audit.at(-1)?.action, "publish");
});
