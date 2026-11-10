import * as XLSX from "xlsx";
import { excelDate } from "./receivables-parser";
import type { Finding } from "./types";
import type { AgingBucket, ReceivableRecord } from "./receivables-types";

const text = (v: unknown) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
const normalized = (v: unknown) => text(v).toLowerCase();
const header = (v: unknown) => normalized(v).replace(/[^a-z0-9]/g, "");
const numeric = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const months = [
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

export const isDehkReceiveWorkbook = (book: XLSX.WorkBook) =>
  book.SheetNames.some((n) => /^NEW Aging \d{8}$/.test(n)) && !!book.Sheets.ALL;

/** This month-end contract includes current-month invoices, unlike legacy OVERDUE imports. */
export function parseDehkReceiveWorkbook(bytes: Buffer, sourceFile: string) {
  const book = XLSX.read(bytes, { type: "buffer", cellFormula: true });
  const findings: Finding[] = [];
  const records: ReceivableRecord[] = [];
  const sheets = book.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.decode_range(book.Sheets[name]["!ref"] ?? "A1").e.r + 1,
    kind: "Receivables",
  }));
  const error = (message: string) =>
    findings.push({ severity: "error", message });
  const finish = () => ({
    records,
    findings,
    sheets,
    sourceKind: "aging" as const,
    replacementEntityIds: ["dhk"],
  });
  const dated = book.SheetNames.filter((n) => /^NEW Aging \d{8}$/.test(n));
  if (dated.length !== 1 || !book.Sheets.ALL) {
    error(
      "DEHK receive status: one dated aging sheet and ALL ledger are required",
    );
    return finish();
  }
  const agingName = dated[0],
    aging = book.Sheets[agingName];
  const suffix = agingName.slice(-8),
    sourceDate = `${suffix.slice(0, 4)}-${suffix.slice(4, 6)}-${suffix.slice(6)}`;
  const cutoff = excelDate(aging.O1?.v);
  const stamp = Date.parse(sourceDate + "T00:00:00Z");
  if (
    !cutoff ||
    cutoff !== sourceDate ||
    !Number.isFinite(stamp) ||
    new Date(stamp).toISOString().slice(0, 10) !== cutoff ||
    new Date(stamp + 86400000).getUTCDate() !== 1
  ) {
    error(
      "DEHK receive status: dated sheet and O1 must agree on a valid month-end cutoff",
    );
    return finish();
  }
  const month = Number(cutoff.slice(5, 7));
  const currentName = `${months[month - 1]} Invoice`,
    current = book.Sheets[currentName],
    all = book.Sheets.ALL;
  if (!current) {
    error(
      `DEHK receive status: ${currentName} is required to reconcile the complete ledger`,
    );
    return finish();
  }
  const validCell = (
    ws: XLSX.WorkSheet,
    name: string,
    row: number,
    column: number,
  ) => {
    const address = XLSX.utils.encode_cell({ r: row, c: column }),
      cell = ws[address];
    if (cell?.t === "e" || (cell?.f && cell.v == null))
      error(`${name}!${address}: formula error or missing cached value`);
    return cell?.v;
  };
  const checkHeaders = (
    ws: XLSX.WorkSheet,
    name: string,
    row: number,
    expected: Record<number, string>,
  ) => {
    for (const [c, label] of Object.entries(expected))
      if (header(validCell(ws, name, row, Number(c))) !== label)
        error(`${name}: unsupported or shifted ${label} header`);
  };
  checkHeaders(all, "ALL", 1, {
    0: "date",
    1: "invoicenumber",
    2: "customer",
    3: "terms",
    4: "subcustomer",
    5: "project",
    6: "quantity",
    7: "amounteur",
    8: "amountusd",
    9: "amounthkd",
    10: "amountcny",
    11: "diversineur",
    12: "jobno",
    13: "salesteam",
  });
  checkHeaders(aging, agingName, 1, {
    0: "date",
    1: "invoicenumber",
    2: "customer",
    3: "subcustomer",
    10: "diversineur",
    11: "jobno",
    12: "salesteam",
    13: "terms",
    14: "overdue",
    15: "aging",
  });
  checkHeaders(current, currentName, 0, {
    0: "date",
    1: "invoicenumber",
    2: "groupexternal",
    3: "customer",
    4: "terms",
    5: "subcustomer",
    12: "diversineur",
    13: "jobno",
    14: "salesteam",
  });
  if (aging.O1?.t === "e" || (aging.O1?.f && aging.O1.v == null))
    error(`${agingName}!O1: invalid reporting date cache`);
  if (findings.length) return finish();

  type Line = {
    row: number;
    date: string;
    invoice: string;
    customer: string;
    sub: string;
    amount: number;
    terms: number;
    job: string;
    team: string;
    type?: "External" | "Group";
    note: string;
  };
  const read = (
    name: string,
    start: number,
    cols: {
      customer: number;
      sub: number;
      amount: number;
      terms: number;
      job: number;
      team: number;
      type?: number;
      note?: number;
    },
  ) => {
    const ws = book.Sheets[name],
      result: Line[] = [],
      end = XLSX.utils.decode_range(ws["!ref"] ?? "A1").e.r;
    const letter = XLSX.utils.encode_col(cols.amount);
    const totalRow = Array.from({ length: end + 1 }, (_, r) => r).find((r) =>
      new RegExp(`^SUM\\(${letter}\\d+:${letter}\\d+\\)$`, "i").test(
        ws[`${letter}${r + 1}`]?.f ?? "",
      ),
    );
    for (let r = start; r < (totalRow ?? end + 1); r++) {
      const get = (c: number) => validCell(ws, name, r, c);
      const invoice = text(ws[XLSX.utils.encode_cell({ r, c: 1 })]?.v);
      if (
        !invoice ||
        !text(ws[XLSX.utils.encode_cell({ r, c: cols.customer })]?.v)
      )
        continue;
      const d = get(0),
        amount = get(cols.amount);
      // Summary/classification tables do not have an invoice date or detail amount.
      if (d == null && !numeric(amount)) continue;
      const date = excelDate(d),
        terms = get(cols.terms);
      if (
        !date ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(Date.parse(date)).toISOString().slice(0, 10) !== date ||
        !numeric(amount) ||
        !numeric(terms) ||
        terms < 0 ||
        !Number.isInteger(terms)
      ) {
        error(
          `${name} row ${r + 1}: invalid invoice date, EUR balance or numeric payment terms`,
        );
        continue;
      }
      if (
        date > cutoff ||
        (name === currentName && date.slice(0, 7) !== cutoff.slice(0, 7)) ||
        (name === agingName && date.slice(0, 7) >= cutoff.slice(0, 7))
      )
        error(`${name} row ${r + 1}: invoice lies outside the source period`);
      const kind = cols.type === undefined ? undefined : text(get(cols.type));
      if (kind !== undefined && kind !== "External" && kind !== "Group")
        error(
          `${name} row ${r + 1}: explicit External/Group classification required`,
        );
      result.push({
        row: r + 1,
        date,
        invoice,
        customer: text(get(cols.customer)),
        sub: text(get(cols.sub)),
        amount,
        terms,
        job: text(get(cols.job)),
        team: text(get(cols.team)),
        type: kind as Line["type"],
        note: cols.note === undefined ? "" : text(get(cols.note)),
      });
    }
    if (!result.length)
      error(
        `${name}: no valid invoice detail; an empty ledger cannot replace DEHK`,
      );
    return result;
  };
  const old = read(agingName, 2, {
    customer: 2,
    sub: 3,
    amount: 10,
    terms: 13,
    job: 11,
    team: 12,
    note: 18,
  });
  const added = read(currentName, 1, {
    customer: 3,
    sub: 5,
    amount: 12,
    terms: 4,
    job: 13,
    team: 14,
    type: 2,
  });
  const ledger = read("ALL", 2, {
    customer: 2,
    sub: 4,
    amount: 11,
    terms: 3,
    job: 12,
    team: 13,
  });
  // The dated sheet explicitly maps customers to classifications in its summary.
  // Use the map only if unique and reconciled, never infer company ownership.
  const classes = new Map<string, Set<"External" | "Group">>();
  for (
    let r = 2;
    r <= XLSX.utils.decode_range(aging["!ref"] ?? "A1").e.r;
    r++
  ) {
    const kind = text(aging[`B${r + 1}`]?.v),
      customer = text(aging[`C${r + 1}`]?.v);
    if ((kind === "External" || kind === "Group") && customer) {
      validCell(aging, agingName, r, 1);
      validCell(aging, agingName, r, 2);
      classes.set(
        normalized(customer),
        new Set([...(classes.get(normalized(customer)) ?? []), kind]),
      );
    }
  }
  for (const line of old) {
    const choices = classes.get(normalized(line.customer));
    if (choices?.size !== 1)
      error(
        `${agingName} row ${line.row}: missing or conflicting source customer classification`,
      );
    else line.type = [...choices][0];
  }
  const key = (line: Line) =>
    JSON.stringify([
      line.date,
      line.invoice,
      normalized(line.customer),
      normalized(line.sub),
      Number(line.amount.toFixed(6)),
      line.terms,
      normalized(line.job),
      normalized(line.team),
    ]);
  const sourceLines = new Map<string, Line[]>();
  for (const line of [...old, ...added])
    sourceLines.set(key(line), [...(sourceLines.get(key(line)) ?? []), line]);
  for (const line of ledger) {
    const source = sourceLines.get(key(line))?.shift();
    if (!source) {
      error(
        `ALL row ${line.row}: invoice does not reconcile with dated aging plus current-month invoices`,
      );
      continue;
    }
    const overdueDays = Math.max(
      0,
      (Date.parse(cutoff) - Date.parse(line.date)) / 86400000 - line.terms,
    );
    const bucket: AgingBucket =
      overdueDays <= 0
        ? "not-due"
        : overdueDays <= 30
          ? "1-30"
          : overdueDays <= 60
            ? "31-60"
            : overdueDays <= 90
              ? "61-90"
              : overdueDays <= 120
                ? "91-120"
                : "over-120";
    records.push({
      id: `dhk:ALL:${line.row}`,
      entityId: "dhk",
      category: "invoice",
      customer: line.customer,
      subCustomer: line.sub,
      salesTeam: line.team,
      pic: "",
      invoiceNumber: line.invoice,
      invoiceDate: line.date,
      receivedDate: null,
      dueDate: new Date(Date.parse(line.date) + line.terms * 86400000)
        .toISOString()
        .slice(0, 10),
      asOfDate: cutoff,
      terms: line.terms,
      overdueDays,
      aging: bucket,
      sourceAging: "",
      customerType: source.type ?? "Unclassified",
      amount: line.amount,
      currency: "EUR",
      note: `Aging calculated at ${cutoff} from invoice date + terms. Reconciled with ${source.date.slice(0, 7) === cutoff.slice(0, 7) ? currentName : agingName} row ${source.row}.${source.note ? ` Subsequent settlement (not deducted): ${source.note}` : ""}`,
      sourceFile,
      sourceSheet: "ALL",
      sourceRow: line.row,
    });
  }
  if ([...sourceLines.values()].some((list) => list.length))
    error("DEHK receive status: source invoices are missing from ALL ledger");
  for (const kind of ["External", "Group"] as const) {
    const controls = Array.from(
      { length: XLSX.utils.decode_range(aging["!ref"] ?? "A1").e.r + 1 },
      (_, r) => r,
    ).filter(
      (r) =>
        text(aging[`A${r + 1}`]?.v) === kind &&
        numeric(aging[`B${r + 1}`]?.v) &&
        numeric(aging[`C${r + 1}`]?.v) &&
        numeric(aging[`D${r + 1}`]?.v),
    );
    if (controls.length !== 1) {
      error(
        `${agingName}: one ${kind} prior/current/full EUR reconciliation is required`,
      );
      continue;
    }
    const sum = (lines: Line[]) =>
      lines
        .filter((line) => line.type === kind)
        .reduce((n, line) => n + line.amount, 0);
    for (const [column, expected] of [
      [1, sum(added)],
      [2, sum(old)],
      [3, sum(added) + sum(old)],
    ]) {
      const actual = validCell(aging, agingName, controls[0], column);
      if (!numeric(actual) || Math.abs(actual - expected) > 0.005)
        error(
          `${agingName}: ${kind} EUR classification does not reconcile with source totals`,
        );
    }
  }
  const total = ledger.reduce((sum, line) => sum + line.amount, 0);
  const end = XLSX.utils.decode_range(all["!ref"] ?? "A1").e.r;
  const totals = Array.from({ length: end + 1 }, (_, r) => ({
    r,
    cell: all[`L${r + 1}`],
  })).filter(({ cell }) => cell?.f && /^SUM\(L\d+:L\d+\)$/i.test(cell.f));
  if (totals.length !== 1)
    error("ALL: one cached EUR ledger control total is required");
  else {
    const value = validCell(all, "ALL", totals[0].r, 11);
    if (!numeric(value) || Math.abs(value - total) > 0.005)
      error(
        "ALL: detail EUR balances do not reconcile with cached control total",
      );
  }
  findings.push({
    severity: "review",
    message: `DEHK only: ${records.length} complete invoices including ${currentName}; aging calculated from invoice date + terms at ${cutoff}. Old/forecast sheets are not added; subsequent settlement notes do not reduce the month-end balance. DDC and shared receipts remain unchanged.`,
  });
  return finish();
}
