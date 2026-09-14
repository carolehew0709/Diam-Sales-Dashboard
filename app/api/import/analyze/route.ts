import { NextResponse } from 'next/server';
import { entities } from '@/lib/seed';
import { repository } from '@/lib/repository';
import { parseDashboardWorkbook } from '@/lib/workbook-parser';

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ ok: false, findings: ['An .xlsx file is required'] }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const parsed = parseDashboardWorkbook(bytes, file.name);
  const resolveEntity = (name: string) => entities.find((entity) => entity.name.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(entity.code.toLowerCase()))?.id;
  const parsedLines = parsed.lines.map((line) => ({ ...line, entityId: resolveEntity(line.entityName) ?? line.entityId }));
  const parsedSnapshots = parsed.snapshots.map((snapshot) => ({ ...snapshot, entityId: resolveEntity(snapshot.entityName) ?? snapshot.entityId }));
  const findings = [...parsed.findings];
  if (parsed.snapshots.length === 0 && parsed.lines.length === 0) findings.push('No weekly orderbook rows were parsed');
  const completeness = Math.max(0, Math.round((parsed.sheets.length ? 50 : 0) + (parsed.lines.length || parsed.snapshots.length ? 35 : 0) + (findings.length ? 0 : 15)));
  const batch = repository.createImportBatch({ id: `IMP-${Date.now()}`, fileName: file.name, sourceType: 'Excel', status: 'review', sheets: parsed.sheets, records: parsed.lines.length || parsed.snapshots.length, completeness, findings, entityId: parsedSnapshots[0]?.entityId, week: parsedSnapshots[0]?.week, parsedLines, parsedSnapshots, submittedBy: 'Demo account', submittedAt: new Date().toISOString() });
  return NextResponse.json({ ok: findings.length === 0, batch }, { status: findings.length ? 400 : 200 });
}
