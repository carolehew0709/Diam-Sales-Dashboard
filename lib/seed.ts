import sourceData from '@/data/apac-dashboard.json';
import { BrandRecord, Entity, ImportBatch, User, WeeklyRecord } from './types';

type SourceEntity = (typeof sourceData.entities)[number];
type SourceRecord = (typeof sourceData.records)[number];

export const entities: Entity[] = sourceData.entities.map((entity: SourceEntity) => ({
  id: entity.id, name: entity.name, code: entity.code, region: entity.region,
  businessUnit: entity.businessUnit, source: entity.source, status: entity.status as Entity['status'], budget: entity.budget,
}));

export const weekly: WeeklyRecord[] = sourceData.records.map((record: SourceRecord) => ({
  entityId: record.entityId, week: record.week, budget: record.budget, sales: record.sales,
  orderbook: record.orderbook, forecast: record.forecast, p1: record.p1, source: record.source,
  monthValues: record.monthValues, budgetMonthValues: record.budgetMonthValues, isSnapshot: record.isSnapshot,
}));

export const brands: BrandRecord[] = [
  { brand: 'DIAM', sales: 624, budget: 650, region: 'APAC', trend: 8.2 },
  { brand: 'Prugent', sales: 318, budget: 290, region: 'APAC', trend: 13.4 },
  { brand: 'Private label', sales: 142, budget: 166, region: 'APAC', trend: -5.7 },
  { brand: 'Other', sales: 84, budget: 72, region: 'APAC', trend: 4.1 },
];

export const users: User[] = [
  { id: 'u1', name: 'Carole Hew', email: 'superadmin@diam.demo', role: 'superadmin', region: 'APAC', crossRegionView: true, permissions: { pda: ['view', 'edit'], ddc: ['view', 'edit'], dehk: ['view', 'edit'] } },
  { id: 'u2', name: 'APAC Regional Admin', email: 'apac.admin@diam.demo', role: 'apac_admin', region: 'APAC', crossRegionView: false, permissions: { pda: ['view', 'edit'], ddc: ['view', 'edit'], dehk: ['view'] } },
  { id: 'u5', name: 'China Entity Admin', email: 'china.admin@diam.demo', role: 'apac_admin', region: 'APAC', crossRegionView: false, permissions: { pda: ['view'], ddc: ['view', 'edit'], dehk: [] } },
  { id: 'u6', name: 'Hong Kong Editor', email: 'hk.editor@diam.demo', role: 'editor', region: 'APAC', crossRegionView: false, permissions: { pda: ['view'], ddc: [], dehk: ['view', 'edit'] } },
  { id: 'u3', name: 'Sales Editor', email: 'editor@diam.demo', role: 'editor', region: 'APAC', crossRegionView: false, permissions: { pda: ['view', 'edit'], ddc: ['view', 'edit'], dehk: ['view'] } },
  { id: 'u4', name: 'Executive Viewer', email: 'viewer@diam.demo', role: 'viewer', region: 'APAC', crossRegionView: false, permissions: { pda: ['view'], ddc: ['view'], dehk: ['view'] } },
  { id: 'u7', name: 'Audit Read-only', email: 'audit@diam.demo', role: 'audit_viewer', region: 'APAC', crossRegionView: true, permissions: { pda: ['view'], ddc: ['view'], dehk: ['view'] } },
];

export const importBatches: ImportBatch[] = [
  { id: 'IMP-2409', fileName: 'APAC_W37_manual_review', submittedBy: 'Sales Editor', submittedAt: '2026-09-13 09:42', status: 'review', sourceType: 'Manual', records: 3, completeness: 86, findings: ['Japan forecast is missing', 'Singapore source note needs confirmation'] },
  { id: 'IMP-2408', fileName: 'Dashboard 2026 - DDC.xlsx', submittedBy: 'APAC Regional Admin', submittedAt: '2026-09-12 16:10', status: 'published', sourceType: 'Excel', records: 37, completeness: 94, findings: ['Annual budget is not present in source workbook'] },
  { id: 'IMP-2407', fileName: 'DIAM_Global_Follow_Up_2026_W35.xlsx', submittedBy: 'APAC Regional Admin', submittedAt: '2026-09-11 15:20', status: 'published', sourceType: 'Excel', records: 35, completeness: 100, findings: [] },
];
