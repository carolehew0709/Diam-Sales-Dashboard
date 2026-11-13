import * as XLSX from "xlsx";
import { excelDate } from "./receivables-parser";
import type { Finding } from "./types";
import type { ReceivableRecord, AgingBucket } from "./receivables-types";
const text = (v: unknown) => String(v ?? "").trim();
const isLedger = (ws: XLSX.WorkSheet) =>
  ws.A1?.v === "序号" && ws.Q1?.v === "余额" && ws.L1?.v === "最后到期日";
const isClassifiedDetail = (ws: XLSX.WorkSheet) =>
  ws.A1?.v === "序号" &&
  ws.G1?.v === "Customer Group" &&
  ws.M1?.v === "最后到期日" &&
  ws.R1?.v === "余额";
export const isDdcAgingWorkbook = (wb: XLSX.WorkBook) =>
  wb.SheetNames.some(
    (name) => isLedger(wb.Sheets[name]) || isClassifiedDetail(wb.Sheets[name]),
  );
/** A specifically identified DDC ledger replaces DDC invoices only, in original currencies. */
export function parseDdcAging(bytes: Buffer, file: string) {
  const wb = XLSX.read(bytes, { type: "buffer", cellFormula: true });
  const sheets = wb.SheetNames.map((name) => ({ name, ws: wb.Sheets[name] }));
  const ledgers = sheets.filter(({ ws }) => isLedger(ws));
  const details = sheets.filter(({ ws }) => isClassifiedDetail(ws));
  if (ledgers.length !== 1 || details.length > 1)
    throw Error(
      "DDC requires one full invoice ledger and at most one classified detail sheet",
    );
  const [entry] = ledgers;
  const date = file.match(/(20\d{2})(\d{2})(\d{2})/),
    asOfDate = date ? excelDate(`${date[1]}-${date[2]}-${date[3]}`) : null;
  const records: ReceivableRecord[] = [],
    findings: Finding[] = [];
  if (!asOfDate) throw Error("DDC source reporting date is missing");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(entry.ws, {
    header: 1,
    range: 0,
    defval: null,
  });
  let mismatch = 0,
    missing = 0;
  rows.slice(1).forEach((r, index) => {
    if (!r[9] && !r[5]) return;
    if (text(r[2]) !== "迪亚姆展示设备（昆山）有限公司")
      throw Error(`Unexpected settlement organization at row ${index + 2}`);
    const currency =
      text(r[6]) === "欧元" ? "EUR" : text(r[6]) === "人民币" ? "RMB" : null;
    const invoiceDate = excelDate(r[10]),
      dueDate = excelDate(r[11]);
    if (
      !currency ||
      !invoiceDate ||
      !dueDate ||
      typeof r[16] !== "number" ||
      !Number.isFinite(r[16]) ||
      !r[9] ||
      !r[5]
    )
      throw Error(`Missing or invalid DDC invoice field at row ${index + 2}`);
    for (const c of [10, 11, 16]) {
      const cell = entry.ws[XLSX.utils.encode_cell({ r: index + 1, c })];
      if (cell?.t === "e" || (cell?.f && cell.v === undefined))
        throw Error(`Invalid cached DDC value at row ${index + 2}`);
    }
    const days =
      typeof r[12] === "number"
        ? r[12]
        : typeof r[13] === "number"
          ? -r[13]
          : null;
    const aging: AgingBucket =
      days === null
        ? "unclassified"
        : days <= 0
          ? "not-due"
          : days <= 30
            ? "1-30"
            : days <= 60
              ? "31-60"
              : days <= 90
                ? "61-90"
                : days <= 120
                  ? "91-120"
                  : "over-120";
    if (days === null) missing++;
    else if (
      Math.round((Date.parse(asOfDate) - Date.parse(dueDate)) / 86400000) !==
      days
    )
      mismatch++;
    records.push({
      id: `ddc:${entry.name}:${index + 2}`,
      entityId: "ddc",
      category: "invoice",
      customer: text(r[5]),
      subCustomer: "",
      salesTeam: text(r[17]),
      pic: text(r[18]),
      invoiceNumber: text(r[9]),
      invoiceDate,
      receivedDate: null,
      dueDate,
      asOfDate,
      terms: null,
      overdueDays: days,
      aging,
      sourceAging: `逾期天数=${r[12] ?? ""}; 即将到期天数=${r[13] ?? ""}`,
      customerType: "Unclassified",
      amount: r[16],
      currency,
      note: text(r[19]),
      sourceFile: file,
      sourceSheet: entry.name,
      sourceRow: index + 2,
    });
  });
  if (!records.length) throw Error("No valid DDC invoices");
  const detail = details[0];
  if (detail) {
    const expected = {
      C1: "结算组织",
      F1: "往来单位名称",
      H1: "币种",
      K1: "单据编号",
      L1: "业务日期",
      N1: "逾期天数",
      O1: "即将到期天数",
      S1: "Sales Team",
    };
    for (const [address, label] of Object.entries(expected))
      if (detail.ws[address]?.v !== label)
        throw Error(
          `DDC classified detail has a missing or shifted ${label} column`,
        );
    const byInvoice = new Map<string, ReceivableRecord[]>();
    for (const record of records) {
      const matches = byInvoice.get(record.invoiceNumber) ?? [];
      matches.push(record);
      byInvoice.set(record.invoiceNumber, matches);
    }
    const seen = new Set<string>();
    const rows = XLSX.utils.sheet_to_json<unknown[]>(detail.ws, {
      header: 1,
      range: 0,
      defval: null,
    });
    for (const [index, r] of rows.slice(1).entries()) {
      if (!r[10] && !r[5]) continue;
      const row = index + 2;
      for (const c of [2, 5, 6, 7, 10, 11, 12, 13, 14, 17, 18]) {
        const cell = detail.ws[XLSX.utils.encode_cell({ r: row - 1, c })];
        if (cell?.t === "e" || (cell?.f && cell.v == null))
          throw Error(
            `Invalid cached DDC classified detail value at row ${row}`,
          );
      }
      const matches = byInvoice.get(text(r[10])) ?? [];
      const [record] = matches;
      const currency =
        text(r[7]) === "人民币" ? "RMB" : text(r[7]) === "欧元" ? "EUR" : null;
      const days =
        typeof r[13] === "number"
          ? r[13]
          : typeof r[14] === "number"
            ? -r[14]
            : null;
      if (
        matches.length !== 1 ||
        seen.has(record.id) ||
        text(r[2]) !== "迪亚姆展示设备（昆山）有限公司" ||
        record.customer !== text(r[5]) ||
        record.currency !== currency ||
        record.invoiceDate !== excelDate(r[11]) ||
        record.dueDate !== excelDate(r[12]) ||
        record.overdueDays !== days ||
        typeof r[17] !== "number" ||
        Math.abs(record.amount - r[17]) > 0.000001
      )
        throw Error(
          `DDC classified detail row ${row} does not uniquely reconcile to the full ledger`,
        );
      seen.add(record.id);
      if (text(r[6])) record.customerGroup = text(r[6]);
      if (text(r[18])) record.salesTeam = text(r[18]);
      record.classificationSource = { sheet: detail.name, row };
    }
    if (!seen.size)
      throw Error("DDC classified detail has no matching invoice rows");
    findings.push({
      severity: "info",
      message: `DDC: ${seen.size} classified lines match the full ledger; ${records.length - seen.size} other ledger lines retain their original values.`,
    });
  }
  findings.push({
    severity: "review",
    message:
      "DDC invoices only; preserve DEHK invoices and all Unknown/Advance receipts. Original EUR/RMB remain separate. External/Group allocation is not supplied.",
  });
  if (missing)
    findings.push({
      severity: "review",
      message: `${missing} invoices have no source aging days; leave unclassified rather than recompute.`,
    });
  if (mismatch)
    findings.push({
      severity: "review",
      message: `${mismatch} source aging values differ from due-date arithmetic; preserve the source aging columns.`,
    });
  return {
    records,
    findings,
    sourceKind: "aging" as const,
    replacementEntityIds: ["ddc"],
    sheets: wb.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.decode_range(wb.Sheets[name]["!ref"] ?? "A1").e.r + 1,
      kind:
        name === entry.name
          ? "DDC invoices"
          : name === detail?.name
            ? "DDC invoice classifications"
            : "Supporting (not added)",
    })),
  };
}
