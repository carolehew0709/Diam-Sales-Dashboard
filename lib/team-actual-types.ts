export type TeamActualLine = {
  entityId: string;
  salesType: "external" | "group";
  team: string;
  originalTeam: string;
  customer: string;
  monthly: (number | null)[];
  ytd: number;
  budget: number | null;
  sourceRow: number;
};
export type TeamActualData = {
  reportingWeek?: number;
  year: number;
  month: number;
  currency: "EUR";
  unit: "kEUR";
  sourceFile: string;
  sourceSheet: string;
  mappings: Record<string, string>;
  rows: TeamActualLine[];
};
