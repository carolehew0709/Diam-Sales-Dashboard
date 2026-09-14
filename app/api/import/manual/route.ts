import { NextResponse } from 'next/server';
import { validateManualImport } from '@/lib/import-validation';
import { repository } from '@/lib/repository';
import { entities } from '@/lib/seed';
import type { OrderBookLine } from '@/lib/types';
export async function POST(request: Request) {
  const body = await request.json();
  const validation = validateManualImport(body);
  if (!validation.valid) return NextResponse.json({ ok: false, validation, status: 'review' }, { status: 400 });
  const entity = entities.find((item) => item.id === body.entityId);
  const turnover = Number(body.turnover);
  const orderbook = Number(body.orderbook);
  const p1 = Number(body.p1 || 0);
  const lines: OrderBookLine[] = Array.isArray(body.lines) ? body.lines.filter((line: any) => line && (line.product || line.customer)).map((line: any, index: number) => ({
    id: `MANUAL-${Date.now()}-${index}`,
    entityId: body.entityId,
    entityName: entity?.name ?? body.entityId,
    week: Number(body.week),
    product: String(line.product ?? ''),
    customer: String(line.customer ?? ''),
    customerType: line.customerType === 'Group' ? 'Group' : 'External',
    dgc: line.dgc === 'G' ? 'G' : 'E',
    total2026: Number(line.total2026 || 0),
    total2027: Number(line.total2027 || 0),
    monthly2026: Array.from({ length: 12 }, (_, monthIndex) => Number(line.monthly2026?.[monthIndex] || 0)),
    monthly2027: Array(12).fill(0),
    sourceFile: `Manual W${body.week}`,
    sourceSheet: 'Manual entry',
    sourceRow: index + 1,
  })) : [];
  const orderbookExternal = lines.filter((line) => line.customerType === 'External').reduce((sum, line) => sum + line.total2026, 0);
  const orderbookGroup = lines.filter((line) => line.customerType === 'Group').reduce((sum, line) => sum + line.total2026, 0);
  const batch = repository.createImportBatch({
    id: `IMP-${Date.now()}`,
    fileName: `Manual W${body.week}`,
    submittedBy: 'Demo account',
    submittedAt: new Date().toISOString(),
    status: 'review',
    sourceType: 'Manual',
    records: lines.length,
    completeness: validation.completeness,
    findings: validation.findings,
    parsedLines: lines,
    entityId: body.entityId,
    week: Number(body.week),
    parsedSnapshots: [{
      entityId: body.entityId,
      entityName: entity?.name ?? body.entityId,
      week: Number(body.week),
      month: 'Manual',
      ytdTurnoverExternal: body.customerType === 'Group' ? 0 : turnover,
      ytdTurnoverGroup: body.customerType === 'Group' ? turnover : 0,
      currentMonthTurnoverExternal: body.customerType === 'Group' ? 0 : turnover,
      currentMonthTurnoverGroup: body.customerType === 'Group' ? turnover : 0,
      orderbook2026External: lines.length ? orderbookExternal : body.customerType === 'Group' ? 0 : orderbook,
      orderbook2026Group: lines.length ? orderbookGroup : body.customerType === 'Group' ? orderbook : 0,
      orderbook2027External: 0,
      orderbook2027Group: 0,
      forecast2026: turnover + orderbook + p1,
      newOrders2026: 0,
      sourceFile: `Manual W${body.week}`,
      sourceSheet: 'Manual entry',
      sourceCheck: 'OK',
    }],
  });
  return NextResponse.json({ ok: true, validation, status: 'review', batch });
}
