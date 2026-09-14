export type Role = 'superadmin' | 'region_admin' | 'editor' | 'viewer' | 'audit_viewer';
export type Permission = 'view' | 'edit';
export type Scenario = 'Sales' | 'Sales + P1';

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  region: string;
  crossRegionView: boolean;
  permissions: Record<string, Permission[]>;
};

export type Entity = {
  id: string;
  name: string;
  code: string;
  region: string;
  businessUnit: string;
  source: string;
  status: 'Ready' | 'Review' | 'Missing';
  budget?: number;
};

export type WeeklyRecord = {
  entityId: string;
  week: number;
  budget: number;
  sales: number;
  orderbook: number;
  forecast: number;
  p1: number;
  source: string;
  monthValues?: number[];
  budgetMonthValues?: number[];
  isSnapshot?: boolean;
};

export type BrandRecord = { brand: string; sales: number; budget: number; region: string; trend: number };

export type ImportBatch = {
  id: string;
  fileName: string;
  submittedBy: string;
  submittedAt: string;
  status: 'review' | 'published' | 'rejected';
  sourceType: 'Excel' | 'Manual';
  records: number;
  completeness: number;
  findings: string[];
};
