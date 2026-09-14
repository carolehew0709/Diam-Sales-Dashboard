import * as XLSX from 'xlsx';
import { EntityWeekSnapshot, OrderBookLine } from './types';

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const text = (value: unknown) => String(value ?? '').trim();
const monthValues = (row: unknown[], start: number) => Array.from({ length: 12 }, (_, index) => number(row[start + index]));
const cleanType = (value: unknown): OrderBookLine['customerType'] => {
  const valueText = text(value).toLowerCase();
  if (valueText === 'external') return 'External';
  if (valueText === 'group' || valueText === 'internal') return 'Group';
  return 'Unclassified';
};
const cleanDgc = (value: unknown): OrderBookLine['dgc'] => {
  const valueText = text(value).toUpperCase();
  if (valueText === 'E' || valueText === 'G') return valueText;
  return 'Unclassified';
};

export type ParsedWorkbook = {
  sheets: { name: string; rows: number; weeks: string[]; kind: string }[];
  lines: OrderBookLine[];
  snapshots: EntityWeekSnapshot[];
  findings: string[];
};

function parseWeeklySheet(rows: unknown[][], sheetName: string, fileName: string): { lines: OrderBookLine[]; snapshot?: EntityWeekSnapshot } {
  // XLSX normalizes the source range to its first used column (B) when reading this template.
  const entityName = text(rows[1]?.[3]);
  const weekText = text(rows[3]?.[3]);
  const month = text(rows[5]?.[3]);
  const weekMatch = weekText.match(/^W(\d+)$/i);
  if (!entityName || !weekMatch) return { lines: [] };
  const week = Number(weekMatch[1]);
  const lines: OrderBookLine[] = [];
  for (let rowIndex = 23; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const product = text(row[1]);
    const customer = text(row[3]);
    const hasAmounts = row.slice(10, 35).some((value) => value !== null && value !== undefined && value !== '');
    if (!product && !customer && !hasAmounts) continue;
    if (!product && !customer) continue;
    const monthly2026 = monthValues(row, 10);
    const monthly2027 = monthValues(row, 23);
    lines.push({
      id: `${fileName}:${sheetName}:${rowIndex + 1}`,
      entityId: entityName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      entityName,
      week,
      product,
      customer,
      customerType: cleanType(row[2]),
      dgc: cleanDgc(row[5]),
      quantity: row[4] === null || row[4] === undefined ? undefined : number(row[4]),
      total2026: number(row[7]),
      total2027: number(row[8]),
      monthly2026,
      monthly2027,
      sourceFile: fileName,
      sourceSheet: sheetName,
      sourceRow: rowIndex + 1,
    });
  }
  const sourceCheck = text(rows[20]?.[6]).toUpperCase() === 'OK' ? 'OK' : 'Review';
  const snapshot: EntityWeekSnapshot = {
    entityId: entityName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    entityName,
    week,
    month,
    ytdTurnoverExternal: number(rows[9]?.[4]),
    ytdTurnoverGroup: number(rows[10]?.[4]),
    currentMonthTurnoverExternal: number(rows[9]?.[6]),
    currentMonthTurnoverGroup: number(rows[10]?.[6]),
    orderbook2026External: number(rows[16]?.[7]),
    orderbook2026Group: number(rows[17]?.[7]),
    orderbook2027External: number(rows[16]?.[8]),
    orderbook2027Group: number(rows[17]?.[8]),
    forecast2026: number(rows[11]?.[11]),
    newOrders2026: 0,
    sourceFile: fileName,
    sourceSheet: sheetName,
    sourceCheck,
  };
  return { lines, snapshot };
}

export function parseDashboardWorkbook(bytes: Buffer, fileName: string): ParsedWorkbook {
  const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true, cellFormula: true });
  const sheets = workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null }) as unknown[][];
    const textContent = rows.flat().filter(Boolean).map(String).join(' ');
    const weeks = [...new Set(textContent.match(/W\d+/g) ?? [])];
    return { name, rows: rows.length, weeks, kind: /^W\d+$/i.test(name) ? 'weekly orderbook' : /synth/i.test(name) ? 'entity snapshot' : /data weekly/i.test(name) ? 'weekly summary' : /budget recap/i.test(name) ? 'budget' : 'supporting' };
  });
  const lines: OrderBookLine[] = [];
  const snapshots: EntityWeekSnapshot[] = [];
  for (const sheet of sheets.filter((item) => /^W\d+$/i.test(item.name))) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet.name], { header: 1, defval: null }) as unknown[][];
    const parsed = parseWeeklySheet(rows, sheet.name, fileName);
    lines.push(...parsed.lines);
    if (parsed.snapshot) snapshots.push(parsed.snapshot);
  }
  const orderedSnapshots = [...snapshots].sort((a, b) => a.week - b.week);
  orderedSnapshots.forEach((snapshot, index) => {
    const previous = orderedSnapshots[index - 1];
    snapshot.newOrders2026 = previous ? snapshot.forecast2026 - previous.forecast2026 : snapshot.forecast2026;
  });
  const findings: string[] = [];
  if (!sheets.some((sheet) => sheet.kind === 'weekly orderbook' || sheet.kind === 'entity snapshot' || sheet.kind === 'weekly summary')) findings.push('No W1-W52, Synth, or Data Weekly sheet found');
  if (snapshots.some((snapshot) => snapshot.sourceCheck !== 'OK')) findings.push('One or more weekly orderbook checks require review');
  if (lines.some((line) => line.customerType === 'Unclassified')) findings.push('Some order lines have no External/Group classification');
  return { sheets, lines, snapshots, findings };
}
