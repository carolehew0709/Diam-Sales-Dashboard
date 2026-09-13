import { BrandRecord, Entity, ImportBatch, User, WeeklyRecord } from './types';

export const entities: Entity[] = [
  { id: 'cn', name: 'Diam China', code: 'DDC', region: 'APAC', businessUnit: 'Asia / PDA', source: 'Dashboard 2026 - DDC.xlsx', status: 'Ready' },
  { id: 'hk', name: 'DE Hong Kong', code: 'DEHK', region: 'APAC', businessUnit: 'Asia / PDA', source: 'Dashboard 2026 - DEHK.xlsx', status: 'Ready' },
  { id: 'sg', name: 'Diam Singapore', code: 'SG', region: 'APAC', businessUnit: 'Asia / Commercial', source: 'Global Follow Up W35', status: 'Review' },
  { id: 'jp', name: 'Diam Japan', code: 'JP', region: 'APAC', businessUnit: 'Asia / Commercial', source: 'Global Follow Up W35', status: 'Missing' },
  { id: 'au', name: 'Diam Australia', code: 'AU', region: 'APAC', businessUnit: 'Asia / Commercial', source: 'Global Follow Up W35', status: 'Review' },
];

const base: Record<string, [number, number, number, number, number]> = {
  cn: [420, 408, 126, 452, 46], hk: [270, 286, 84, 302, 21], sg: [178, 164, 51, 190, 18], jp: [225, 201, 73, 232, 27], au: [144, 152, 42, 160, 12],
};

export const weekly: WeeklyRecord[] = Array.from({ length: 12 }, (_, index) =>
  entities.flatMap((entity) => {
    const [budget, sales, orderbook, forecast, p1] = base[entity.id];
    const pulse = Math.sin(index * 0.8 + entity.id.length) * 18;
    return { entityId: entity.id, week: 26 + index, budget: budget / 4.3, sales: sales / 4.3 + pulse, orderbook: orderbook / 4.3, forecast: forecast / 4.3 + pulse / 2, p1: p1 / 4.3, source: entity.source };
  }),
).flat();

export const brands: BrandRecord[] = [
  { brand: 'DIAM', sales: 624, budget: 650, region: 'APAC', trend: 8.2 },
  { brand: 'Prugent', sales: 318, budget: 290, region: 'APAC', trend: 13.4 },
  { brand: 'Private label', sales: 142, budget: 166, region: 'APAC', trend: -5.7 },
  { brand: 'Other', sales: 84, budget: 72, region: 'APAC', trend: 4.1 },
];

export const users: User[] = [
  { id: 'u1', name: 'Carole Hew', email: 'superadmin@diam.demo', role: 'superadmin', region: 'APAC', crossRegionView: true, permissions: { cn: ['view', 'edit'], hk: ['view', 'edit'], sg: ['view', 'edit'], jp: ['view', 'edit'], au: ['view', 'edit'] } },
  { id: 'u2', name: 'APAC Regional Admin', email: 'apac.admin@diam.demo', role: 'apac_admin', region: 'APAC', crossRegionView: false, permissions: { cn: ['view', 'edit'], hk: ['view', 'edit'], sg: ['view', 'edit'], jp: ['view'], au: ['view'] } },
  { id: 'u3', name: 'Sales Editor', email: 'editor@diam.demo', role: 'editor', region: 'APAC', crossRegionView: false, permissions: { cn: ['view', 'edit'], hk: ['view', 'edit'], sg: ['view'], jp: [], au: [] } },
  { id: 'u4', name: 'Executive Viewer', email: 'viewer@diam.demo', role: 'viewer', region: 'APAC', crossRegionView: false, permissions: { cn: ['view'], hk: ['view'], sg: ['view'], jp: [], au: [] } },
];

export const importBatches: ImportBatch[] = [
  { id: 'IMP-2409', fileName: 'APAC_W37_manual_review', submittedBy: 'Sales Editor', submittedAt: '2026-09-13 09:42', status: 'review', sourceType: 'Manual', records: 3, completeness: 86, findings: ['Japan forecast is missing', 'Singapore source note needs confirmation'] },
  { id: 'IMP-2408', fileName: 'Dashboard 2026 - DDC.xlsx', submittedBy: 'APAC Regional Admin', submittedAt: '2026-09-12 16:10', status: 'published', sourceType: 'Excel', records: 52, completeness: 100, findings: [] },
];
