import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import seed from "../data/apac-dashboard.json";
import { defaultFilters, getDashboardSnapshot } from "../lib/dashboard";
import {
  previewImport,
  previewRestore,
  publishReviewed,
  restoreReviewed,
} from "../lib/import-review";
import { parseMonthlySalesWorkbook } from "../lib/monthly-sales-parser";
import type { ImportBatch, Store, User } from "../lib/types";

function workbook(missingCache = false) {
  const sheet: XLSX.WorkSheet = { "!ref": "A1:M35" };
  const put = (cell: string, value: number | string) => {
    sheet[cell] = { t: typeof value === "number" ? "n" : "s", v: value };
  };
  put("A2", "Unit: kEUR");
  put("B4", "2026 Annual Performance (YTD Turnover)");
  put("B12", "2026 Monthly Performance");
  for (const [index, name] of ["PACK", "DEHK", "DDC"].entries()) {
    const annual = 6 + index;
    const detail = 24 + index * 5;
    put(`A${annual}`, name);
    put(`A${annual + 8}`, name);
    put(`B${detail - 2}`, `${name} Performance`);
    put(`A${detail}`, "YTD");
    put(`A${detail + 1}`, "Monthly");
    for (const [col, month, actual, ytd] of [
      ["B", "Jan", index + 1, index + 1],
      ["C", "Feb", 0, index + 1],
    ] as const) {
      for (const row of [5, 13, detail - 1]) put(`${col}${row}`, month);
      for (const row of [annual, detail]) put(`${col}${row}`, ytd);
      for (const row of [annual + 8, detail + 1]) put(`${col}${row}`, actual);
    }
  }
  for (const [cell, value] of Object.entries({ B9: 6, C9: 6, B17: 6, C17: 0 }))
    put(cell, value);
  if (missingCache) sheet.C35 = { t: "n", f: "C16" };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Annual vs. Monthly");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

test("month-close parser reconciles Entity totals and keeps zero distinct from an uncached formula", () => {
  const parsed = parseMonthlySalesWorkbook(workbook(), "monthly.xlsx");
  assert.deepEqual(
    parsed.monthlySalesCloses.map((c) => c.monthly),
    [
      [1, 0],
      [2, 0],
      [3, 0],
    ],
  );
  assert.throws(
    () => parseMonthlySalesWorkbook(workbook(true), "monthly.xlsx"),
    /cached number/,
  );
});

test("reviewed month close affects only authorized closed-month All sales chart data and can be restored", () => {
  const user: User = {
    id: "admin",
    email: "test@example.com",
    name: "Test",
    role: "superadmin",
    region: "APAC",
    crossRegionView: false,
    permissions: {},
  };
  const state: Store = {
    version: 2,
    revision: 0,
    users: [user],
    batches: [],
    audit: [],
    snapshots: seed.snapshots as Store["snapshots"],
    lines: seed.lines as Store["lines"],
  };
  const before = getDashboardSnapshot(state, user, defaultFilters);
  const batch: ImportBatch = {
    ...parseMonthlySalesWorkbook(workbook(), "monthly.xlsx"),
    id: "test-month-close",
    fileName: "monthly.xlsx",
    sourceType: "Excel",
    status: "review",
    entityIds: ["dcp", "dhk", "ddc"],
    submittedBy: user.id,
    submittedAt: "2026-03-01",
  };
  state.batches.push(batch);
  const preview = previewImport(state, batch);
  const review = {
    selectedScopes: preview.selectedScopes,
    reviewVersion: preview.reviewVersion,
  };
  assert.throws(
    () => publishReviewed(state, batch, user, review),
    /confirmation/,
  );
  publishReviewed(state, batch, user, {
    ...review,
    reason: "Confirmed closed-month invoicing",
  });
  const after = getDashboardSnapshot(state, user, defaultFilters);
  assert.equal(after.totals.monthly[0].base, 6);
  assert.equal(after.totals.monthly[1].scenario, 0);
  assert.equal(after.totals.cumulative[1].base, 6);
  assert.equal(after.totals.sales, before.totals.sales);
  assert.deepEqual(after.totals.monthly[10], before.totals.monthly[10]);
  assert.ok(
    getDashboardSnapshot(state, user, {
      ...defaultFilters,
      salesType: "external",
    }).rows.every((row) => !row.monthlyClose),
  );
  assert.ok(
    getDashboardSnapshot(state, user, {
      ...defaultFilters,
      week: 1,
    }).rows.every((row) => !row.monthlyClose),
  );
  const restore = previewRestore(state, batch);
  restoreReviewed(
    state,
    batch,
    user,
    restore.reviewVersion,
    "Restore test month close",
  );
  assert.deepEqual(
    getDashboardSnapshot(state, user, defaultFilters).totals,
    before.totals,
  );
});
