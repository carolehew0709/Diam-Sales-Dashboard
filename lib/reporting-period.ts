import type { Store, Snapshot } from "./types";
export type ReportingPeriod = Pick<Snapshot, "year" | "month"> &
  Partial<Pick<Snapshot, "entityId" | "week">>;
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
/** Historical views never mutate the active source or invent earlier team actuals. */
export function reportingPeriod(state: Store, week?: number): Store {
  if (!week) return state;
  return {
    ...state,
    snapshots: state.snapshots.filter((s) => s.week <= week),
    lines: state.lines.filter((l) => l.week <= week),
    teamActualData:
      state.teamActualData?.reportingWeek &&
      state.teamActualData.reportingWeek <= week
        ? state.teamActualData
        : undefined,
    retainedTeamSource: state.retainedTeamSource
      ? {
          ...state.retainedTeamSource,
          snapshots: state.retainedTeamSource.snapshots.filter(
            (s) => s.week <= week,
          ),
          lines: state.retainedTeamSource.lines.filter((l) => l.week <= week),
        }
      : undefined,
  };
}
