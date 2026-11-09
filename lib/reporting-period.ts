import type { Store, Snapshot } from "./types";
import type { Filters, User } from "./types";
import { entities, matchesRegion } from "./entities";
import { canView } from "./permissions";
import { sourceYear } from "./fiscal-years";

/** Navigation uses all permitted published weeks, before applying a historical cap. */
export function availableReportingWeeks(
  state: Store,
  user: User,
  filters: Filters,
) {
  const scoped = entities.filter(
    (e) =>
      canView(user, e) &&
      matchesRegion(e, filters.region) &&
      (filters.bu === "all" ||
        e.businessUnit === filters.bu ||
        (filters.bu === "DHK" && e.id === "dhk")) &&
      (filters.entity === "all" || e.id === filters.entity),
  );
  const years = new Map(
    scoped.map((e) => [e.id, sourceYear(state, e.id, filters.year)]),
  );
  return [
    ...new Set(
      state.snapshots
        .filter((s) => years.get(s.entityId) === s.year)
        .map((s) => s.week),
    ),
  ].sort((a, b) => b - a);
}
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
