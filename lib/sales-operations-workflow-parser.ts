import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { isDehkOrder } from "./sales-operations-pricing";
import type { OpsOriginalCurrency } from "./sales-operations-types";
import type {
  OperationsEntity,
  OperationsWorkflowDataset,
  OperationsWorkflowRecord,
} from "./sales-operations-workflow-types";

type Workbook = { file: string; bytes: Buffer };
const organizations = { DDC: "迪亚姆展示设备昆山有限公司", DEHK: "DEHK" };
const text = (value: unknown) => String(value ?? "").trim();
const organization = (value: unknown) =>
  text(value)
    .replace(/[()（）\s]/g, "")
    .toUpperCase();
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function currency(value: unknown): OpsOriginalCurrency {
  const code = text(value);
  if (code === "CNY" || code === "EUR" || code === "USD" || code === "HKD")
    return code;
  throw new Error("Unsupported source currency in operations register");
}

function date(value: unknown) {
  const day = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)))
    throw new Error("Invalid operations business date");
  return day;
}

const schemas = {
  orders: {
    A: "*单据编号",
    B: "*单据状态",
    M: "销售组织.名称",
    Q: "销售组.名称",
    U: "订货客户.名称",
    AD: "*结算币种.货币代码",
    BL: "*订单日期",
    GD: "*物料编码.编码",
    IZ: "*数量",
    JK: "价税合计",
  },
  receipts: {
    A: "*单据编号",
    B: "*单据状态",
    M: "收款组织.名称",
    N: "*业务日期",
    U: "*收款金额",
    AV: "*收款币种.货币代码",
    BU: "付款单位.名称",
    CW: "单据类型.名称",
    EF: "关联方/非关联方（客户）.名称",
  },
} as const;

export function parseOperationsRegister(
  workbook: Workbook,
  kind: keyof typeof schemas,
  entity: OperationsEntity,
  from: string,
  asOf: string,
): OperationsWorkflowDataset {
  if (date(from) > date(asOf))
    throw new Error("The reporting window is reversed");
  const sheetName = "sheet1";
  const sheet = XLSX.read(workbook.bytes, {
    type: "buffer",
    sheets: sheetName,
    nodim: true,
  }).Sheets[sheetName];
  const value = (col: string, row: number) => {
    const cell = sheet?.[col + row];
    if (cell?.t === "e" || (cell?.f && cell.v == null))
      throw new Error(`${workbook.file}: invalid source value at ${col}${row}`);
    return cell?.v;
  };
  if (
    !sheet?.["!ref"] ||
    Object.entries(schemas[kind]).some(
      ([col, name]) => text(value(col, 1)) !== name,
    )
  )
    throw new Error(`${workbook.file}: unsupported operations export layout`);
  const records: OperationsWorkflowRecord[] = [];
  const byReceipt = new Map<string, OperationsWorkflowRecord>();
  const last = XLSX.utils.decode_range(sheet["!ref"]).e.r + 1;
  for (let row = 2; row <= last; row++) {
    const document = text(value("A", row));
    if (!document) continue;
    if (organization(value("M", row)) !== organizations[entity])
      throw new Error(`${workbook.file}: wrong organization at row ${row}`);
    const day = date(value(kind === "orders" ? "BL" : "N", row));
    if (day < from || day > asOf) continue;
    const status = text(value("B", row));
    if (kind === "orders") {
      if (status !== "已审核") continue;
      const customer = text(value("U", row));
      if (entity === "DDC" && isDehkOrder({ customer })) continue;
      const quantity = number(value("IZ", row));
      if (!customer || quantity === null)
        throw new Error(
          `${workbook.file}: unverifiable order line at row ${row}`,
        );
      records.push({
        entity,
        document,
        date: day,
        customer,
        team: text(value("Q", row)) || null,
        currency: currency(value("AD", row)),
        amount: number(value("JK", row)),
        quantity,
        item: text(value("GD", row)),
        sourceRow: row,
      });
      continue;
    }
    if (status !== "已收款" || text(value("CW", row)) !== "销售收款") continue;
    const customer = text(value("BU", row));
    const type = text(value("EF", row));
    const division =
      type === "非关联方" && !isDehkOrder({ customer })
        ? "external"
        : type === "关联方" || isDehkOrder({ customer })
          ? "internal"
          : "unknown";
    const current: OperationsWorkflowRecord = {
      entity,
      document,
      date: day,
      customer,
      team: null,
      currency: currency(value("AV", row)),
      amount: number(value("U", row)),
      sourceRow: row,
      division,
    };
    if (current.amount === null || !customer)
      throw new Error(`${workbook.file}: unverifiable receipt at row ${row}`);
    const previous = byReceipt.get(document);
    if (previous) {
      if (
        ["customer", "date", "currency", "amount", "division"].some(
          (key) =>
            previous[key as keyof typeof previous] !==
            current[key as keyof typeof current],
        )
      )
        throw new Error(
          `${workbook.file}: conflicting receipt header at row ${row}`,
        );
    } else byReceipt.set(document, current);
  }
  if (kind === "receipts") records.push(...byReceipt.values());
  return {
    entity,
    from,
    asOf,
    file: workbook.file,
    sheet: sheetName,
    fingerprint: createHash("sha256").update(workbook.bytes).digest("hex"),
    records,
  };
}
