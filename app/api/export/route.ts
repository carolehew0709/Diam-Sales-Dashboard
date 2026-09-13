import { NextResponse } from 'next/server';
import { getDashboardSnapshot } from '@/lib/dashboard';

export function GET() { const snapshot = getDashboardSnapshot(); const rows = [['Entity', 'Budget kEUR', 'Sales kEUR', 'Forecast kEUR'], ...snapshot.entities.map((entity) => { const records = snapshot.records.filter((row) => row.entityId === entity.id); return [entity.name, String(records.reduce((s, r) => s + r.budget, 0).toFixed(1)), String(records.reduce((s, r) => s + r.sales, 0).toFixed(1)), String(records.reduce((s, r) => s + r.forecast, 0).toFixed(1))]; })]; return new NextResponse(rows.map((row) => row.join(',')).join('\n'), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="diam-apac-dashboard-export.csv"' } }); }
