import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { chartSheetName, createChartWorkbook } from "../lib/chart-workbook";
import type { ChartWorkbookImage } from "../lib/chart-workbook-types";
import { performanceChartContext } from "../lib/chart-workbook-context";
import type { Dashboard } from "../lib/dashboard";

const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZFEAAAAASUVORK5CYII=";
const sample: ChartWorkbookImage = {
  name: "China / 客户同比: 2026? [August]",
  title: "客户同比",
  context: "2026-08 · China · kEUR",
  note: "Source: Graphics.xlsx · Tiger Plan Aug data",
  table: {
    columns: [
      { label: "Customer" },
      { label: "YTD kEUR" },
      { label: "YoY", format: "0.0%" },
    ],
    rows: [
      ["DCP", 260.81449, null],
      ["=literal customer", null, 0.23443538],
    ],
    summaryRows: [0],
  },
  image: pixel,
  imageWidth: 800,
  imageHeight: 450,
};

test("chart workbook preserves numeric precision, missing values and literal source text; one image below each table", async () => {
  const bytes = await createChartWorkbook([
    sample,
    { ...sample, title: "Second chart" },
  ]);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  assert.equal(book.worksheets.length, 2);
  assert.equal(
    new Set(book.worksheets.map((s) => s.name.toLowerCase())).size,
    2,
  );
  for (const sheet of book.worksheets) {
    assert.ok(sheet.name.length <= 31 && !/[\\/?*\[\]:]/.test(sheet.name));
    assert.equal(sheet.getCell("B7").value, 260.81449);
    assert.equal(sheet.getCell("C7").value, null);
    assert.equal(sheet.getCell("B8").value, null);
    assert.equal(sheet.getCell("A8").value, "=literal customer");
    assert.equal(sheet.getCell("C8").value, 0.23443538);
    assert.equal(sheet.getCell("C8").numFmt, "0.0%");
    assert.equal(sheet.getCell("A3").value, sample.context);
    assert.equal(sheet.getCell("A4").value, sample.note);
    const images = sheet.getImages();
    assert.equal(images.length, 1);
    assert.ok(
      images[0].range.tl.nativeRow > 8,
      "image must start below last data row",
    );
    assert.equal(images[0].range.tl.nativeCol, 0);
    assert.equal(sheet.views[0].showGridLines, false);
    for (let col = 1; col <= 3; col++) {
      for (let row = 6; row <= 8; row++) {
        assert.equal(
          sheet.getCell(row, col).alignment.horizontal,
          "center",
          "every table cell uses the same alignment, including empty numeric cells",
        );
      }
    }
    assert.equal(sheet.getCell("A7").font.bold, true);
    assert.equal(sheet.getCell("B7").font.bold, true);
    assert.equal(sheet.getCell("B7").fill.type, "pattern");
    assert.equal(sheet.getCell("B7").border.top?.style, "medium");
  }
});

test("Excel tab names stay unique after truncation and case folding", () => {
  const used = new Set<string>();
  const a = chartSheetName("A".repeat(50), used);
  const b = chartSheetName("a".repeat(50), used);
  assert.ok(
    a.length <= 31 && b.length <= 31 && a.toLowerCase() !== b.toLowerCase(),
  );
  assert.equal(chartSheetName("''", used), "Chart");
  assert.equal(chartSheetName("a".repeat(30) + " tail", used), "a".repeat(30));
});

test("empty exports and nonfinite chart numbers fail explicitly", async () => {
  await assert.rejects(createChartWorkbook([]));
  await assert.rejects(
    createChartWorkbook([
      { ...sample, table: { ...sample.table, rows: [["Bad", NaN, null]] } },
    ]),
  );
});

test("export context translates filters while preserving source evidence; workbook metadata follows chosen language", async () => {
  const data = {
    filters: {
      year: 2026,
      region: "China",
      bu: "all",
      salesType: "all",
      salesTeam: "all",
      scenario: "Sales + Prospect",
    },
    weeks: [42],
    rows: [{ snapshot: { sourceFile: "原始来源.xlsx" } }],
  } as Dashboard;
  const english = performanceChartContext(data, "en"),
    chinese = performanceChartContext(data, "zh-CN");
  assert.ok(english.includes("China") && english.includes("All sales"));
  assert.ok(chinese.includes("中国") && chinese.includes("全部销售"));
  assert.ok(
    english.includes("W42") &&
      english.includes("原始来源.xlsx") &&
      chinese.includes("原始来源.xlsx"),
  );
  const bytes = await createChartWorkbook([sample], "zh-CN");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  assert.equal(book.title, "DIAM 亚太区图表与数据");
  assert.ok(book.description.includes("数据表在上"));
  assert.equal(book.worksheets[0].getCell("B7").value, 260.81449);
});
