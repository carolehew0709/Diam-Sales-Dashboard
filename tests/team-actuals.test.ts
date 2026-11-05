import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseTeamActualWorkbook } from "../lib/team-actual-parser";
import { teamActualView, teamNamesState } from "../lib/team-actuals";
import type { Store, User, Filters } from "../lib/types";
function fixture() {
  const s = XLSX.utils.aoa_to_sheet([
    ["SALES TEAM1", "SALES TEAM2", "Jan", "Feb", "YTD"],
    ["BD", "Elly Team", 1000, 2000, 3000],
    ["TOTAL", null, 1000, 2000, 3000],
  ]);
  const rows: any[][] = [
    [],
    [],
    [
      "Team",
      "External or Group",
      "DDC/DEHK",
      "Customer",
      "FY26 Budget",
      "Jan Act",
      "Feb Act",
      ...Array(10).fill(null),
      "YTD Act",
    ],
    [
      "BD",
      "External",
      "DEHK",
      "Customer",
      5000,
      1000,
      1000,
      ...Array(10).fill(null),
      2000,
    ],
    [
      "BD-Trading",
      "Group",
      "DDC",
      "Internal",
      null,
      null,
      1000,
      ...Array(10).fill(null),
      1000,
    ],
  ];
  const d = XLSX.utils.aoa_to_sheet(rows);
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, s, "Sheet1");
  XLSX.utils.book_append_sheet(w, d, "Sales Forecast");
  return { w, s, d };
}
function parse(x = fixture()) {
  return parseTeamActualWorkbook(
    XLSX.write(x.w, { type: "buffer", bookType: "xlsx" }),
    "Synthetic.xlsx",
  )!;
}
const user = {
  id: "a",
  role: "superadmin",
  region: "APAC",
  permissions: {},
} as User;
const filters: Filters = {
  region: "China",
  bu: "all",
  entity: "all",
  salesTeam: "all",
  customer: "all",
  year: 2026,
  salesType: "all",
  scenario: "Sales",
};
test("team actual parser reconciles detail/summary and converts EUR without future zeros", () => {
  const p = parse();
  assert.equal(p.teamActualData?.rows.length, 2);
  assert.equal(p.teamActualData?.rows[0].ytd, 2);
  assert.equal(p.teamActualData?.rows[0].budget, 5);
  assert.equal(p.teamActualData?.rows[0].monthly[2], null);
  assert.equal(p.teamActualData?.rows[1].team, "Elly Team");
  assert.equal(p.snapshots.length, 0);
  assert.equal(p.lines.length, 0);
});
test("team actual scope excludes DDC Group and leaves approved weekly data untouched", () => {
  const p = parse(),
    state = {
      teamActualData: p.teamActualData,
      snapshots: [],
      lines: [],
    } as unknown as Store;
  const result = teamActualView(state, user, filters)!;
  assert.equal(result.sales, 2);
  assert.equal(result.budget, 5);
  assert.equal(result.attainment, 0.4);
  assert.deepEqual(result.monthly.slice(0, 3), [1, 1, null]);
  assert.equal(
    teamActualView(
      state,
      { ...user, role: "viewer", permissions: { ddi: ["view"] } } as User,
      filters,
    ),
    null,
  );
  assert.equal(
    teamActualView(state, user, { ...filters, year: 2027 })?.sales,
    null,
  );
  assert.equal(
    teamActualView(state, user, { ...filters, customer: "Brand" })?.sales,
    null,
  );
  assert.equal(teamActualView(state, user, { ...filters, bu: "DCP" }), null);
});
test("unallocated budget stays absent on source rows, never invent monthly allocation", () => {
  const p = parse();
  assert.equal(p.teamActualData!.rows[1].budget, null);
  const x = fixture();
  x.d.E4 = { t: "n", v: 0 };
  const d = parse(x).teamActualData!;
  assert.equal(d.rows[0].budget, 0);
  assert.equal(
    teamActualView({ teamActualData: d } as Store, user, filters)!.attainment,
    null,
  );
});
test("renames reporting copies including retained Prospect without modifying raw evidence", () => {
  const data = parse().teamActualData;
  const line = { entityId: "dhk", salesTeam: "BD" } as any,
    foreign = { entityId: "ddj", salesTeam: "BD" } as any;
  const state = {
    teamActualData: data,
    lines: [line, foreign],
    retainedTeamSource: { lines: [line], snapshots: [], retainedAt: "x" },
  } as unknown as Store;
  const result = teamNamesState(state);
  assert.equal(result.lines[0].salesTeam, "Elly Team");
  assert.equal(result.lines[1].salesTeam, "BD");
  assert.equal(result.retainedTeamSource!.lines[0].salesTeam, "Elly Team");
  assert.equal(state.lines[0].salesTeam, "BD");
});
test("rejects changed headers, missing formula caches, unknown mapping, reconciliation differences", () => {
  let x = fixture();
  x.d.F3 = { t: "s", v: "Feb Act" };
  assert.throws(() => parse(x));
  x = fixture();
  x.d.R4 = { f: "SUM(F4:O4)", t: "n" };
  assert.throws(() => parse(x));
  x = fixture();
  x.d.A4 = { t: "s", v: "Unknown" };
  assert.throws(() => parse(x));
  x = fixture();
  x.s.E2 = { t: "n", v: 9000 };
  assert.throws(() => parse(x));
});
