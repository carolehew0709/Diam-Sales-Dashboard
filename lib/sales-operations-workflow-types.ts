import type { OpsOriginalCurrency } from "./sales-operations-types";

export const operationsStages = [
  "orders",
  "shipments",
  "invoices",
  "receipts",
] as const;
export type OperationsStage = (typeof operationsStages)[number];
export type OperationsEntity = "DDC" | "DEHK";

export type OperationsWorkflowRecord = {
  entity: OperationsEntity;
  document: string;
  date: string;
  customer: string;
  team: string | null;
  amount: number | null;
  currency: OpsOriginalCurrency | null;
  sourceRow: number;
  /** Order and outbound quantities are kept at source row grain. */
  quantity?: number;
  item?: string;
  order?: string;
  originalOrder?: string;
  division?: "internal" | "external" | "unknown";
};

export type OperationsWorkflowDataset = {
  entity: OperationsEntity;
  from: string;
  asOf: string;
  file: string;
  sheet: string;
  fingerprint: string;
  records: OperationsWorkflowRecord[];
};

export type OperationsWorkflowSources = {
  orders: OperationsWorkflowDataset[];
  receipts: OperationsWorkflowDataset[];
  invoices: OperationsWorkflowDataset[];
};
