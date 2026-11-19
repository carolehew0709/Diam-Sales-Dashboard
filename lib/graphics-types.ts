import type { Amount } from "./types";

export type CustomerAnalysis = {
  monthlyDetails?: CustomerMonthlyDetails;
  month: string;
  year: number;
  priorYear: number;
  entityIds: string[];
  sourceFile: string;
  sourceLabel: string;
  sourceReview?: {
    reportedMonth?: string;
    keyCustomerYtd?: { breakdown: number; detail: number };
  };
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

export type CustomerMonthlyDetails = {
  cutoffMonth: number;
  years: number[];
  sourceSheet: string;
  sourceRange: string;
  rows: {
    name: string;
    team: string;
    path: string[];
    monthly: Record<string, Amount[]>;
    ytd: Record<string, Amount>;
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
