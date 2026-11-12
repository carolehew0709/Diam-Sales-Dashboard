import * as XLSX from "xlsx";
import type { Finding, MonthlySalesClose } from "./types";

const sourceSheet = "Annual vs. Monthly";
const blocks = [
  { entityId: "dcp", label: "PACK", summaryRow: 6, detailRow: 24 },
  { entityId: "dhk", label: "DEHK", summaryRow: 7, detailRow: 29 },
  { entityId: "ddc", label: "DDC", summaryRow: 8, detailRow: 34 },
] as const;
const months = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");
const tolerance = 0.000001;

/** The China finance series is recorded in kEUR with no DEHK sales-type split. */
export function parseMonthlySalesWorkbook(bytes: Buffer, sourceFile: string) {
  const sheet = XLSX.read(bytes, {
    type: "buffer",
    sheetStubs: true,
    sheets: sourceSheet,
  }).Sheets[sourceSheet];
  if (!sheet) throw new Error(`Missing ${sourceSheet} sheet`);
  const value = (address: string) => sheet[address]?.v;
  const label = (address: string) => String(value(address) ?? "").trim();
  const year = Number(
    label("B4").match(/^(20\d{2}) Annual Performance \(YTD Turnover\)$/i)?.[1],
  );
  if (
    !Number.isInteger(year) ||
    label("B12") !== `${year} Monthly Performance` ||
    !/^Unit:\s*(K€|kEUR)$/i.test(label("A2"))
  )
    throw new Error(
      "Monthly Sales requires matching fiscal years and kEUR units",
    );
  const columns = months.map((_, i) => XLSX.utils.encode_col(i + 1));
  const occupied = (address: string) => {
    const cell = sheet[address];
    return (
      !!cell &&
      (cell.f != null || cell.t === "e" || (cell.v != null && cell.v !== ""))
    );
  };
  const lastMonth =
    columns.findLastIndex((col) =>
      [6, 7, 8, 9, 14, 15, 16, 17, 24, 25, 29, 30, 34, 35].some((row) =>
        occupied(`${col}${row}`),
      ),
    ) + 1;
  if (!lastMonth) throw new Error("Monthly Sales has no closed months");
  function amount(address: string): number {
    const cell = sheet[address];
    if (
      cell?.t !== "n" ||
      typeof cell.v !== "number" ||
      !Number.isFinite(cell.v)
    )
      throw new Error(
        `Missing or invalid cached number at ${sourceSheet}!${address}`,
      );
    return cell.v;
  }
  function match(a: number, b: number, address: string) {
    if (Math.abs(a - b) > tolerance)
      throw new Error(
        `Monthly Sales does not reconcile at ${sourceSheet}!${address}`,
      );
  }
  const monthlySalesCloses: MonthlySalesClose[] = blocks.map(
    ({ entityId, label: name, summaryRow, detailRow }) => {
      if (
        label(`A${summaryRow}`) !== name ||
        label(`A${summaryRow + 8}`) !== name ||
        label(`B${detailRow - 2}`) !== `${name} Performance` ||
        label(`A${detailRow}`) !== "YTD" ||
        label(`A${detailRow + 1}`) !== "Monthly"
      )
        throw new Error(`Unexpected monthly Sales layout for ${name}`);
      let total = 0;
      const monthly = columns.slice(0, lastMonth).map((col, i) => {
        if (
          [5, 13, detailRow - 1].some(
            (r) => label(`${col}${r}`).toUpperCase() !== months[i],
          )
        )
          throw new Error(
            `Unexpected month at ${sourceSheet}!${col}${detailRow - 1}`,
          );
        const actual = amount(`${col}${detailRow + 1}`);
        const ytd = amount(`${col}${detailRow}`);
        total += actual;
        match(total, ytd, `${col}${detailRow}`);
        match(
          actual,
          amount(`${col}${summaryRow + 8}`),
          `${col}${summaryRow + 8}`,
        );
        match(ytd, amount(`${col}${summaryRow}`), `${col}${summaryRow}`);
        return actual;
      });
      return {
        entityId,
        year,
        monthly,
        sourceFile,
        sourceSheet,
        sourceRange: `B${detailRow}:${columns[lastMonth - 1]}${detailRow + 1}`,
        sourceNote: label("E2"),
      };
    },
  );
  for (const [index, col] of columns.slice(0, lastMonth).entries()) {
    const total = monthlySalesCloses.reduce(
      (n, close) => n + close.monthly[index],
      0,
    );
    const ytd = monthlySalesCloses.reduce(
      (n, close) =>
        n + close.monthly.slice(0, index + 1).reduce((a, b) => a + b, 0),
      0,
    );
    match(ytd, amount(`${col}9`), `${col}9`);
    match(total, amount(`${col}17`), `${col}17`);
  }
  const findings: Finding[] = [
    {
      severity: "review",
      message:
        "Confirm the reported DDC amounts exclude Group and that the populated months are closed. This updates monthly Sales only.",
      code: "review.monthlySalesBasis",
    },
  ];
  return {
    monthlySalesCloses,
    snapshots: [],
    lines: [],
    findings,
    sheets: [
      {
        name: sourceSheet,
        rows: blocks.length * lastMonth,
        kind: "Monthly Sales",
      },
    ],
  };
}
