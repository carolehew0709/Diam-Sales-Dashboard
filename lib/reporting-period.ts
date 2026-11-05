import type { Snapshot } from "./types";

export type ReportingPeriod = Pick<Snapshot, "year" | "month"> &
  Partial<Pick<Snapshot, "entityId" | "week">>;

/** Explicit owner confirmations, scoped to the source snapshot rather than today's date. */
const closedReportingMonths = [
  { entityId: "dhk", year: 2026, week: 44, month: 10 },
  { entityId: "ddc", year: 2026, week: 44, month: 10 },
  { entityId: "dcp", year: 2026, week: 44, month: 10 },
] as const;

export function reportingMonthClosed(report: ReportingPeriod): boolean {
  return closedReportingMonths.some(
    (approved) =>
      approved.entityId === report.entityId &&
      approved.year === report.year &&
      approved.week === report.week &&
      approved.month === report.month,
  );
}
