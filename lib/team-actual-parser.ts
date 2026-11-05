import * as XLSX from "xlsx";
import type { ImportBatch } from "./types";
import type { TeamActualData } from "./team-actual-types";
const norm = (v: unknown) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
export function parseTeamActualWorkbook(
  bytes: Buffer,
  fileName: string,
): Pick<
  ImportBatch,
  "snapshots" | "lines" | "sheets" | "findings" | "teamActualData"
> | null {
  const wb = XLSX.read(bytes, { type: "buffer", cellFormula: true });
  const summary = wb.Sheets.Sheet1;
  if (
    !summary ||
    norm(summary.A1?.v).toUpperCase() !== "SALES TEAM1" ||
    norm(summary.B1?.v).toUpperCase() !== "SALES TEAM2"
  )
    return null;
  const sheet = wb.Sheets["Sales Forecast"];
  if (!sheet) throw Error("Team actuals detail sheet is missing");
  const value = (s: XLSX.WorkSheet, r: number, c: number) =>
    s[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
  const numeric = (
    s: XLSX.WorkSheet,
    r: number,
    c: number,
    blank = false,
  ): number | null => {
    const x = value(s, r, c);
    if (x?.t === "e" || (x?.f && typeof x.v !== "number"))
      throw Error(
        "Invalid formula/cache at " +
          XLSX.utils.encode_cell({ r: r - 1, c: c - 1 }),
      );
    if (x?.v == null || x.v === "") {
      if (blank) return null;
      throw Error("Missing team amount");
    }
    if (typeof x.v !== "number" || !Number.isFinite(x.v))
      throw Error("Invalid team amount");
    return x.v;
  };
  const headers = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let month = 0;
  while (month < 12 && norm(value(summary, 1, month + 3)?.v) === headers[month])
    month++;
  if (!month || norm(value(summary, 1, month + 3)?.v) !== "YTD")
    throw Error("Team actual month headers changed");
  const fy = /^FY(\d{2}|20\d{2}) Budget$/.exec(norm(sheet.E3?.v));
  if (!fy) throw Error("Missing team budget year");
  const year = Number(fy[1]) + (fy[1].length === 2 ? 2000 : 0);
  if (
    norm(sheet.A3?.v) !== "Team" ||
    norm(sheet.B3?.v) !== "External or Group" ||
    norm(sheet.C3?.v) !== "DDC/DEHK" ||
    norm(sheet.R3?.v) !== "YTD Act"
  )
    throw Error("Team detail headers changed");
  for (let m = 0; m < month; m++)
    if (norm(value(sheet, 3, 6 + m)?.v) !== headers[m] + " Act")
      throw Error("Team actual columns changed");
  const mappings: Record<string, string> = {};
  const summaryTotals = new Map<string, number>();
  let totalRow = 0;
  for (let r = 2; r <= XLSX.utils.decode_range(summary["!ref"]!).e.r + 1; r++) {
    const old = norm(value(summary, r, 1)?.v);
    if (old === "TOTAL") {
      totalRow = r;
      break;
    }
    if (!old) continue;
    const team = norm(value(summary, r, 2)?.v);
    if (!team || mappings[old])
      throw Error("Missing or duplicate team mapping");
    mappings[old] = team;
    const amount = numeric(summary, r, month + 3)!;
    const sum = Array.from({ length: month }, (_, i) =>
      numeric(summary, r, i + 3)!,
    ).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - amount) > 0.01) throw Error("Team monthly/YTD mismatch");
    summaryTotals.set(old, amount);
  }
  if (!totalRow || !mappings.BD) throw Error("Incomplete team mapping");
  const data: TeamActualData = {
    reportingWeek: year === 2026 && month === 10 ? 44 : undefined,
    year,
    month,
    currency: "EUR",
    unit: "kEUR",
    sourceFile: fileName,
    sourceSheet: "Sales Forecast",
    mappings,
    rows: [],
  };
  const sums = new Map<string, number>();
  for (let r = 4; r <= XLSX.utils.decode_range(sheet["!ref"]!).e.r + 1; r++) {
    const kind = norm(value(sheet, r, 2)?.v).toLowerCase(),
      entity = norm(value(sheet, r, 3)?.v);
    if (!kind && !entity) continue;
    if (
      !["external", "group"].includes(kind) ||
      !["DEHK", "DDC"].includes(entity)
    )
      throw Error("Unknown team detail Entity/type at row " + r);
    const old = norm(value(sheet, r, 1)?.v),
      key = old === "BD-Trading" ? "BD" : old,
      team = mappings[key];
    if (!team) throw Error("Unmapped team " + old);
    const monthly = Array.from({ length: 12 }, (_, i) =>
      i < month ? (numeric(sheet, r, 6 + i, true) ?? 0) / 1000 : null,
    );
    const ytd = numeric(sheet, r, 18)!;
    if (
      Math.abs(
        monthly.slice(0, month).reduce<number>((a, b) => a + b!, 0) * 1000 -
          ytd,
      ) > 0.01
    )
      throw Error("Detail monthly/YTD mismatch row " + r);
    const b = numeric(sheet, r, 5, true);
    sums.set(key, (sums.get(key) ?? 0) + ytd);
    data.rows.push({
      entityId: entity === "DEHK" ? "dhk" : "ddc",
      salesType: kind as "external" | "group",
      team,
      originalTeam: old,
      customer: norm(value(sheet, r, 4)?.v),
      monthly,
      ytd: ytd / 1000,
      budget: b === null ? null : b / 1000,
      sourceRow: r,
    });
  }
  for (const [team, total] of summaryTotals)
    if (Math.abs((sums.get(team) ?? 0) - total) > 0.01)
      throw Error("Summary/detail mismatch for " + team);
  if (
    Math.abs(
      [...sums.values()].reduce((a, b) => a + b, 0) -
        numeric(summary, totalRow, month + 3)!,
    ) > 0.01
  )
    throw Error("Team source total mismatch");
  return {
    snapshots: [],
    lines: [],
    teamActualData: data,
    sheets: wb.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.decode_range(wb.Sheets[name]["!ref"] ?? "A1").e.r + 1,
      kind:
        name === "Sales Forecast"
          ? "Team actuals detail"
          : name === "Sheet1"
            ? "Sales Team2 mapping"
            : "Reference (not imported)",
    })),
    findings: [
      {
        severity: "review",
        message:
          "Team actuals and source team annual budgets only. EUR converted to kEUR. DDC Group excluded in reporting. Weekly Sales/Prospect and approved Entity budgets remain unchanged; future-month actuals stay missing.",
      },
    ],
  };
}
