export type OpsCurrency = "CNY" | "EUR";
export type OpsOriginalCurrency = OpsCurrency | "USD" | "HKD";
export type OpsValueCurrency = OpsOriginalCurrency | "PENDING";
export type OpsAmountBasis = "dehk" | "ddc";

export type OpsOriginalPrice = {
  order: string;
  line: number;
  originalOrder: string;
  sourceRows: number[];
  currency: OpsOriginalCurrency;
  grossUnitPrice: number;
};

export type OpsOriginalPricing = {
  id: string;
  sources: { file: string; sheet: string; sha256: string }[];
  prices: OpsOriginalPrice[];
};

export const opsExportKinds = [
  "summary",
  "detail",
  "receivables",
  "receipts",
] as const;

export type OpsOrderLine = {
  order: string;
  line: number;
  date: string;
  customer: string;
  currency: OpsCurrency;
  item: string;
  description: string;
  quantity: number;
  ordered: number | null;
  shipped: number | null;
  open: number | null;
  openQuantity: number;
  team: string | null;
  sourceRow: number;
};

export type OpsShipment = {
  order: string;
  line: number;
  document: string;
  date: string;
  currency: OpsCurrency;
  quantity: number;
  amount: number | null;
  sourceRow: number;
};

export type OpsReceivable = {
  document: string;
  date: string;
  due: string;
  currency: OpsCurrency;
  amount: number;
  settled: number | null;
  balance: number | null;
  status: string;
  invoices: string[];
  sourceRow: number;
};

export type OpsReceivableLink = {
  order: string;
  line: number;
  document: string;
};

export type OpsPayment = {
  receipt: string;
  receivable: string;
  receivableEntry: string;
  date: string;
  currency: OpsCurrency;
  received: number;
  settled: number;
  sourceRow: number;
};

export type SalesOperationsSnapshot = {
  entityId: "ddc";
  from: string;
  asOf: string;
  sources: { file: string; sheet: string }[];
  lines: OpsOrderLine[];
  shipments: OpsShipment[];
  receivables: OpsReceivable[];
  receivableLinks: OpsReceivableLink[];
  payments: OpsPayment[];
  originalPricing?: OpsOriginalPricing;
  publication?: { id: string; fingerprint: string; at: string };
};
