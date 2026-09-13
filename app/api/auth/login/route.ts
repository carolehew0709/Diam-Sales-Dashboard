import { NextResponse } from 'next/server';
import { users } from '@/lib/seed';
export async function POST(request: Request) { const body = await request.json().catch(() => ({})); const user = users.find((item) => item.email === body.email) ?? users[0]; return NextResponse.json({ ok: true, user, demo: true }); }
