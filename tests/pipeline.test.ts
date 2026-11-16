import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import {
  parsePipelineWorkbook,
  validPipelineDate,
} from "../lib/pipeline-workbook";
import {
  pipelineFilters,
  pipelineForWeek,
  pipelineMovement,
  pipelineRows,
  pipelineTotals,
  weekLabel,
  weekStart,
  type PipelineSnapshot,
} from "../lib/pipeline";
import type { User } from "../lib/types";

const headings = [
  "商机编号",
  "商机名称",
  "项目编号.项目编码",
  "组织",
  "商业状态",
  "结算币别.名称",
  "预计收入",
  "制单时间",
  "输赢日期",
  "销售组",
  "客户",
  "品牌.名称",
  "币别.名称",
  "销售阶段进度条",
  "重点项目",
];
const rows = [
  [
    "A",
    "Alpha",
    "P",
    "DEHK",
    "执行中",
    "欧元",
    50,
    "2026-10-29",
    "",
    "Team",
    "",
    "Brand",
    "美元",
    "🔵报价",
    "是",
  ],
  [
    "B",
    "Beta",
    "P",
    "DEHK",
    "输单",
    "欧元",
    null,
    "2026-11-02",
    "2026-11-16",
    "Team",
    "",
    "Brand",
  ],
  [
    "C",
    "Other",
    "Q",
    "迪亚姆展示设备（昆山）有限公司",
    "赢单",
    "人民币",
    0,
    "2026-11-16",
    "",
    "Team",
    "Customer",
    "Brand",
  ],
];

function workbook(records = rows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([headings, ...records]),
    "列表数据",
  );
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("Pipeline preserves grain, original currency, source filters and missing income", () => {
  const parsed = parsePipelineWorkbook(workbook(), "2026-11-16");
  assert.equal(parsed.currencyConflicts, 1);
  assert.deepEqual(
    parsed.rows.map((row) => [
      row.entityId,
      row.currency,
      row.amount,
      row.customerGroup,
    ]),
    [
      ["dhk", "EUR", 50, "Brand"],
      ["dhk", "EUR", null, "Brand"],
      ["ddc", "RMB", 0, "Brand"],
    ],
  );
  assert.equal(parsed.rows[0].stage, "quote");
  assert.equal(parsed.rows[0].keyProject, true);
  assert.deepEqual(pipelineTotals(parsed.rows), {
    projects: 2,
    opportunities: 3,
    withoutAmount: 1,
    amounts: { EUR: 50, RMB: 0, USD: null },
  });
  assert.throws(
    () => parsePipelineWorkbook(workbook([rows[0], rows[0]]), "2026-11-16"),
    /invalidRow:3/,
  );
  assert.throws(
    () => parsePipelineWorkbook(workbook(), "2026-11-15"),
    /dateBeforeSource:3/,
  );
  assert.equal(validPipelineDate("2026-02-29"), false);
});

test("Pipeline uses creation and loss dates and only serves authorized weekly snapshots", () => {
  const parsed = parsePipelineWorkbook(workbook(), "2026-11-16");
  const make = (entityId: string, asOf: string): PipelineSnapshot => ({
    entityId,
    asOf,
    id: asOf + entityId,
    fileName: "test.xlsx",
    fingerprint: "synthetic",
    sheet: parsed.sheet,
    rows: parsed.rows.filter(
      (row) => row.entityId === entityId && row.created <= asOf,
    ),
  });
  const snapshots = [
    make("dhk", "2026-10-30"),
    make("dhk", "2026-11-16"),
    make("ddc", "2026-11-16"),
  ];
  const reader: User = {
    id: "viewer",
    name: "Viewer",
    email: "viewer@example.invalid",
    role: "viewer",
    region: "APAC",
    crossRegionView: false,
    permissions: { dhk: ["view"] },
  };
  const data = pipelineForWeek(snapshots, reader, null);
  assert.deepEqual(data.weeks, ["2026-11-16", "2026-10-26"]);
  assert.deepEqual(
    data.current.map((s) => s.entityId),
    ["dhk"],
  );
  assert.equal(data.previous[0].asOf, "2026-10-30");
  const scoped = pipelineRows(data.current, {
    ...pipelineFilters,
    group: "Brand",
    customer: "__missing__",
  });
  const movement = pipelineMovement(scoped, "2026-11-16");
  assert.deepEqual(
    [
      movement.ytdAdded,
      movement.ytdLost,
      movement.weekAdded,
      movement.weekLost,
    ],
    [2, 1, 0, 1],
  );
  assert.deepEqual(movement.trend.at(-1), {
    week: "2026-11-16",
    added: 2,
    lost: 1,
  });
  assert.equal(
    pipelineForWeek(snapshots, reader, "2026-10-26").current[0].asOf,
    "2026-10-30",
  );
  assert.equal(weekLabel(weekStart("2027-01-01")), "2026 · W53");
});
