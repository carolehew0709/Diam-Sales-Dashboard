import { NextResponse } from 'next/server';
export async function POST(request: Request) { const body = await request.json().catch(() => ({})); return NextResponse.json({ ok: true, saved: body, demo: true }); }
