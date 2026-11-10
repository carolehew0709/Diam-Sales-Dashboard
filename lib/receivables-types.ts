export type AgingBucket =
  | "not-due"
  | "1-30"
  | "31-60"
  | "61-90"
  | "91-120"
  | "over-120"
  | "unclassified";
export const receivableCurrencies = ["EUR", "USD", "RMB"] as const;
export type ReceivableCurrency = (typeof receivableCurrencies)[number];
export type ReceiptCategory = "unknown" | "advance" | "pending";
export type ReceivableRecord = {
  id: string;
  entityId: string;
  category: "invoice" | ReceiptCategory;
  customer: string;
  subCustomer: string;
  salesTeam: string;
  pic: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  receivedDate: string | null;
  dueDate: string | null;
  asOfDate: string | null;
  terms: number | null;
  overdueDays: number | null;
  aging: AgingBucket;
  sourceAging: string;
  customerType: "External" | "Group" | "Unclassified";
  amount: number;
  currency: ReceivableCurrency;
  originalBalance?: number;
  originalCurrency?: string;
  payer?: string;
  sourceStatus?: string;
  receivedAmount?: number;
  bankSlip?: string;
  note: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
};

export type ReceivablesFilters = {
  region: string;
  bu: string;
  salesTeam: string;
  customerGroup: "all" | "top10" | "other";
  customer: string;
  salesType: "all" | "external" | "group";
  aging: "all" | AgingBucket;
};
