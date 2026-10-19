import * as XLSX from "xlsx";
import type { Finding } from "./types";
import type { AgingBucket, ReceivableRecord } from "./receivables-types";
const text = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
export function excelDate(value: unknown): string | null {
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    return date
      ? `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`
      : null;
  }
  const match = text(value).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return null;
  const iso = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}
export function agingBucket(value: unknown): AgingBucket {
  const label = text(value).toLowerCase().replace(/\s+/g, "");
  if (label === "notdue") return "not-due";
  if (/^(1|0)-30/.test(label)) return "1-30";
  if (/^31-60/.test(label)) return "31-60";
  if (/^61-90/.test(label)) return "61-90";
  if (/^91-120/.test(label)) return "91-120";
  if (/^>120/.test(label)) return "over-120";
  return "unclassified";
}
const customerType = (value: unknown): ReceivableRecord["customerType"] =>
  text(value).toLowerCase() === "external"
    ? "External"
    : text(value).toLowerCase() === "group"
      ? "Group"
      : "Unclassified";
const plusDays = (value: string | null, days: number | null) =>
  value && days !== null
    ? new Date(Date.parse(value) + days * 86400000).toISOString().slice(0, 10)
    : null;

/** Read cached source values only; explicit options capture owner-approved accounting scope. */
export function parseReceivablesWorkbook(
  bytes: Buffer,
  sourceFile: string,
  options: {
    paymentEntityId: string;
  },
) {
  const workbook = XLSX.read(bytes, { type: "buffer", cellFormula: true });
  const records: ReceivableRecord[] = [];
  const findings: Finding[] = [];
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows:
      XLSX.utils.decode_range(workbook.Sheets[name]["!ref"] ?? "A1").e.r + 1,
    kind: "Receivables",
  }));
  const aging =
    workbook.Sheets["DEHK OVERDUE"] && workbook.Sheets["DDC OVERDUE"];
  if (aging) {
    for (const [sheet, entityId, currency, amountColumn] of [
      ["DEHK OVERDUE", "dhk", "EUR", 10],
      ["DDC OVERDUE", "ddc", "RMB", 9],
    ] as const) {
      const ws = workbook.Sheets[sheet];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        defval: null,
        range: 0,
      });
      const asOfDate = excelDate(ws.O1?.v);
      rows.forEach((row, i) => {
        const date = excelDate(row[0]),
          invoice = text(row[1]),
          amount = num(row[amountColumn]);
        if (!date || !invoice || !text(row[2]) || amount === null) return;
        const terms = num(row[13]);
        records.push({
          id: `${entityId}:${sheet}:${i + 1}`,
          entityId,
          category: "invoice",
          customer: text(row[2]),
          subCustomer: text(row[3]),
          salesTeam: text(row[17]),
          pic: text(row[18]),
          invoiceNumber: invoice,
          invoiceDate: date,
          receivedDate: null,
          dueDate: plusDays(date, terms),
          asOfDate,
          terms,
          overdueDays: num(row[14]),
          aging: agingBucket(row[15]),
          sourceAging: text(row[15]),
          customerType: customerType(row[16]),
          amount,
          currency,
          note: text(row[19]),
          sourceFile,
          sourceSheet: sheet,
          sourceRow: i + 1,
        });
      });
      if (!asOfDate)
        findings.push({
          severity: "review",
          message: `${sheet}: source reporting date missing`,
        });
    }
  } else if (
    workbook.Sheets.Summary &&
    workbook.Sheets.Unknown &&
    workbook.Sheets.Advance
  ) {
    if (!options.paymentEntityId)
      throw new Error("Payment BU must be confirmed");
    const identity = (
      date: unknown,
      payer: unknown,
      currency: unknown,
      amount: unknown,
    ) =>
      JSON.stringify([
        excelDate(date),
        text(payer).toLowerCase(),
        text(currency),
        num(amount),
      ]);
    const categories = new Map<string, ("unknown" | "advance")[]>();
    for (const sheet of ["Unknown", "Advance"] as const) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], {
        header: 1,
        defval: null,
      });
      for (const row of rows) {
        if (!excelDate(row[2]) || !text(row[3]) || num(row[6]) === null)
          continue;
        const key = identity(row[2], row[3], row[4], row[6]);
        categories.set(key, [
          ...(categories.get(key) ?? []),
          sheet === "Unknown" ? "unknown" : "advance",
        ]);
      }
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Summary, {
      header: 1,
      defval: null,
      range: 0,
    });
    rows.forEach((row, i) => {
      const receivedDate = excelDate(row[2]),
        amount = num(row[7]);
      if (!receivedDate || !text(row[3]) || amount === null) return;
      const category = categories
        .get(identity(row[2], row[3], row[4], row[6]))
        ?.shift();
      if (!category) {
        findings.push({
          severity: "error",
          message: `Summary row ${i + 1}: Unknown/Advance classification does not reconcile`,
        });
        return;
      }
      records.push({
        id: `${options.paymentEntityId}:Summary:${i + 1}`,
        entityId: options.paymentEntityId,
        category,
        customer: text(row[10]),
        subCustomer: "",
        salesTeam: text(row[11]),
        pic: text(row[12]),
        invoiceNumber: "",
        invoiceDate: null,
        receivedDate,
        dueDate: null,
        asOfDate: null,
        terms: null,
        overdueDays: null,
        aging: "unclassified",
        sourceAging: "",
        customerType: "Unclassified",
        amount,
        currency: "EUR",
        originalBalance: num(row[6]) ?? undefined,
        originalCurrency: text(row[4]),
        payer: text(row[3]),
        note: text(row[9]),
        sourceFile,
        sourceSheet: "Summary",
        sourceRow: i + 1,
      });
    });
    if ([...categories.values()].some((queue) => queue.length))
      findings.push({
        severity: "error",
        message: "Unknown/Advance detail contains unmatched payments",
      });
  }
  if (!records.length)
    findings.push({
      severity: "error",
      message: "No receivables records found",
    });
  const unclassified = records.filter(
    (r) => r.category === "invoice" && r.aging === "unclassified",
  ).length;
  if (unclassified)
    findings.push({
      severity: "review",
      message: `${unclassified} invoices have unclassified aging`,
    });
  return {
    records,
    findings,
    sheets,
    sourceKind: aging ? ("aging" as const) : ("payments" as const),
  };
}
