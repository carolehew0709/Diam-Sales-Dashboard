import { NextResponse } from 'next/server';
import { repository } from '@/lib/repository';
export async function POST(request: Request) { const body = await request.json().catch(() => ({})); const batch = repository.publishImportBatch(body.id); return NextResponse.json({ ok: Boolean(batch), batch }); }
