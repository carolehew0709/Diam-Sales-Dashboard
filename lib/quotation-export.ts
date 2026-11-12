import type { QuoteLine } from "./quotation-workbook";

export async function buildQuotationWorkbook(
  lines: { line: QuoteLine; cost: number; unit: number; cents: number }[],
  options: { title: string; headers: string[]; markup: number; markupLabel: string; currency: string; totalLabel: string },
) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(options.title);
  sheet.views = [{ state: "frozen", ySplit: 3 }];
  sheet.addRow([options.markupLabel, options.markup / 100, options.currency]);
  sheet.getCell("B1").numFmt = "0.00%";
  sheet.addRow([]);
  const header = sheet.addRow(options.headers);
  const widths = [32, 44, 20, 28, 12, 19, 19, 22];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  header.height = 24;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF26241F" } };
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
    cell.alignment = { vertical: "middle" };
  });
  const money = `"${options.currency} "#,##0.00`;
  for (const { line, cost, unit, cents } of lines) {
    const row = sheet.addRow([line.item, line.description, "", line.size, Number(line.quantity), cost]);
    const r = row.number;
    row.height = line.picture ? 70 : 32;
    row.alignment = { vertical: "middle", wrapText: true };
    sheet.getCell(`G${r}`).value = { formula: `ROUND(F${r}*(1+$B$1),2)`, result: unit };
    sheet.getCell(`H${r}`).value = { formula: `ROUND(G${r}*E${r},2)`, result: cents / 100 };
    for (const column of ["F", "G", "H"]) sheet.getCell(column + r).numFmt = money;
    if (line.picture) {
      const { data, width, height } = line.picture;
      const scale = Math.min(112 / width, 78 / height);
      const id = workbook.addImage({ base64: data, extension: "jpeg" });
      sheet.addImage(id, { tl: { col: 2.08, row: r - 0.94 }, ext: { width: width * scale, height: height * scale }, editAs: "oneCell" });
    }
  }
  const total = sheet.addRow([options.totalLabel]);
  total.font = { bold: true };
  const cell = total.getCell(8);
  cell.numFmt = money;
  cell.value = { formula: `SUM(H4:H${total.number - 1})`, result: lines.reduce((sum, row) => sum + row.cents, 0) / 100 };
  return workbook.xlsx.writeBuffer();
}
