import * as XLSX from "xlsx";
import type { CustomerMonthlyDetails } from "./graphics-types";

const text = (v: unknown) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** Optional extended finance table. Read cached amounts without executing formulas or external links. */
export function parseCustomerMonthlyDetails(
  sheet: XLSX.WorkSheet,
  sourceSheet: string,
  year: number,
  cutoffMonth: number,
): CustomerMonthlyDetails | undefined {
  const end = XLSX.utils.decode_range(sheet["!ref"] ?? "A1").e.r + 1;
  const value = (r: number, c: number) =>
    sheet[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
  const headers = Array.from({ length: end }, (_, i) => i + 1).filter(
    (r) =>
      text(value(r, 1)?.v) === "TEAM" &&
      text(value(r, 3)?.v) === `${year - 1} ACT`,
  );
  if (!headers.length) return;
  if (headers.length !== 1 || cutoffMonth < 1 || cutoffMonth > 12)
    throw Error("Invalid monthly customer table period");
  const header = headers[0];
  for (const [offset, fy] of [
    [5, year - 1],
    [19, year],
  ] as const) {
    if (text(value(header, offset - 1)?.v) !== `${fy} YTD`)
      throw Error("Monthly customer YTD headers changed");
    for (let m = 0; m < 12; m++)
      if (text(value(header, offset + m)?.v) !== `${fy} ${months[m]}`)
        throw Error("Monthly customer month headers changed");
  }
  const amount = (r: number, c: number): number | null => {
    const cell = value(r, c);
    if (cell?.t === "e" || (cell?.f && typeof cell.v !== "number"))
      throw Error(
        `Invalid monthly customer formula/cache at ${sourceSheet}!${XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })}`,
      );
    if (cell?.v == null || cell.v === "") return null;
    if (typeof cell.v !== "number" || !Number.isFinite(cell.v))
      throw Error("Invalid monthly customer amount");
    return cell.v;
  };
  type Entry = CustomerMonthlyDetails["rows"][number];
  const rows: Entry[] = [];
  const rollups = new Map<string, Entry>();
  let category = "",
    subgroup = "",
    lastRow = 0;
  const categories = ["Key Customer", "Other Customers", "Intergroup"];
  const intergroups = [
    "Intergroup D3",
    "Intergroup FR",
    "Intergroup Other Customers",
  ];
  for (let r = header + 1; r <= end; r++) {
    const name = text(value(r, 2)?.v),
      originalTeam = text(value(r, 1)?.v);
    if (!name && !originalTeam) continue;
    const isTotal = name === "Grand Total";
    const isRollup =
      categories.includes(name) || intergroups.includes(name) || isTotal;
    if (categories.includes(name)) {
      category = name;
      subgroup = "";
    }
    if (intergroups.includes(name)) {
      if (category !== "Intergroup")
        throw Error("Monthly customer hierarchy changed");
      subgroup = name;
    }
    if (!isRollup && !category)
      throw Error("Monthly customer category is missing");
    const entry: Entry = {
      name,
      team: /^Panny Team-[LS]$/i.test(originalTeam)
        ? "Panny Team"
        : originalTeam,
      path: [],
      monthly: {},
      ytd: {},
      sourceRow: r,
    };
    for (const [offset, fy] of [
      [5, year - 1],
      [19, year],
    ] as const) {
      const ytd = amount(r, offset - 1),
        raw = Array.from({ length: 12 }, (_, m) => amount(r, offset + m));
      if (ytd === null && raw.some((v) => v !== null))
        throw Error(`Missing monthly customer YTD at row ${r}`);
      // A supplied YTD and SUM-reconciled sparse allocation declares blanks as no activity.
      const points = raw.map((v) => (ytd === null ? null : (v ?? 0)));
      const total = points
        .slice(0, cutoffMonth)
        .reduce<number>((n, v) => n + (v ?? 0), 0);
      if (ytd !== null && Math.abs(total - ytd) > 1e-6)
        throw Error(
          `Monthly customer YTD does not reconcile at row ${r}, FY${fy}`,
        );
      entry.monthly[fy] = points;
      entry.ytd[fy] = ytd;
    }
    if (isRollup) rollups.set(name, entry);
    else {
      let path = [category];
      if (category === "Intergroup") {
        if (!subgroup) throw Error("Monthly intergroup subgroup is missing");
        path.push(subgroup);
      } else if (category === "Key Customer") {
        const match = /^(.+) (China|Asia)$/.exec(name);
        if (!match)
          throw Error(`Unsupported key customer hierarchy at row ${r}`);
        path.push(match[1]);
      }
      entry.path = path;
      if (Object.values(entry.ytd).some((v) => v !== null)) rows.push(entry);
    }
    if (isTotal) {
      lastRow = r;
      break;
    }
  }
  if (!lastRow || !rows.length)
    throw Error("Monthly customer table requires a Grand Total terminator");
  for (const name of [...categories, ...intergroups, "Grand Total"]) {
    const control = rollups.get(name);
    if (!control) throw Error(`Missing monthly customer subtotal ${name}`);
    const children =
      name === "Grand Total" ? rows : rows.filter((r) => r.path.includes(name));
    for (const fy of [year - 1, year])
      for (let m = 0; m < cutoffMonth; m++) {
        const total = children.reduce((n, r) => n + (r.monthly[fy][m] ?? 0), 0);
        if (
          control.monthly[fy][m] === null ||
          Math.abs(total - control.monthly[fy][m]!) > 1e-6
        )
          throw Error(
            `Monthly customer subtotal does not reconcile: ${name}, FY${fy}, month ${m + 1}`,
          );
      }
  }
  return {
    cutoffMonth,
    years: [year - 1, year],
    sourceSheet,
    sourceRange: `A${header}:AD${lastRow}`,
    rows,
  };
}
