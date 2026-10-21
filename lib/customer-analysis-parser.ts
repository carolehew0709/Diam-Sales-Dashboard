import * as XLSX from "xlsx";
import type { CustomerAnalysis } from "./graphics-types";
import type { Finding } from "./types";

const number = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const text = (v: unknown) => String(v ?? "").trim();
const monthNames = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** Read cached source cells only. Workbook prose never executes as application instructions. */
export function parseCustomerAnalysisWorkbook(
  bytes: Buffer,
  sourceFile: string,
) {
  const sheetNames = XLSX.read(bytes, {
    type: "buffer",
    bookSheets: true,
  }).SheetNames;
  const customerSheet = sheetNames.find(
    (n) => n === "Customer Contribution & Focus",
  );
  const breakdownSheet = sheetNames.find((n) =>
    n.startsWith("Entity & Business Unit Breakdow"),
  );
  if (!customerSheet || !breakdownSheet) return null;
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const customers = workbook.Sheets[customerSheet],
    breakdown = workbook.Sheets[breakdownSheet];
  const findings: Finding[] = [];
  const sources = [text(customers.B2?.v), text(breakdown.D2?.v)];
  const sourceLabel = sources[0].replace(/^Source:\s*/i, "");
  const yearMatch = text(customers.C4?.v).match(/^Y(\d{2,4})\s+YTD\s+Act$/i);
  const priorMatch = text(customers.B4?.v).match(/^Y(\d{2,4})\s+YTD\s+Act$/i);
  const year = yearMatch
    ? Number(yearMatch[1]) + (yearMatch[1].length === 2 ? 2000 : 0)
    : 0;
  const priorYear = priorMatch
    ? Number(priorMatch[1]) + (priorMatch[1].length === 2 ? 2000 : 0)
    : 0;
  const sourceMonth = (s: string) =>
    monthNames.findIndex((m) => new RegExp(`\\b${m}[a-z]*\\b`, "i").test(s)) +
    1;
  const month = sourceMonth(sources[0]);
  if (
    !month ||
    sourceMonth(sources[1]) !== month ||
    !year ||
    priorYear !== year - 1
  )
    findings.push({
      severity: "error",
      message:
        "Customer source month and comparable YTD years must be explicit and consistent on both sheets",
      code: "graphics.validation.period",
    });
  const headers = [
    text(breakdown.B4?.v),
    text(breakdown.C4?.v),
    text(breakdown.D4?.v),
    text(breakdown.E4?.v),
  ];
  if (
    headers.some(
      (h, i) =>
        h !==
        [
          `Y${String(priorYear).slice(-2)} Act`,
          `Y${String(priorYear).slice(-2)} YTD Act`,
          `Y${String(year).slice(-2)} FCST`,
          `Y${String(year).slice(-2)} YTD Act`,
        ][i],
    ) ||
    !/^Unit:\s*(K€|kEUR)$/i.test(text(customers.A2?.v)) ||
    !/^Unit:\s*(K€|kEUR)$/i.test(text(breakdown.A2?.v))
  )
    findings.push({
      severity: "error",
      message:
        "Customer source headers and kEUR units must match the supported monthly contract",
      code: "graphics.validation.headers",
    });
  const required = (value: unknown, cell: string): number => {
    const n = number(value);
    if (n === null)
      findings.push({
        severity: "error",
        message: `Missing customer source number: ${cell}`,
        code: "graphics.validation.number",
        params: { cell },
      });
    return n ?? NaN;
  };
  const groups = [5, 6, 8, 9, 10].map((row) => ({
    name: text(breakdown[`A${row}`]?.v),
    sourceRow: row,
    values: ["B", "C", "D", "E"].map((col) =>
      required(breakdown[`${col}${row}`]?.v, `${breakdownSheet}!${col}${row}`),
    ) as [number, number, number, number],
  }));
  if (
    groups.some(
      (g, i) =>
        g.name !==
        [
          "Key Customer",
          "Other Customers",
          "Intergroup D3",
          "Intergroup FR",
          "Intergroup Other Customers",
        ][i],
    )
  )
    findings.push({
      severity: "error",
      message:
        "Customer breakdown categories do not match the supported source rows",
      code: "graphics.validation.categories",
    });
  const clients = [];
  for (let row = 5; row <= 1000; row++) {
    const name = text(customers[`A${row}`]?.v);
    if (!name || name.toUpperCase() === "TOTAL") break;
    clients.push({
      name,
      prior: required(customers[`B${row}`]?.v, `${customerSheet}!B${row}`),
      current: required(customers[`C${row}`]?.v, `${customerSheet}!C${row}`),
      sourceGrowth: number(customers[`D${row}`]?.v),
      status: text(customers[`E${row}`]?.v),
      sourceRow: row,
    });
  }
  if (
    !clients.length ||
    clients.some((c) => c.prior < 0 || c.current < 0) ||
    groups.some((g) => g.values.some((v) => v < 0))
  )
    findings.push({
      severity: "error",
      message:
        "Customer contribution requires non-negative source amounts and at least one customer",
      code: "graphics.validation.positive",
    });
  if (
    new Set(clients.map((c) => c.name.toLowerCase())).size !== clients.length ||
    text(customers[`A${clients.length + 5}`]?.v).toUpperCase() !== "TOTAL"
  )
    findings.push({
      severity: "error",
      message:
        "Customer rows require unique names and an explicit TOTAL terminator",
      code: "graphics.validation.rows",
    });
  for (const [i, col] of ["B", "C", "D", "E"].entries()) {
    const total = required(
      breakdown[`${col}11`]?.v,
      `${breakdownSheet}!${col}11`,
    );
    if (Math.abs(groups.reduce((n, g) => n + g.values[i], 0) - total) > 0.01)
      findings.push({
        severity: "error",
        message: `Customer breakdown does not reconcile: ${col}11`,
        code: "graphics.validation.total",
        params: { cell: `${breakdownSheet}!${col}11` },
      });
    if (
      Math.abs(
        groups.slice(2).reduce((n, g) => n + g.values[i], 0) -
          required(breakdown[`${col}7`]?.v, `${breakdownSheet}!${col}7`),
      ) > 0.01
    )
      findings.push({
        severity: "error",
        message: `Intergroup subtotal does not reconcile: ${col}7`,
        code: "graphics.validation.total",
        params: { cell: `${breakdownSheet}!${col}7` },
      });
  }
  for (const [key, index, col] of [
    ["prior", 1, "B"],
    ["current", 3, "C"],
  ] as const) {
    const sum = clients.reduce((n, c) => n + c[key], 0);
    if (
      Math.abs(sum - groups[0].values[index]) > 0.01 ||
      Math.abs(
        sum -
          required(
            customers[`${col}${clients.length + 5}`]?.v,
            `${customerSheet}!${col}${clients.length + 5}`,
          ),
      ) > 0.01
    )
      findings.push({
        severity: "error",
        message: `Key customer total does not reconcile: ${key}`,
        code: "graphics.validation.total",
        params: { cell: `${customerSheet}!${col}${clients.length + 5}` },
      });
  }
  findings.push({
    severity: "review",
    message:
      "China aggregate customer analysis; no BU, sales-type or team allocation. Monthly source remains separate from weekly sales and approved budgets.",
    code: "graphics.customerRule",
  });
  const analysis: CustomerAnalysis = {
    month: `${year}-${String(month).padStart(2, "0")}`,
    year,
    priorYear,
    entityIds: ["dhk", "dcp", "ddc"],
    sourceFile,
    sourceLabel,
    customerSheet,
    breakdownSheet,
    breakdown: groups,
    customers: clients,
  };
  return {
    customerAnalysis: analysis,
    snapshots: [],
    lines: [],
    findings,
    sheets: workbook.SheetNames.map((name) => ({
      name,
      rows:
        XLSX.utils.decode_range(workbook.Sheets[name]["!ref"] ?? "A1").e.r + 1,
      kind:
        name === customerSheet || name === breakdownSheet
          ? "Monthly customer analysis"
          : "Reference graphics (not imported)",
    })),
  };
}
