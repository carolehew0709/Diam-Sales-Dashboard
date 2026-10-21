import type { Amount } from "./types";

export type CustomerAnalysis = {
  month: string;
  year: number;
  priorYear: number;
  entityIds: string[];
  sourceFile: string;
  sourceLabel: string;
  breakdownSheet: string;
  customerSheet: string;
  breakdown: {
    name: string;
    values: [number, number, number, number];
    sourceRow: number;
  }[];
  customers: {
    name: string;
    prior: number;
    current: number;
    sourceGrowth: Amount;
    status: string;
    sourceRow: number;
  }[];
};

export type SalesGraphicSeries = {
  id: string;
  name: string;
  points: {
    month: number;
    ytd: Amount;
    monthly: Amount;
    week: number | null;
    sourceFile: string | null;
    sourceSheet: string | null;
  }[];
};
