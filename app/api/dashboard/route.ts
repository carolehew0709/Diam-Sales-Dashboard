import { NextResponse } from 'next/server';
import { getDashboardSnapshot } from '@/lib/dashboard';

export function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json({ ok: true, data: getDashboardSnapshot(url.searchParams.get('entity') ?? 'all', url.searchParams.get('scenario') === 'Sales + P1' ? 'Sales + P1' : 'Sales') });
}
