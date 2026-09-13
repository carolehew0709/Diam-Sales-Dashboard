import { NextResponse } from 'next/server';
import { users } from '@/lib/seed';
export function GET(request: Request) { const email = new URL(request.url).searchParams.get('email'); const user = users.find((item) => item.email === email) ?? users[0]; return NextResponse.json({ ok: true, user, availableUsers: users.map(({ id, name, email: address, role }) => ({ id, name, email: address, role })), demo: true }); }
