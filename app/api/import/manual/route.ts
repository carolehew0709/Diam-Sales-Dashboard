import { NextResponse } from 'next/server';
import { validateManualImport } from '@/lib/import-validation';
export async function POST(request: Request) { const body = await request.json(); const validation = validateManualImport(body); return NextResponse.json({ ok: validation.valid, validation, status: 'review' }, { status: validation.valid ? 200 : 400 }); }
