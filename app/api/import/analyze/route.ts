import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ ok: false, findings: ['An .xlsx file is required'] }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(bytes, { type: 'buffer', bookSheets: false });
  const sheets = workbook.SheetNames;
  const sheetSummary = sheets.map((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null }) as unknown[][];
    const text = rows.flat().filter(Boolean).map(String).join(' ');
    const weeks = [...new Set((text.match(/W\d+/g) ?? []))];
    return { name, rows: rows.length, weeks: weeks.slice(0, 60), kind: /data weekly/i.test(name) ? 'weekly' : /synth/i.test(name) ? 'entity snapshot' : /budget recap/i.test(name) ? 'budget' : 'supporting' };
  });
  const recordCount = sheetSummary.reduce((total, sheet) => total + Math.max(sheet.rows - 1, 0), 0);
  const findings = sheets.length === 0 ? ['Workbook has no sheets'] : [];
  if (!sheets.some((name) => /data weekly|synth|budget recap/i.test(name))) findings.push('No recognized dashboard data sheet found');
  const completeness = Math.max(0, Math.round(((sheets.length ? 1 : 0) + (findings.length === 0 ? 1 : 0)) / 2 * 100));
  return NextResponse.json({ ok: findings.length === 0, batch: { id: `IMP-${Date.now()}`, fileName: file.name, sourceType: 'Excel', status: 'review', sheets: sheetSummary, records: recordCount, findings, completeness } }, { status: findings.length ? 400 : 200 });
}
