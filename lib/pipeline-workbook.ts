import * as XLSX from "xlsx";
import { resolveEntity } from "./entities";
import {
  isoDate,
  type Opportunity,
  type PipelineCurrency,
  type PipelineStage,
  type PipelineStatus,
} from "./pipeline";

const settlement: Record<string, PipelineCurrency> = {
  EUR: "EUR",
  USD: "USD",
  CNY: "RMB",
  RMB: "RMB",
  欧元: "EUR",
  美元: "USD",
  人民币: "RMB",
};
const statuses: Record<string, PipelineStatus> = {
  执行中: "active",
  赢单: "won",
  输单: "lost",
};
const stages: Record<string, PipelineStage> = {
  报价: "quote",
  设计: "design",
  打样: "sample",
  生产: "production",
  已完成: "complete",
};
const required = [
  "商机编号",
  "商机名称",
  "项目编号.项目编码",
  "组织",
  "商业状态",
  "结算币别.名称",
  "预计收入",
  "制单时间",
];

function dateValue(value: unknown) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed
      ? isoDate(new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)))
      : null;
  }
  const calendar = String(value ?? "")
    .trim()
    .slice(0, 10);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(calendar)) return null;
  const date = new Date(calendar + "T00:00:00Z");
  return Number.isFinite(+date) && isoDate(date) === calendar ? calendar : null;
}

export function validPipelineDate(date: string) {
  return date.length === 10 && dateValue(date) === date;
}

export function parsePipelineWorkbook(bytes: Buffer, asOf: string) {
  const book = XLSX.read(bytes, { type: "buffer", cellFormula: true });
  const candidates = book.SheetNames.flatMap((sheet) => {
    const ws = book.Sheets[sheet];
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    const columns = new Map<string, number>();
    for (let c = range.s.c; c <= Math.min(range.e.c, 300); c++) {
      const label = String(
        ws[XLSX.utils.encode_cell({ r: 0, c })]?.v ?? "",
      ).trim();
      if (label) columns.set(label, c);
    }
    return required.every((name) => columns.has(name))
      ? [{ sheet, ws, range, columns }]
      : [];
  });
  if (candidates.length !== 1) throw new Error("pipeline.templateError");
  const { sheet, ws, range, columns } = candidates[0];
  if (range.e.r > 20_000) throw new Error("pipeline.templateError");
  const seen = new Set<string>();
  let currencyConflicts = 0;
  const rows: Opportunity[] = [];
  for (let r = 1; r <= range.e.r; r++) {
    const cell = (name: string) => {
      const c = columns.get(name);
      return c === undefined ? undefined : ws[XLSX.utils.encode_cell({ r, c })];
    };
    const text = (name: string) => String(cell(name)?.v ?? "").trim();
    const id = text("商机编号");
    const name = text("商机名称");
    const project = text("项目编号.项目编码");
    if (!id && !name && !project) continue;
    const organization = text("组织");
    const entity = resolveEntity(
      organization === "迪亚姆展示设备（昆山）有限公司" ? "DDC" : organization,
    );
    const status = statuses[text("商业状态")];
    const currency = settlement[text("结算币别.名称").toUpperCase()];
    const reportedCurrency = settlement[text("币别.名称").toUpperCase()];
    const conflicting = Boolean(
      reportedCurrency && reportedCurrency !== currency,
    );
    const created = dateValue(cell("制单时间")?.v);
    const decided = dateValue(cell("输赢日期")?.v);
    const modified = dateValue(cell("最后修改日期")?.v);
    const amount = cell("预计收入");
    const value = amount?.v;
    if (
      !id ||
      !name ||
      !project ||
      seen.has(id) ||
      !entity ||
      !Object.hasOwn(statuses, text("商业状态")) ||
      !Object.hasOwn(settlement, text("结算币别.名称").toUpperCase()) ||
      !currency ||
      !created ||
      (text("输赢日期") && !decided) ||
      amount?.t === "e" ||
      (amount?.f && typeof value !== "number") ||
      (value !== undefined &&
        value !== "" &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          Math.abs(value) > Number.MAX_SAFE_INTEGER))
    ) {
      throw new Error(`pipeline.invalidRow:${r + 1}`);
    }
    if ([created, decided, modified].some((date) => date && date > asOf))
      throw new Error(`pipeline.dateBeforeSource:${r + 1}`);
    seen.add(id);
    if (conflicting) currencyConflicts++;
    const brand = text("品牌.名称");
    const group = text("客户组") || text("客户集团") || text("Customer Group");
    const stage =
      text("销售阶段") ||
      text("销售阶段进度条").match(/🔵\s*(报价|设计|打样|生产|已完成)/u)?.[1] ||
      "";
    const key = text("重点项目") || text("Key Project");
    rows.push({
      id,
      name,
      project,
      entityId: entity.id,
      status,
      currency,
      created,
      decided,
      amount: typeof value === "number" ? value : null,
      stage: Object.hasOwn(stages, stage) ? stages[stage] : null,
      brand,
      team: text("销售组"),
      customer: text("客户"),
      customerGroup: group || brand,
      keyProject: /^(true|yes|y|1|是|重点)$/i.test(key),
      sourceRow: r + 1,
    });
  }
  if (!rows.length) throw new Error("pipeline.templateError");
  return { sheet, rows, currencyConflicts };
}
