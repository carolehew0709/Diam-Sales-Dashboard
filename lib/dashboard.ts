import { entities, weekly } from './seed';
import { Scenario } from './types';

export function getDashboardSnapshot(entityFilter = 'all', scenario: Scenario = 'Sales') {
  const visible = entityFilter === 'all' ? entities : entities.filter((entity) => entity.id === entityFilter);
  const ids = new Set(visible.map((entity) => entity.id));
  const records = weekly.filter((record) => ids.has(record.entityId));
  const totals = records.reduce((acc, row) => ({
    budget: acc.budget + row.budget, sales: acc.sales + row.sales, orderbook: acc.orderbook + row.orderbook, forecast: acc.forecast + row.forecast, p1: acc.p1 + row.p1,
  }), { budget: 0, sales: 0, orderbook: 0, forecast: 0, p1: 0 });
  const uplift = scenario === 'Sales + P1' ? totals.p1 : 0;
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const monthRecords = records.filter((row) => row.week - 26 === index);
    const fallback = index > 5 ? records.filter((row) => row.week - 26 === index - 6) : [];
    const sourceRecords = monthRecords.length ? monthRecords : fallback;
    return { label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index], budget: sourceRecords.reduce((s, r) => s + r.budget, 0), sales: sourceRecords.reduce((s, r) => s + r.sales, 0), forecast: sourceRecords.reduce((s, r) => s + r.forecast, 0) + uplift / 12 };
  });
  return { entities: visible, records, totals: { ...totals, forecast: totals.forecast + uplift, salesPlusP1: totals.sales + totals.p1, coverage: (totals.forecast + uplift) / Math.max(totals.budget, 1), gap: totals.budget - (totals.forecast + uplift) }, monthly };
}

export function formatK(value: number) { return `${Math.round(value).toLocaleString()}k`; }
