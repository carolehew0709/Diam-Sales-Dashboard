import * as XLSX from "xlsx";
import type {
  OpsCurrency,
  OpsOrderLine,
  OpsPayment,
  OpsReceivable,
  OpsReceivableLink,
  OpsShipment,
  SalesOperationsSnapshot,
} from "./sales-operations-types";

type Workbook = { file: string; bytes: Buffer };
type Values = (column: string, row: number) => unknown;
const org = "迪亚姆展示设备昆山有限公司";
const text = (value: unknown) => String(value ?? "").trim();
const company = (value: unknown) => text(value).replace(/[()（）\s]/g, "");
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const money = (value: unknown) => number(value);
const key = (order: string, line: number) => JSON.stringify([order, line]);
const linkKey = (order: string, line: number, document: string) =>
  JSON.stringify([order, line, document]);
const sameAmount = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < 0.011;

function currency(value: unknown): OpsCurrency {
  switch (text(value)) {
    case "欧元":
    case "EUR":
      return "EUR";
    case "人民币":
    case "CNY":
      return "CNY";
    default:
      throw new Error("Unsupported ERP source currency");
  }
}

function date(value: unknown) {
  const source = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source) || isNaN(Date.parse(source)))
    throw new Error("Invalid ERP business date");
  return source;
}

function worksheet(
  workbook: Workbook,
  headers: Record<string, string>,
  headerRow: number,
) {
  // Some ERP exports advertise A1 as their entire range. Read actual cell coordinates.
  const book = XLSX.read(workbook.bytes, {
    type: "buffer",
    nodim: true,
    sheets: "sheet1",
  });
  const sheet = book.Sheets.sheet1;
  const value: Values = (column, row) => {
    const cell = sheet?.[column + row];
    if (cell?.t === "e" || (cell?.f && cell.v == null))
      throw new Error(
        `${workbook.file}: invalid Excel value at ${column}${row}`,
      );
    return cell?.v;
  };
  if (
    !sheet?.["!ref"] ||
    Object.entries(headers).some(([c, h]) => text(value(c, headerRow)) !== h)
  )
    throw new Error(`${workbook.file}: unrecognized ERP export layout`);
  return {
    value,
    last: XLSX.utils.decode_range(sheet["!ref"]).e.r + 1,
    source: { file: workbook.file, sheet: "sheet1" },
  };
}

function orderRows(
  value: Values,
  last: number,
  columns: { line: string; item: string; type: string },
) {
  const rows: {
    order: string;
    line: number;
    row: number;
    header: number;
    startsLine: boolean;
  }[] = [];
  let order = "",
    line: number | null = null,
    header = 0;
  for (let row = 5; row <= last; row++) {
    if (number(value("A", row)) == null) continue;
    if (text(value("D", row))) {
      order = text(value("D", row));
      header = row;
      line = null;
      if (company(value("C", row)) !== org || !text(value(columns.type, row)))
        throw new Error(`Order export: unexpected Entity at row ${row}`);
    }
    const index = number(value(columns.line, row));
    if (index !== null) line = index;
    if (
      !order ||
      line === null ||
      !Number.isInteger(line) ||
      (index !== null && !text(value(columns.item, row)))
    )
      throw new Error(`Order export: missing order line at row ${row}`);
    rows.push({ order, line, row, header, startsLine: index !== null });
  }
  return rows;
}

export function parseSalesOperations(
  summary: Workbook,
  detail: Workbook,
  finance: Workbook,
  receipts: Workbook,
): SalesOperationsSnapshot {
  const ss = worksheet(
    summary,
    {
      D: "订单编号",
      J: "订单行号",
      S: "含税金额",
      Z: "已出金额",
      AB: "未出金额",
      AM: "财务应收金额",
    },
    4,
  );
  const dd = worksheet(
    detail,
    {
      D: "订单编号",
      K: "订单行号",
      AA: "单据编号",
      AB: "业务日期",
      AQ: "单据编号",
      AW: "业务日期",
    },
    4,
  );
  const ar = worksheet(
    finance,
    {
      A: "*单据编号",
      Y: "价税合计",
      AM: "销售组.名称",
      EZ: "发票号码",
      FW: "核心单据号",
      GF: "核心单据行号",
    },
    1,
  );
  const rv = worksheet(
    receipts,
    {
      A: "*单据编号",
      U: "*收款金额",
      EI: "实收金额",
      EZ: "已核销金额",
      FF: "源单分录ID",
      ID: "源单编码",
    },
    1,
  );
  const window = (value: Values) =>
    text(value("A", 2)).match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const [from, asOf] = window(ss.value);
  if (
    !from ||
    !asOf ||
    from > asOf ||
    window(dd.value).join() !== [from, asOf].join() ||
    ![ss, dd].every(({ value }) =>
      text(value("A", 2)).includes("单据状态：已审核"),
    )
  )
    throw new Error(
      "Execution reports must share an approved order-date scope",
    );

  const lines = new Map<string, OpsOrderLine>();
  const shippedQty = new Map<string, number | null>();
  for (const { order, line, row, header, startsLine } of orderRows(
    ss.value,
    ss.last,
    { line: "J", item: "L", type: "E" },
  )) {
    const id = key(order, line);
    const orderDate = date(ss.value("G", header));
    const quantity = number(ss.value("R", row));
    if (
      !startsLine ||
      lines.has(id) ||
      orderDate < from ||
      orderDate > asOf ||
      quantity === null
    )
      throw new Error(`Invalid or repeated summary order line at row ${row}`);
    lines.set(id, {
      order,
      line,
      date: orderDate,
      customer: text(ss.value("H", header)),
      currency: currency(ss.value("I", header)),
      item: text(ss.value("L", row)),
      description: text(ss.value("M", row)),
      quantity,
      ordered: money(ss.value("S", row)),
      shipped: money(ss.value("Z", row)),
      open: money(ss.value("AB", row)),
      openQuantity: number(ss.value("AA", row)) ?? 0,
      team: null,
      sourceRow: row,
    });
    shippedQty.set(id, number(ss.value("Y", row)));
  }

  const observed = new Set<string>();
  const shipmentTotals = new Map<
    string,
    { quantity: number; amount: number | null }
  >();
  const shipments: OpsShipment[] = [];
  const links = new Map<string, OpsReceivableLink>();
  for (const { order, line, row, header, startsLine } of orderRows(
    dd.value,
    dd.last,
    { line: "K", item: "M", type: "E" },
  )) {
    const id = key(order, line);
    const parent = lines.get(id);
    if (!parent)
      throw new Error(`Detail has no summary order line at row ${row}`);
    if (startsLine) {
      if (
        observed.has(id) ||
        date(dd.value("G", header)) !== parent.date ||
        text(dd.value("H", header)) !== parent.customer ||
        currency(dd.value("J", header)) !== parent.currency ||
        text(dd.value("M", row)) !== parent.item ||
        !sameAmount(number(dd.value("T", row)), parent.quantity) ||
        !sameAmount(money(dd.value("U", row)), parent.ordered)
      )
        throw new Error(
          `Execution reports disagree at order detail row ${row}`,
        );
      observed.add(id);
    }
    const shipment = text(dd.value("AA", row));
    if (shipment) {
      const quantity = number(dd.value("AC", row));
      if (quantity === null)
        throw new Error(`Shipment quantity missing at row ${row}`);
      const amount = money(dd.value("AD", row));
      shipments.push({
        order,
        line,
        document: shipment,
        date: date(dd.value("AB", row)),
        currency: parent.currency,
        quantity,
        amount,
        sourceRow: row,
      });
      const total = shipmentTotals.get(id) ?? { quantity: 0, amount: null };
      total.quantity += quantity;
      if (amount !== null) total.amount = (total.amount ?? 0) + amount;
      shipmentTotals.set(id, total);
    }
    const receivable = text(dd.value("AQ", row));
    if (receivable)
      links.set(linkKey(order, line, receivable), {
        order,
        line,
        document: receivable,
      });
  }
  if (!lines.size || observed.size !== lines.size)
    throw new Error("Execution reports have different order-line coverage");
  for (const [id, line] of lines) {
    const total = shipmentTotals.get(id);
    if (
      !sameAmount(total?.quantity ?? 0, shippedQty.get(id) ?? 0) ||
      !sameAmount(total?.amount ?? null, line.shipped)
    )
      throw new Error(
        `Shipment does not reconcile at summary row ${line.sourceRow}`,
      );
  }

  const referenced = new Set(
    [...links.values()].map(({ document }) => document),
  );
  const matchedLinks = new Set<string>();
  const teams = new Map<string, Set<string>>();
  const receivables = new Map<string, OpsReceivable>();
  for (let row = 2; row <= ar.last; row++) {
    const document = text(ar.value("A", row));
    if (!referenced.has(document)) continue;
    if (
      text(ar.value("B", row)) !== "已审核" ||
      company(ar.value("AF", row)) !== org
    )
      throw new Error(`Receivable outside approved DDC scope at row ${row}`);
    const order = text(ar.value("FW", row)),
      line = number(ar.value("GF", row));
    const amount = money(ar.value("Y", row));
    const invoice = text(ar.value("EZ", row));
    if (amount === null)
      throw new Error(`Missing receivable amount at row ${row}`);
    const current = {
      document,
      date: date(ar.value("N", row)),
      due: text(ar.value("O", row)),
      currency: currency(ar.value("Z", row)),
      amount,
      settled: money(ar.value("CF", row)),
      balance: money(ar.value("BC", row)),
      status: text(ar.value("AY", row)),
      invoices: invoice ? [invoice] : [],
      sourceRow: row,
    };
    const prior = receivables.get(document);
    if (prior) {
      if (
        prior.currency !== current.currency ||
        prior.date !== current.date ||
        prior.status !== current.status ||
        !sameAmount(prior.amount, current.amount) ||
        !sameAmount(prior.settled, current.settled) ||
        !sameAmount(prior.balance, current.balance)
      )
        throw new Error(`Conflicting receivable header amounts at row ${row}`);
      if (invoice && !prior.invoices.includes(invoice))
        prior.invoices.push(invoice);
    } else receivables.set(document, current);
    const match = line !== null ? linkKey(order, line, document) : "";
    if (line !== null && links.has(match)) {
      matchedLinks.add(match);
      const team = text(ar.value("AM", row));
      const id = key(order, line);
      if (team) {
        const options = teams.get(id) ?? new Set<string>();
        options.add(team);
        teams.set(id, options);
      }
    }
  }
  if (matchedLinks.size !== links.size)
    throw new Error("A referenced receivable is missing its order-line link");
  for (const [id, options] of teams)
    if (options.size === 1) lines.get(id)!.team = [...options][0];

  const payments: OpsPayment[] = [],
    paymentEntries = new Set<string>();
  for (let row = 2; row <= rv.last; row++) {
    const receivable = text(rv.value("ID", row));
    if (
      !receivables.has(receivable) ||
      text(rv.value("HM", row)) !== "销售回款"
    )
      continue;
    const receipt = text(rv.value("A", row)),
      receivableEntry = text(rv.value("FF", row));
    const received = money(rv.value("EI", row)),
      settled = money(rv.value("EZ", row));
    const id = JSON.stringify([receipt, receivable, receivableEntry]);
    if (
      company(rv.value("M", row)) !== org ||
      text(rv.value("B", row)) !== "已收款" ||
      text(rv.value("BF", row)) !== "财务应收单" ||
      !receipt ||
      !receivableEntry ||
      received === null ||
      settled === null ||
      paymentEntries.has(id)
    )
      throw new Error(`Invalid or repeated receipt allocation at row ${row}`);
    paymentEntries.add(id);
    payments.push({
      receipt,
      receivable,
      receivableEntry,
      date: date(rv.value("N", row)),
      currency: currency(rv.value("AV", row)),
      received,
      settled,
      sourceRow: row,
    });
  }
  return {
    entityId: "ddc",
    from,
    asOf,
    sources: [ss.source, dd.source, ar.source, rv.source],
    lines: [...lines.values()],
    shipments,
    receivables: [...receivables.values()],
    receivableLinks: [...links.values()],
    payments,
  };
}
