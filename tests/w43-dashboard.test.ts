import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import source from "../data/apac-dashboard.json";
import { applyReportingOverrides } from "../lib/reporting-overrides";
import { parseDashboardWorkbook } from "../lib/workbook-parser";
import { getDashboardSnapshot, defaultFilters, entityMetric, chinaStripAmount } from "../lib/dashboard";
import type { Snapshot, Store, User } from "../lib/types";
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-8);

test("owner W43 DCP correction preserves raw invoices and monthly values, expires before W44 and does not enter team metrics", () => {
  const raw = { ...source.snapshots.find(s => s.entityId === "dcp" && s.week === 42)!, week: 43 } as unknown as Snapshot;
  const before = JSON.stringify(raw);
  for (const salesType of ["all", "external"] as const) {
    const projected = applyReportingOverrides(raw, salesType), m = entityMetric(raw, { ...defaultFilters, salesType });
    close(m.sales, 260.81449);close(m.orderbook, 1.184);close(m.base, 261.99849);
    close(chinaStripAmount({ snapshot: projected, metrics: m }, { ...defaultFilters, salesType, scenario: "Sales" }), 260.81449);
    assert.ok(projected.sourceCells.dcpYtdSales.includes("2026-10-24"));assert.ok(projected.sourceCells.dcpYtdSales.includes("W43"));
    assert.deepEqual(projected.monthlySales.external, raw.monthlySales.external);assert.deepEqual(projected.monthTurnover.external, raw.monthTurnover.external);
  }
  close(entityMetric({ ...raw, week: 44 }, defaultFilters).sales, 200.091);
  assert.deepEqual(applyReportingOverrides({ ...raw, year: 2027 }).turnover, raw.turnover);
  const team = { ...raw, teamScope: true, turnover: { external: null, group: null }, annualBudget: null };
  assert.equal(entityMetric(team, defaultFilters).sales, null);assert.equal(entityMetric(team, defaultFilters).budget, null);
  assert.equal(JSON.stringify(raw), before);
});

test("W43 parser reads the first table column (Excel D) as team and scoped OB reconciles without invented invoices", () => {
  const ws: XLSX.WorkSheet = {};
  const values: Record<string, string | number> = {
    E2: "ENTITY NAME :", G2: "DE HONG KONG", G4: "W43", G6: "October", H10: 100, H11: 5, H12: 105,
    J10: 2, J11: 1, L10: 12, L11: 3, K17: 10, K18: 2, L17: 0, L18: 0, J21: "OK",
    D24: "  Coty\nTeam ", E24: "Synthetic order A", F24: "External", G24: "Synthetic customer A", K24: 10, W24: 10,
    D25: "BD", E25: "Synthetic order B", F25: "Group", G25: "Synthetic customer B", K25: 2, W25: 2,
    D26: "X", E26: "Synthetic order C", F26: "External", G26: "Synthetic customer C", K26: 0,
  };
  for (const [address, value] of Object.entries(values)) ws[address] = { t: typeof value === "number" ? "n" : "s", v: value };
  ws.K17.f = 'SUMIF($F$24:$F$26,"External",$K$24:$K$26)';ws.K18.f = 'SUMIF($F$24:$F$26,"Group",$K$24:$K$26)';ws["!ref"] = "D1:AL26";
  const book = XLSX.utils.book_new();XLSX.utils.book_append_sheet(book, ws, "W43");
  const p = parseDashboardWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), "synthetic-2026.xlsx");
  assert.deepEqual(p.lines.map(l => l.salesTeam), ["Coty Team", "BD", ""]);
  const state = { version: 2, revision: 0, snapshots: p.snapshots, lines: p.lines, batches: [], audit: [], users: [] } as Store;
  const admin = { id: "admin", role: "superadmin", region: "APAC", permissions: {} } as User;
  const filters = { ...defaultFilters, bu: "DEHK" }, all = getDashboardSnapshot(state, admin, filters);
  assert.deepEqual(all.salesTeams, ["BD", "Coty Team", "__unassigned__"]);
  let total = 0;
  for (const salesTeam of all.salesTeams) { const d = getDashboardSnapshot(state, admin, { ...filters, salesTeam });total += d.totals.orderbook ?? 0;assert.equal(d.totals.sales, null);assert.equal(d.totals.budget, null);assert.equal(d.totals.coverage, null); }
  close(total, all.totals.orderbook!);close(getDashboardSnapshot(state, admin, { ...filters, salesTeam: "Coty Team" }).totals.orderbook, 10);
});
