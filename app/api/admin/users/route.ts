import { NextResponse } from 'next/server';
import { repository } from '@/lib/repository';
export function GET() { return NextResponse.json({ ok: true, users: repository.getUsers() }); }
