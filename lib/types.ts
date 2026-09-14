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

export type OrderBookLine = {
  id: string;
  entityId: string;
  entityName: string;
  week: number;
  product: string;
  customer: string;
  customerType: 'External' | 'Group' | 'Unclassified';
  dgc: 'E' | 'G' | 'Unclassified';
  quantity?: number;
  total2026: number;
  total2027: number;
  monthly2026: number[];
  monthly2027: number[];
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
};

export type EntityWeekSnapshot = {
  entityId: string;
  entityName: string;
  week: number;
  month: string;
  ytdTurnoverExternal: number;
  ytdTurnoverGroup: number;
  currentMonthTurnoverExternal: number;
  currentMonthTurnoverGroup: number;
  orderbook2026External: number;
  orderbook2026Group: number;
  orderbook2027External: number;
  orderbook2027Group: number;
  forecast2026: number;
  newOrders2026: number;
  sourceFile: string;
  sourceSheet: string;
  sourceCheck: 'OK' | 'Review';
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
  sheets?: { name: string; rows: number; weeks?: string[]; kind: string }[];
  entityId?: string;
  week?: number;
  parsedLines?: OrderBookLine[];
  parsedSnapshots?: EntityWeekSnapshot[];
};
