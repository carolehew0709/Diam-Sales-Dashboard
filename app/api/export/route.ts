import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx-js-style';
import { getDashboardSnapshot } from '@/lib/dashboard';
import { entities, weekly } from '@/lib/seed';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sourceWeek = 37;
const title = `W${sourceWeek} · 11 Sep 2026 · APAC view · All sales · Sales + P1 · Reporting unit EUR K · FX 1 EUR = 1.18 USD`;

const colors = { ink: '171813', cream: 'F8F6F0', gold: 'A77D38', line: 'D9D4C9', muted: '6E706C', green: '3F8068', red: 'B25749' };
const thinBorder = { bottom: { style: 'thin', color: { rgb: colors.line } } };

function sheet(rows: unknown[][], merges: ReadonlyArray<XLSX.Range> = [], widths?: ReadonlyArray<number>) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = [...merges];
  ws['!cols'] = (widths ?? rows[0]?.map(() => 16)).map((wch) => ({ wch }));
  return ws;
}

function styleWorkbookSheet(ws: XLSX.WorkSheet, rows: unknown[][], headerRow = -1) {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:A1');
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      if (!ws[address]) continue;
      const value = ws[address].v;
      ws[address].s = { font: { name: 'Arial', sz: 10, color: { rgb: colors.ink } }, alignment: { vertical: 'center', wrapText: true }, border: thinBorder };
      if (row === 0) ws[address].s = { font: { name: 'Arial', sz: 14, bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: colors.ink } }, alignment: { vertical: 'center' } };
      if (row === 2) ws[address].s = { font: { name: 'Arial', sz: 10, italic: true, color: { rgb: colors.muted } }, fill: { patternType: 'solid', fgColor: { rgb: colors.cream } }, alignment: { vertical: 'center' } };
      if (row === headerRow) ws[address].s = { font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: colors.ink } }, alignment: { vertical: 'center', wrapText: true } };
      if (typeof value === 'number') ws[address].z = '#,##0.0;[Red](#,##0.0)';
      if (typeof value === 'string' && value.endsWith('%')) ws[address].s = { ...ws[address].s, font: { name: 'Arial', sz: 10, color: { rgb: value.startsWith('-') ? colors.red : colors.green } } };
    }
  }
  ws['!rows'] = [{ hpt: 24 }, { hpt: 8 }, { hpt: 22 }];
}

function formatPercent(value: number | null) { return value === null ? null : `${(value * 100).toFixed(1)}%`; }
function latestRecord(entityId: string) { return weekly.filter((row) => row.entityId === entityId && (row.sales !== 0 || row.forecast !== 0 || row.orderbook !== 0)).sort((a, b) => b.week - a.week)[0]; }

export function GET(request: Request) {
  const url = new URL(request.url);
  const entityFilter = url.searchParams.get('entity') ?? 'all';
  const scenario = url.searchParams.get('scenario') === 'Sales + P1' ? 'Sales + P1' : 'Sales';
  const snapshot = getDashboardSnapshot(entityFilter, scenario);
  const selected = snapshot.entities;

  const summary = [
    ['DIAM · APAC FOLLOW UP'], [], [title], [],
    ['Annual budget', null, 'Sales to date', null, 'Dashboard', null, 'P1 · W36 carried', null, 'Sales + P1', null, 'Residual gap'],
    [snapshot.totals.budget, null, snapshot.totals.sales, null, snapshot.totals.orderbook, null, snapshot.totals.p1, null, snapshot.totals.salesPlusP1, null, snapshot.totals.gap],
    [], ['Source mode', 'Excel-derived APAC snapshot', 'Selected entities', selected.length, 'Latest usable source', `W${Math.max(...snapshot.records.map((row) => row.week), 0)}`], [],
    ['Business Unit', 'Region', 'Budget', 'Sales', 'P1', 'Sales + P1', 'Coverage', 'Residual gap', 'Source'],
    ...selected.map((entity) => {
      const row = snapshot.records.find((record) => record.entityId === entity.id);
      const budget = entity.budget ?? 0;
      const combined = (row?.sales ?? 0) + (row?.p1 ?? 0);
      return [entity.name, entity.region, budget || null, row?.sales ?? 0, row?.p1 ?? 0, combined, formatPercent(budget ? combined / budget : null), budget ? budget - combined : null, entity.source];
    }),
  ];

  const selectedPda = snapshot.records.find((row) => row.entityId === 'pda') ?? snapshot.records[0];
  const weeklyReview = [
    ['DIAM · WEEKLY REVIEW'], [], [title], [], ['Business Unit', selectedPda ? 'PDA' : 'APAC', null, null, null, null, null, null, null, 'Change the selector to update the full matrix.'],
    ['W05–W26 use the frozen source history. Current workbook values are retained as source snapshots; missing fields remain visible for review.'],
    ['WEEKLY MONTHLY PROFILE · EUR K'], ['Snapshot', ...months, 'FY Total', 'Coverage', 'WoW', 'Source'],
    ...snapshot.records.filter((row) => row.entityId === (selectedPda?.entityId ?? '')).map((row, index, rows) => [
      `W${String(row.week).padStart(2, '0')}`, ...(row.monthValues ?? months.map(() => null)), row.monthValues?.reduce((sum, value) => sum + value, 0) ?? row.sales, row.budget ? formatPercent(row.sales / row.budget) : null, index ? row.sales - rows[index - 1].sales : null, row.source,
    ]),
  ];

  const dataWeekly: unknown[][] = [['Scope', 'Business Unit', 'Region', 'Record', 'Week', ...months, 'FY Total', 'Coverage', 'WoW', 'Source']];
  for (const entity of selected) {
    const records = weekly.filter((row) => row.entityId === entity.id).sort((a, b) => a.week - b.week);
    const budget = entity.budget ?? 0;
    if (budget) dataWeekly.push([entity.code, entity.name, entity.region, 'Budget', 0, ...(records.find((row) => row.budgetMonthValues)?.budgetMonthValues ?? months.map(() => null)), budget, null, null, entity.source]);
    records.forEach((row, index) => dataWeekly.push([entity.code, entity.name, entity.region, `W${String(row.week).padStart(2, '0')}`, row.week, ...(row.monthValues ?? months.map(() => null)), row.monthValues?.reduce((sum, value) => sum + value, 0) ?? row.sales, budget ? formatPercent(row.sales / budget) : null, index ? row.sales - records[index - 1].sales : null, row.source]));
  }

  const budgetRecap: unknown[][] = [['DIAM · BUDGET RECAP'], [], [title], [], ['MONTHLY POSITION · EUR K'], ['APAC monthly position. Budget comes from the source workbook; entity budgets that are not supplied remain blank.'], ['Region', 'Business Unit', 'Metric', ...months, 'FY Total', 'Coverage', 'Gap']];
  const rowsByMetric = (metric: string, values: number[]) => ['APAC', selected.length === 1 ? selected[0].name : 'APAC visible entities', metric, ...values, values.reduce((sum, value) => sum + value, 0), null, null];
  budgetRecap.push(rowsByMetric('Budget', snapshot.monthly.map((row) => row.budget)));
  budgetRecap.push(rowsByMetric('Sales', snapshot.monthly.map((row) => row.sales)));
  budgetRecap.push(rowsByMetric('Sales + P1', snapshot.monthly.map((row) => row.forecast)));

  const cumulative = (key: 'budget' | 'sales' | 'forecast') => { let running = 0; return snapshot.monthly.map((row) => { running += row[key]; return Number(running.toFixed(1)); }); };
  const chartData: unknown[][] = [['Region', 'Metric', ...months, null, 'Business Unit', 'Metric', ...months, null, 'Month', 'Budget', 'Sales', 'Sales + P1', null, 'Month', 'Budget', 'Sales', 'Sales + P1']];
  ['Budget', 'Sales', 'Sales + P1'].forEach((metric, index) => chartData.push(['APAC', metric, ...cumulative(index === 0 ? 'budget' : index === 1 ? 'sales' : 'forecast'), null, 'APAC', metric, ...cumulative(index === 0 ? 'budget' : index === 1 ? 'sales' : 'forecast'), null, months[index], snapshot.monthly[index].budget, snapshot.monthly[index].sales, snapshot.monthly[index].forecast, null, months[index], snapshot.monthly[index].budget, snapshot.monthly[index].sales, snapshot.monthly[index].forecast]));
  months.slice(3).forEach((month, index) => chartData.push([null, null, ...Array(12).fill(null), null, null, null, ...Array(12).fill(null), null, month, snapshot.monthly[index + 3].budget, snapshot.monthly[index + 3].sales, snapshot.monthly[index + 3].forecast, null, month, snapshot.monthly[index + 3].budget, snapshot.monthly[index + 3].sales, snapshot.monthly[index + 3].forecast]));

  const checks: unknown[][] = [['DIAM · MANAGEMENT CHECKS'], [], [title], [], [`${selected.filter((entity) => entity.status !== 'Ready').length + 1} item(s) to review`], [], ['Priority', 'BU', 'Check', 'Source', 'Compared', 'Difference', 'Reference'], ['REVIEW', 'GLOBAL', 'P1 W37 pending - previous P1 retained', null, snapshot.totals.p1 || null, null, 'Expected dedicated P1 W37 workbook · Last validated P1 baseline'], ...selected.filter((entity) => entity.status !== 'Ready').map((entity) => ['REVIEW', entity.code, 'Annual budget is not present in source workbook', entity.source, null, null, 'Provide approved annual budget before production publish'])];

  const workbook = XLSX.utils.book_new();
  const sheets = [
    ['Executive Summary', summary, [XLSX.utils.decode_range('A1:K1'), XLSX.utils.decode_range('A3:K3')], [14, 28, 15, 15, 15, 15, 15, 15, 15, 15, 15], 8],
    ['Weekly Review', weeklyReview, [XLSX.utils.decode_range('A1:Q1'), XLSX.utils.decode_range('A3:Q3'), XLSX.utils.decode_range('A7:Q7')], [19, ...Array(16).fill(12)], 7],
    ['Data Weekly', dataWeekly, [], [12, 29, 12, 12, 8, ...Array(12).fill(11), 12, 12, 12, 34], 0],
    ['Budget Recap', budgetRecap, [XLSX.utils.decode_range('A1:R1'), XLSX.utils.decode_range('A3:R3'), XLSX.utils.decode_range('A5:R5')], [13, 29, 15, ...Array(12).fill(12), 12, 12, 12], 6],
    ['Chart Data', chartData, [], Array(39).fill(12), 0], ['Management Checks', checks, [XLSX.utils.decode_range('A1:G1'), XLSX.utils.decode_range('A3:G3')], [12, 11, 38, 16, 16, 16, 42], 6],
  ] as const;
  sheets.forEach(([name, rows, merges, widths, headerRow]) => { const ws = sheet(rows, merges, widths); styleWorkbookSheet(ws, rows, headerRow); XLSX.utils.book_append_sheet(workbook, ws, name); });
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
  return new NextResponse(bytes, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="DIAM_APAC_Follow_Up_2026_W37.xlsx"' } });
}
