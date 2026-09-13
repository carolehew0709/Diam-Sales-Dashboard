import { NextResponse } from 'next/server';
import { validateManualImport } from '@/lib/import-validation';
import { repository } from '@/lib/repository';
export async function POST(request: Request) {
  const body = await request.json();
  const validation = validateManualImport(body);
  if (!validation.valid) return NextResponse.json({ ok: false, validation, status: 'review' }, { status: 400 });
  const batch = repository.createImportBatch({ id: `IMP-${Date.now()}`, fileName: `Manual W${body.week}`, submittedBy: 'Demo account', submittedAt: new Date().toISOString(), status: 'review', sourceType: 'Manual', records: 1, completeness: validation.completeness, findings: validation.findings });
  return NextResponse.json({ ok: true, validation, status: 'review', batch });
}
