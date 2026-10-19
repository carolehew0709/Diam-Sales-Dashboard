export type AgingBucket =
  | "not-due"
  | "1-30"
  | "31-60"
  | "61-90"
  | "91-120"
  | "over-120"
  | "unclassified";
export type ReceivableRecord = {
  id: string;
  entityId: string;
  category: "invoice" | "unknown" | "advance";
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
  currency: "EUR" | "RMB";
  originalBalance?: number;
  originalCurrency?: string;
  payer?: string;
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
