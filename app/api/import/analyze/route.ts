import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ ok: false, findings: ['An .xlsx file is required'] }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(bytes, { type: 'buffer', bookSheets: false });
  const sheets = workbook.SheetNames;
  const recordCount = sheets.reduce((total, name) => total + Math.max(XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }).length - 1, 0), 0);
  const findings = sheets.length === 0 ? ['Workbook has no sheets'] : [];
  return NextResponse.json({ ok: findings.length === 0, batch: { id: `IMP-${Date.now()}`, fileName: file.name, sourceType: 'Excel', status: 'review', sheets, records: recordCount, findings, completeness: findings.length ? 0 : 100 } }, { status: findings.length ? 400 : 200 });
}
