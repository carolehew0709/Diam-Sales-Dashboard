import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { resolveEntity } from "../lib/entities";
import { parseDashboardWorkbook } from "../lib/workbook-parser";
import { defaultFilters, entityMetric, chinaStripAmount, getDashboardSnapshot } from "../lib/dashboard";
import { applyApprovedBudget, approvedAnnualBudget, pending2027Budgets } from "../lib/annual-budgets";
import type { Store, User } from "../lib/types";

// Synthetic source, no private Japanese customer/order data in Git.
function japanFixture() {
  const ws: XLSX.WorkSheet = {};
  const values: Record<string, string | number> = {
    E2: "ENTITY NAME :", G2: "Diam Japan", G4: "W43", G6: "October",
    H10: 100, H11: 5, H12: 105, J10: 2, J11: 1, L10: 12, L11: 3,
    K17: 10, K18: 2, L17: 3, L18: 0, W17: 10, W18: 2, AA17: 3, AA18: 0, J21: "OK",
    E24: "Test External", F24: "External", G24: "Synthetic customer A", K24: 10, L24: 3, W24: 10, AA24: 3,
    E25: "Test Group", F25: "Group", G25: "Synthetic customer B", K25: 2, L25: 0, W25: 2,
    E27: "Footer outside order range", G27: "Not an order", K27: 999,
  };
  for (const [address, value] of Object.entries(values)) ws[address] = { t: typeof value === "number" ? "n" : "s", v: value };
  ws.K17.f = 'SUMIF($F$24:$F$25,"External",$K$24:$K$25)';
  ws.K18.f = 'SUMIF($F$24:$F$25,"Group",$K$24:$K$25)';
  ws["!ref"] = "D1:AL27";
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, "W43");
  const future = XLSX.utils.aoa_to_sheet([]);
  Object.assign(future, { E2: { t: "s", v: "ENTITY NAME :" }, G2: { t: "s", v: "Diam Japan" }, G4: { t: "s", v: "W44" }, G6: { t: "s", v: "October" }, H12: { t: "n", v: 0 }, K17: { t: "n", v: 0 }, "!ref": "D1:AL27" });
  XLSX.utils.book_append_sheet(book, future, "W44");
  return parseDashboardWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), "Dashboard 2026_W43- DJP.xlsx");
}
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9);

test("Japan aliases resolve to DDJ; W43, Group invoicing and bounded order detail survive import", () => {
  for (const name of ["DJP", "Diam Japan", "DDJ", " diam japan "]) assert.equal(resolveEntity(name)?.id, "ddj");
  const parsed = japanFixture();
  assert.equal(parsed.snapshots.length, 1);assert.equal(parsed.lines.length, 2);
  assert.ok(!parsed.findings.some(f => f.severity === "error"));
  const s = parsed.snapshots[0];
  assert.equal(s.week, 43);assert.equal(s.asOfDate, "2026-10-23");assert.equal(s.entityId, "ddj");
  assert.equal(s.sourceCells.salesCardValue, "H12");assert.equal(s.sourceCells.orderDetail, "E24:AL25");
  const m = entityMetric(s, defaultFilters);
  close(m.sales, 105);close(m.orderbook, 12);close(m.base, 117);close(m.budget, 9700);
  close(chinaStripAmount({ snapshot: s, metrics: m }, { ...defaultFilters, scenario: "Sales" }), 105);
  close(entityMetric(s, { ...defaultFilters, salesType: "external" }).sales, 100);
  close(entityMetric(s, { ...defaultFilters, salesType: "group" }).sales, 5);
  assert.equal(s.prospect, null);assert.ok(parsed.lines.every(l => l.sourceRow <= 25));
});

test("Japan total-only budgets apply in both years without sales-type, monthly, team or inferred Prospect allocations", () => {
  const s = japanFixture().snapshots[0];
  assert.equal(s.annualBudget, 9700);assert.equal(s.nextAnnualBudget, 11000);assert.equal(pending2027Budgets.ddj, undefined);
  for (const [year, budget, base] of [[2026, 9700, 117], [2027, 11000, 3]] as const) {
    for (const scenario of ["Sales", "Sales + Prospect"] as const) {
      const m = entityMetric({ ...s, annualBudget: 999, nextAnnualBudget: 999 }, { ...defaultFilters, year, scenario });
      close(m.budget, budget);close(m.coverage, base / budget);close(m.gap, base - budget);assert.equal(m.budgetComplete, true);
      assert.ok(m.monthly.every(r => r.budget === null));assert.equal(m.prospect, null);
    }
    for (const salesType of ["external", "group"] as const) {
      assert.equal(approvedAnnualBudget("ddj", year, salesType), undefined);
      assert.equal(entityMetric(s, { ...defaultFilters, year, salesType }).budget, null);
    }
    const projected = applyApprovedBudget({ ...s, year });
    assert.ok(projected.sourceCells.budget.includes(`FY${year} Japan total only`));
    assert.ok(projected.monthlyBudget.every(v => v === null));
  }
  assert.equal(entityMetric({ ...s, teamScope: true, annualBudget: null, nextAnnualBudget: null }, defaultFilters).budget, null);
});

test("Japan records are available only inside account scopes and never leak into India", () => {
  const p = japanFixture();
  const state = { version: 2, revision: 0, snapshots: p.snapshots, lines: p.lines, users: [], batches: [], audit: [] } as Store;
  const admin = { id: "admin", role: "superadmin", region: "APAC", permissions: {} } as User;
  const jp = getDashboardSnapshot(state, admin, { ...defaultFilters, region: "Japan" });
  assert.deepEqual(jp.rows.map(r => r.entity.id), ["ddj"]);assert.deepEqual(jp.weeks, [43]);close(jp.totals.base, 117);
  const india = { ...admin, role: "editor", permissions: { ddi: ["view", "edit"] } } as User;
  const hidden = getDashboardSnapshot(state, india, { ...defaultFilters, region: "Japan" });
  assert.deepEqual(hidden.rows, []);assert.deepEqual(hidden.history, []);assert.equal(hidden.totals.base, null);
  assert.ok(!JSON.stringify(hidden).includes("Dashboard 2026_W43- DJP.xlsx"));
});
