import * as XLSX from "xlsx";
import { excelDate } from "./receivables-parser";
import type { Finding } from "./types";
import type { ReceivableRecord, ReceiptCategory } from "./receivables-types";

const text = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const numeric = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
export const isPaymentStatusSheet = (name: string) =>
  /^unknown\s*&\s*advance$/i.test(name.trim());

/** The combined receipt detail is authoritative; other receipt tabs are not additive. */
export function parsePaymentStatusWorkbook(bytes: Buffer, sourceFile: string) {
  const book = XLSX.read(bytes, { type: "buffer", cellFormula: true });
  const records: ReceivableRecord[] = [],
    findings: Finding[] = [];
  const sheets = book.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.decode_range(book.Sheets[name]["!ref"] ?? "A1").e.r + 1,
    kind: "Receivables",
  }));
  const finish = () => ({
    records,
    findings,
    sheets,
    sourceKind: "payments" as const,
    replacementEntityIds: undefined,
  });
  const names = book.SheetNames.filter(isPaymentStatusSheet);
  if (names.length !== 1) {
    findings.push({
      severity: "error",
      code: "receipts.sheetRequired",
      message: "One Unknown & Advance detail sheet is required",
    });
    return finish();
  }
  const name = names[0],
    ws = book.Sheets[name];
  const error = (row: number, field: string) =>
    findings.push({
      severity: "error",
      code: "receipts.invalidField",
      params: { sheet: name, row, field },
      message: `${name} row ${row}: missing or invalid ${field}`,
    });
  const value = (r: number, c: number) => {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (cell?.t === "e" || (cell?.f && cell.v == null))
      error(r + 1, XLSX.utils.encode_col(c) + " formula cache");
    return cell?.v;
  };
  const headers = [
    "",
    "year",
    "receiveddateyyyymmdd",
    "payer",
    "currency",
    "receivedamount",
    "balance",
    "bankslip",
    "remarks",
    "saleteam",
    "pic",
    "status",
    "customer",
  ];
  for (let c = 0; c < headers.length; c++) {
    const label = text(value(0, c))
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (
      label !== headers[c] &&
      !(c === 2 && label === "receiveddate") &&
      !(c === 9 && label === "salesteam")
    ) {
      findings.push({
        severity: "error",
        code: "receipts.headers",
        params: { sheet: name },
        message: `${name}: unsupported or shifted receipt headers`,
      });
      return finish();
    }
  }
  const categories = new Map<string, ReceiptCategory>([
    ["unknown", "unknown"],
    ["advance", "advance"],
    ["tbc", "pending"],
  ]);
  let endOfDetails = false;
  const controls: { row: number; amount: unknown }[] = [];
  const end = XLSX.utils.decode_range(ws["!ref"] ?? "A1").e.r;
  for (let r = 1; r <= end; r++) {
    const row = Array.from({ length: 13 }, (_, c) => value(r, c));
    if (row.every((v) => v == null || text(v) === "")) continue;
    const balanceCell = ws[`G${r + 1}`];
    if (
      balanceCell?.f &&
      /^SUM\(\$?G\$?2:\$?G\$?\d+\)$/i.test(balanceCell.f) &&
      row.every((v, c) => c === 6 || v == null || text(v) === "")
    ) {
      controls.push({ row: r + 1, amount: balanceCell.v });
      endOfDetails = true;
      continue;
    }
    if (endOfDetails) {
      error(r + 1, "detail after total");
      continue;
    }
    const date = excelDate(row[2]),
      payer = text(row[3]),
      currency = text(row[4]).toUpperCase();
    const balance = row[6],
      received = row[5],
      sourceStatus = text(row[11]),
      category = categories.get(sourceStatus.toLowerCase());
    if (
      !date ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(Date.parse(date)).toISOString().slice(0, 10) !== date
    )
      error(r + 1, "Received Date (C)");
    if (!payer) error(r + 1, "Payer (D)");
    if (currency !== "USD" && currency !== "EUR")
      error(r + 1, "Currency (E): USD / EUR");
    if (!numeric(received)) error(r + 1, "Received Amount (F)");
    if (!numeric(balance)) error(r + 1, "Balance (G)");
    if (!category) error(r + 1, "Status (L): Unknown / Advance / TBC");
    if (
      !date ||
      !payer ||
      (currency !== "USD" && currency !== "EUR") ||
      !numeric(received) ||
      !numeric(balance) ||
      !category
    )
      continue;
    records.push({
      id: `china-payments:${name}:${r + 1}`,
      entityId: "china-payments",
      category,
      customer: text(row[12]),
      subCustomer: "",
      salesTeam: text(row[9]),
      pic: text(row[10]),
      payer,
      invoiceNumber: "",
      invoiceDate: null,
      receivedDate: date,
      dueDate: null,
      asOfDate: null,
      terms: null,
      overdueDays: null,
      aging: "unclassified",
      sourceAging: "",
      customerType: "Unclassified",
      amount: balance,
      currency,
      originalBalance: balance,
      originalCurrency: currency,
      receivedAmount: received,
      bankSlip: text(row[7]),
      sourceStatus,
      note: text(row[8]),
      sourceFile,
      sourceSheet: name,
      sourceRow: r + 1,
    });
  }
  if (!records.length)
    findings.push({
      severity: "error",
      code: "receipts.empty",
      message:
        "No valid receipt detail found; an empty sheet cannot replace receipts",
    });
  // This is a raw arithmetic checksum only: mixed-currency source totals are never reported as money.
  for (const control of controls)
    if (
      !numeric(control.amount) ||
      Math.abs(control.amount - records.reduce((n, row) => n + row.amount, 0)) >
        0.005
    )
      error(control.row, "Balance control total (G)");
  if (controls.length > 1) error(controls[1].row, "duplicate control total");
  const pending = records.filter((r) => r.category === "pending").length;
  if (pending)
    findings.push({
      severity: "review",
      code: "receipts.pendingReview",
      params: { count: pending },
      message: `${pending} TBC receipts remain pending confirmation, separate from Unknown and Advance`,
    });
  findings.push({
    severity: "info",
    code: "receipts.singleSheet",
    params: { sheet: name, count: records.length },
    message: `${name} is the only receipt source: ${records.length} rows; balances use their native USD / EUR currencies; other receipt tabs are excluded`,
  });
  return finish();
}
