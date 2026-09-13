import { NextResponse } from 'next/server';
import { getDashboardSnapshot } from '@/lib/dashboard';
import * as XLSX from 'xlsx';

export function GET(request: Request) {
  const url = new URL(request.url);
  const entity = url.searchParams.get('entity') ?? 'all';
  const scenario = url.searchParams.get('scenario') === 'Sales + P1' ? 'Sales + P1' : 'Sales';
  const snapshot = getDashboardSnapshot(entity, scenario);
  const summary = [
    ['DIAM APAC SALES PERFORMANCE', ''],
    ['Scenario', scenario], ['Reporting unit', 'EUR K'], ['Active source week', 'W35 / W37 source snapshots'], ['Source mode', 'Excel-derived demo snapshot'], [],
    ['Entity', 'Budget kEUR', 'Sales kEUR', 'P1 kEUR', 'Sales + P1 kEUR', 'Coverage', 'Gap kEUR', 'Source'],
    ...snapshot.entities.map((item) => {
      const row = snapshot.records.find((record) => record.entityId === item.id);
      const budget = item.budget ?? 0;
      const sales = row?.sales ?? 0;
      const p1 = row?.p1 ?? 0;
      const combined = sales + p1;
      return [item.name, budget, sales, p1, combined, budget ? combined / budget : null, budget ? budget - combined : null, item.source];
    }),
  ];
  const monthly = [['Month', 'Budget kEUR', 'Sales kEUR', 'Forecast kEUR'], ...snapshot.monthly.map((row) => [row.label, row.budget, row.sales, row.forecast])];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Dashboard Export');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(monthly), 'Monthly Phasing');
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return new NextResponse(bytes, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="diam-apac-dashboard-export.xlsx"' } });
}
