import { entities, weekly } from './seed';
import { Scenario } from './types';

export function getDashboardSnapshot(entityFilter = 'all', scenario: Scenario = 'Sales') {
  const visible = entityFilter === 'all' ? entities : entities.filter((entity) => entity.id === entityFilter);
  const ids = new Set(visible.map((entity) => entity.id));
  const records = visible.flatMap((entity) => {
    const candidates = weekly.filter((record) => record.entityId === entity.id && (record.sales !== 0 || record.forecast !== 0 || record.orderbook !== 0));
    const latest = candidates.sort((a, b) => b.week - a.week)[0] ?? weekly.filter((record) => record.entityId === entity.id).sort((a, b) => b.week - a.week)[0];
    return latest ? [latest] : [];
  });
  const totals = records.reduce((acc, row) => {
    const entity = visible.find((item) => item.id === row.entityId);
    return { budget: acc.budget + (entity?.budget ?? row.budget), sales: acc.sales + row.sales, orderbook: acc.orderbook + row.orderbook, forecast: acc.forecast + row.forecast, p1: acc.p1 + row.p1 };
  }, { budget: 0, sales: 0, orderbook: 0, forecast: 0, p1: 0 });
  const uplift = scenario === 'Sales + P1' ? totals.p1 : 0;
  const monthly = Array.from({ length: 12 }, (_, index) => {
    return { label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index], budget: records.reduce((sum, row) => sum + (row.budgetMonthValues?.[index] ?? 0), 0), sales: records.reduce((sum, row) => sum + (row.monthValues?.[index] ?? 0), 0), forecast: records.reduce((sum, row) => sum + (row.monthValues?.[index] ?? 0), 0) + uplift / 12 };
  });
  return { entities: visible, records, totals: { ...totals, forecast: totals.forecast + uplift, salesPlusP1: totals.sales + totals.p1, coverage: (totals.forecast + uplift) / Math.max(totals.budget, 1), gap: totals.budget - (totals.forecast + uplift) }, monthly };
}

export function formatK(value: number) { return `${Math.round(value).toLocaleString()}k`; }
