import { NextResponse } from 'next/server';
import { validateManualImport } from '@/lib/import-validation';
import { repository } from '@/lib/repository';
import { entities } from '@/lib/seed';
export async function POST(request: Request) {
  const body = await request.json();
  const validation = validateManualImport(body);
  if (!validation.valid) return NextResponse.json({ ok: false, validation, status: 'review' }, { status: 400 });
  const entity = entities.find((item) => item.id === body.entityId);
  const turnover = Number(body.turnover);
  const orderbook = Number(body.orderbook);
  const p1 = Number(body.p1 || 0);
  const batch = repository.createImportBatch({
    id: `IMP-${Date.now()}`,
    fileName: `Manual W${body.week}`,
    submittedBy: 'Demo account',
    submittedAt: new Date().toISOString(),
    status: 'review',
    sourceType: 'Manual',
    records: 1,
    completeness: validation.completeness,
    findings: validation.findings,
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
      orderbook2026External: body.customerType === 'Group' ? 0 : orderbook,
      orderbook2026Group: body.customerType === 'Group' ? orderbook : 0,
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
