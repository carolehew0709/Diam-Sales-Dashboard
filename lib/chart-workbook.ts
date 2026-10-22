import ExcelJS from "exceljs";
import type { ChartWorkbookImage } from "./chart-workbook-types";

export function chartSheetName(title: string, used: Set<string>) {
  const clean =
    title
      .replace(/[\\/?*\[\]:\x00-\x1f]/g, " ")
      .replace(/^'+|'+$/g, "")
      .trim() || "Chart";
  let name = clean.slice(0, 31),
    suffix = 1;
  while (used.has(name.toLowerCase())) {
    const tail = ` (${++suffix})`;
    name = clean.slice(0, 31 - tail.length) + tail;
  }
  used.add(name.toLowerCase());
  return name;
}
const textLength = (value: string) =>
  Array.from(value).reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 2 : 1), 0);

/** Application download writer: one rendered chart and its exact source table per sheet. */
export async function createChartWorkbook(sheets: ChartWorkbookImage[]) {
  if (!sheets.length) throw new Error("No registered charts");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DIAM APAC";
  workbook.title = "DIAM APAC chart data and graphics";
  workbook.description =
    "Filtered chart snapshots. Tables above images; missing data remains blank. Images do not recalculate when cells are edited.";
  const used = new Set<string>();
  for (const source of sheets) {
    const sheet = workbook.addWorksheet(chartSheetName(source.name, used), {
      views: [{ showGridLines: false, zoomScale: 90 }],
      properties: { defaultRowHeight: 22, tabColor: { argb: "FFA77A35" } },
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.35,
          bottom: 0.35,
          header: 0.15,
          footer: 0.15,
        },
      },
    });
    const count = Math.max(source.table.columns.length, 4);
    const widths = Array.from({ length: count }, (_, i) =>
      Math.max(
        18,
        Math.min(
          46,
          Math.max(
            textLength(source.table.columns[i]?.label ?? ""),
            ...source.table.rows.map((r) =>
              typeof r[i] === "string"
                ? Math.min(46, textLength(r[i] as string))
                : 16,
            ),
          ) + 2,
        ),
      ),
    );
    const totalWidth = widths.reduce((n, w) => n + w, 0);
    if (totalWidth < 112)
      widths.forEach((_, i) => {
        widths[i] += (112 - totalWidth) / count;
      });
    widths.forEach((width, i) => {
      sheet.getColumn(i + 1).width = width;
    });
    sheet.mergeCells(1, 1, 1, count);
    sheet.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFA77A35" },
    };
    sheet.getRow(1).height = 5;
    const metadata = [source.title, source.context, source.note];
    for (let i = 0; i < metadata.length; i++) {
      const row = i + 2;
      sheet.mergeCells(row, 1, row, count);
      const cell = sheet.getCell(row, 1);
      cell.value = metadata[i];
      cell.font = {
        name: "Arial",
        size: i === 0 ? 16 : 10,
        bold: i === 0,
        color: { argb: i === 0 ? "FF171813" : "FF706F67" },
      };
      cell.alignment = {
        wrapText: true,
        vertical: "middle",
        horizontal: "left",
        indent: 1,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: i === 0 ? "FFF1E7D5" : "FFF7F5F0" },
      };
      sheet.getRow(row).height =
        i === 0
          ? 38
          : Math.max(
              28,
              Math.ceil(
                textLength(metadata[i]) /
                  (widths.reduce((n, w) => n + w, 0) - 6),
              ) *
                15 +
                8,
            );
    }
    const headerRow = 6;
    const header = sheet.getRow(headerRow);
    source.table.columns.forEach((column, i) => {
      const cell = header.getCell(i + 1);
      cell.value = column.label;
      cell.font = {
        name: "Arial",
        size: 10,
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF262B29" },
      };
      cell.alignment = {
        wrapText: true,
        vertical: "middle",
        horizontal: "center",
      };
      cell.border = {
        bottom: { style: "medium", color: { argb: "FFA77A35" } },
        right: { style: "thin", color: { argb: "FF505651" } },
      };
    });
    header.height = Math.max(
      36,
      ...source.table.columns.map(
        (c, i) => Math.ceil(textLength(c.label) / widths[i]) * 15 + 8,
      ),
    );
    source.table.rows.forEach((values, index) => {
      const row = sheet.getRow(headerRow + 1 + index);
      const summary = source.table.summaryRows?.includes(index) ?? false;
      let lines = 1;
      source.table.columns.forEach((column, i) => {
        const value = values[i] ?? null;
        if (typeof value === "number" && !Number.isFinite(value))
          throw new Error("Non-finite chart value");
        const cell = row.getCell(i + 1);
        // Strings always remain literal values, including customer names starting with =.
        cell.value = value;
        cell.font = {
          name: "Arial",
          size: 11,
          bold: summary || i === 0,
          color: { argb: "FF171813" },
        };
        cell.numFmt =
          column.format ??
          (typeof value === "number" ? "#,##0.00;-#,##0.00;0.00" : "General");
        cell.alignment = {
          wrapText: true,
          vertical: "middle",
          horizontal: "center",
        };
        if (typeof value === "string")
          lines = Math.max(
            lines,
            Math.ceil(textLength(value) / (widths[i] - 3)),
          );
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb: summary
              ? "FFE8D5AF"
              : index % 2 === 1
                ? "FFF1EEE6"
                : "FFFFFFFF",
          },
        };
        const edge = { style: "thin" as const, color: { argb: "FFD8D3C7" } };
        cell.border = {
          top: summary
            ? { style: "medium", color: { argb: "FFA77A35" } }
            : edge,
          bottom: edge,
          left: edge,
          right: edge,
        };
      });
      row.height = Math.max(summary ? 32 : 28, lines * 16 + 10);
    });
    const lastDataRow = headerRow + source.table.rows.length;
    const imageRow = lastDataRow + 3;
    const width = Math.min(
      1080,
      Math.round(widths.reduce((n, w) => n + w * 7 + 5, 0)),
    );
    const height = (width / source.imageWidth) * source.imageHeight;
    const imageId = workbook.addImage({
      base64: source.image,
      extension: "png",
    });
    sheet.addImage(imageId, {
      tl: { col: 0, row: imageRow - 1 },
      ext: { width, height },
      editAs: "oneCell",
    });
    const lastRow = imageRow + Math.ceil(height / ((22 * 4) / 3)) + 1;
    sheet.pageSetup.printArea = `A1:${sheet.getColumn(count).letter}${lastRow}`;
    sheet.state = "visible";
  }
  return workbook.xlsx.writeBuffer();
}
