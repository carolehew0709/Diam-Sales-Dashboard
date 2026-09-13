import { NextResponse } from 'next/server';
import { users } from '@/lib/seed';
export function GET() { return NextResponse.json({ ok: true, user: users[0], demo: true }); }
