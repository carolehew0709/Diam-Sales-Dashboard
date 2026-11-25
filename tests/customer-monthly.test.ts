import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseCustomerMonthlyDetails } from "../lib/customer-monthly-parser";
import {
  monthlyDetailPoints,
  monthlyDetailRows,
  customerMonthlyView,
  monthlySalesComparison,
} from "../lib/customer-monthly";
import { defaultFilters, getDashboardSnapshot } from "../lib/dashboard";
import snapshots from "../data/apac-dashboard.json";
import type { CustomerAnalysis } from "../lib/graphics-types";
import type { Store, User } from "../lib/types";

function fixture() {
  const ws: XLSX.WorkSheet = { "!ref": "A1:AD46" };
  const cell = (r: number, c: number, v: string | number) => {
    ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })] = {
      t: typeof v === "number" ? "n" : "s",
      v,
    };
  };
  cell(31, 1, "TEAM");
  cell(31, 3, "2025 ACT");
  cell(31, 4, "2025 YTD");
  cell(31, 18, "2026 YTD");
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  months.forEach((m, i) => {
    cell(31, 5 + i, `2025 ${m}`);
    cell(31, 19 + i, `2026 ${m}`);
  });
  const rows: [string, string, number][] = [
    ["", "Key Customer", 3],
    ["Panny Team-S", "Sephora China", 1],
    ["Panny Team-L", "Sephora Asia", 2],
    ["", "Other Customers", 0],
    ["", "Other sparse", 0],
    ["", "Intergroup", 12],
    ["", "Intergroup D3", 3],
    ["Lily Team", "D3", 3],
    ["", "Intergroup FR", 4],
    ["Lynn Team", "France", 4],
    ["", "Intergroup Other Customers", 5],
    ["Elly Team", "Diam Europe", 5],
    ["", "Grand Total", 15],
  ];
  rows.forEach(([team, name, n], i) => {
    const r = i + 32;
    cell(r, 1, team);
    cell(r, 2, name);
    cell(r, 4, n * 10);
    cell(r, 18, n * 20);
    months.forEach((_, m) => {
      if (n) {
        cell(r, 5 + m, n);
        if (m < 10) cell(r, 19 + m, n * 2);
      }
    });
  });
  return ws;
}
test("Monthly detail source validates leaf allocations, keeps source evidence and compares Jan–Oct in both years", () => {
  const ws = fixture();
  const details = parseCustomerMonthlyDetails(ws, "Details", 2026, 10)!;
  assert.equal(details.rows.length, 6);
  assert.deepEqual(details.rows[0].path, ["Key Customer", "Sephora"]);
  assert.equal(details.rows[0].team, "Panny Team-S");
  assert.equal(details.rows[1].team, "Panny Team-L");
  const all = {
    year: 2025,
    team: "",
    category: "",
    subgroup: "",
    customer: "",
  };
  assert.equal(monthlyDetailPoints(details, all)[9].ytd, 150);
  assert.equal(
    monthlyDetailPoints(details, { ...all, year: 2026 })[9].ytd,
    300,
  );
  assert.deepEqual(
    monthlyDetailPoints(details, all)
      .slice(10)
      .map((p) => [p.monthly, p.ytd]),
    [
      [null, null],
      [null, null],
    ],
  );
  assert.equal(
    details.rows[0].monthly[2025][11],
    1,
    "full source months remain available as evidence",
  );
  assert.equal(
    monthlyDetailPoints(details, { ...all, team: "Panny Team-S" })[9].ytd,
    10,
  );
  assert.equal(
    monthlyDetailPoints(details, { ...all, team: "Panny Team-L" })[9].ytd,
    20,
  );
  assert.equal(
    monthlyDetailPoints(details, {
      ...all,
      category: "Intergroup",
      subgroup: "Intergroup FR",
    })[9].ytd,
    40,
  );
  assert.deepEqual(
    monthlyDetailRows(details, { team: "__unassigned__" }).map((r) => r.name),
    ["Other sparse"],
  );
  assert.equal(
    monthlyDetailPoints(details, { ...all, customer: "Other sparse" })[0]
      .monthly,
    0,
    "a declared, reconciled sparse source zero is retained",
  );
  assert.ok(
    monthlyDetailPoints(details, { ...all, customer: "Missing" }).every(
      (p) => p.monthly === null,
    ),
  );
  assert.equal(ws.A33.v, "Panny Team-S", "source workbook is not rewritten");
});
test("Shifted monthly headers, missing formula caches and unreconciled subtotals block intake", () => {
  const ws = fixture();
  ws.S33 = { t: "n", f: "SUM(A1:A2)" };
  assert.throws(
    () => parseCustomerMonthlyDetails(ws, "Details", 2026, 10),
    /formula\/cache/,
  );
  const changed = fixture();
  changed.S33 = { t: "n", v: 999 };
  assert.throws(
    () => parseCustomerMonthlyDetails(changed, "Details", 2026, 10),
    /reconcile/,
  );
  const headers = fixture();
  headers.S31 = { t: "s", v: "2026 Feb" };
  assert.throws(
    () => parseCustomerMonthlyDetails(headers, "Details", 2026, 10),
    /headers/,
  );
  assert.equal(
    parseCustomerMonthlyDetails({ "!ref": "A1" }, "Legacy", 2026, 10),
    undefined,
  );
});
test("Monthly details require complete China permission and compatible Entity/team/customer/type scope", () => {
  const details = parseCustomerMonthlyDetails(fixture(), "Details", 2026, 10)!;
  const source = {
    month: "2026-10",
    year: 2026,
    priorYear: 2025,
    entityIds: ["dhk", "ddc", "dcp"],
    sourceFile: "Synthetic.xlsx",
    sourceLabel: "Oct",
    breakdownSheet: "Details",
    customerSheet: "Customers",
    breakdown: [],
    customers: [],
    monthlyDetails: details,
  } as CustomerAnalysis;
  const state = { customerAnalyses: [source] } as Store;
  const user:User = {
    id: "viewer",
    name:"Viewer",
    email:"viewer@example.invalid",
    crossRegionView:false,
    role: "viewer",
    region: "APAC",
    permissions: { dhk: ["view"], ddc: ["view"], dcp: ["view"] },
  };
  assert.equal(
    customerMonthlyView(state, user, defaultFilters).source?.details.rows
      .length,
    6,
  );
  const comparison = monthlySalesComparison(
    customerMonthlyView(state, user, defaultFilters).source,
    2026,
  );
  assert.equal(comparison?.prior[9].ytd, 150);
  assert.equal(comparison?.current[9].ytd, 300);
  assert.equal(comparison?.current[10].monthly, null);
  assert.equal(comparison?.prior[10].monthly, null);
  const chinaSnapshots = (snapshots.snapshots as Store["snapshots"])
    .filter((row) => row.year === 2026 && source.entityIds.includes(row.entityId))
    .map((row) => ({ ...row, month: 11, week: 47 }));
  const dashboardState: Store = {
    version: 2, revision: 1, users: [], snapshots: chinaSnapshots,
    lines: [], batches: [], audit: [], customerAnalyses: [source],
  };
  assert.ok(getDashboardSnapshot(dashboardState, user, defaultFilters).graphics.salesComparison);
  for (const patch of [{ bu: "DDC" }, { region: "APAC" }, { year: 2027 }, { salesType: "external" as const }])
    assert.equal(getDashboardSnapshot(dashboardState, user, { ...defaultFilters, ...patch }).graphics.salesComparison, undefined);
  assert.equal(getDashboardSnapshot(dashboardState, { ...user, permissions: { dhk: ["view"] } }, defaultFilters).graphics.salesComparison, undefined);
  const beforeClose: Store = {
    ...dashboardState,
    snapshots: chinaSnapshots.map((row) => ({ ...row, month: 10, week: 43 })),
  };
  assert.equal(getDashboardSnapshot(beforeClose, user, defaultFilters).graphics.salesComparison, undefined);
  for (const patch of [
    { bu: "DDC" },
    { entity: "dhk" },
    { salesTeam: "Panny Team" },
    { customer: "Sephora" },
    { salesType: "external" as const },
    { region: "India" },
  ])
    assert.equal(
      customerMonthlyView(state, user, { ...defaultFilters, ...patch }).source,
      null,
    );
  const scopes:User["permissions"][] = [
    { ddi: ["view"] },
    { dhk: ["view"] },
    { dhk: ["view"], ddc: ["view"] },
  ];
  for (const permissions of scopes)
    assert.equal(
      customerMonthlyView(
        state,
        { ...user, permissions } as User,
        defaultFilters,
      ).source,
      null,
    );
});
