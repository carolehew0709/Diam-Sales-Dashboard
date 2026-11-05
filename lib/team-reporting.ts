import { teamNamesState } from "./team-actuals";
import { reportingState } from "./intercompany";
import { salesTeamState, teamName, teamOrderbookSummary } from "./sales-teams";
import { entities, matchesRegion } from "./entities";
import { canView } from "./permissions";
import type { Store, Filters, User, ImportBatch } from "./types";

/** Owner 2026-11-02: retain the last published team dataset until explicitly resumed. */
export function retainTeamSource(state: Store, at: string) {
  if (state.retainedTeamSource) return;
  state.retainedTeamSource = {
    snapshots: structuredClone(state.snapshots),
    lines: structuredClone(state.lines),
    retainedAt: at,
  };
}
export function teamReportingState(state: Store, filters: Filters): Store {
  state = teamNamesState(state);
  if (
    !state.retainedTeamSource ||
    !filters.salesTeam ||
    filters.salesTeam === "all"
  )
    return state;
  return {
    ...state,
    snapshots: state.retainedTeamSource.snapshots,
    lines: state.retainedTeamSource.lines,
  };
}
export function retainedTeamView(state: Store, user: User, filters: Filters) {
  state = teamNamesState(state);
  const retained = state.retainedTeamSource;
  if (!retained) return null;
  const allowed = entities.filter(
    (e) =>
      canView(user, e) &&
      matchesRegion(e, filters.region) &&
      (filters.bu === "all" ||
        filters.bu === e.businessUnit ||
        (filters.bu === "DHK" && e.id === "dhk")) &&
      (filters.entity === "all" || filters.entity === e.id),
  );
  const report = reportingState(
    { ...state, snapshots: retained.snapshots, lines: retained.lines },
    filters.salesType,
  );
  const sourceYear = (id: string) =>
    report.snapshots.some((s) => s.entityId === id && s.year === filters.year)
      ? filters.year
      : filters.year - 1;
  const snapshots = allowed.flatMap((e) => {
    const s = report.snapshots
      .filter((s) => s.entityId === e.id && s.year === sourceYear(e.id))
      .sort((a, b) => b.week - a.week)[0];
    return s ? [s] : [];
  });
  const latestLines = report.lines.filter(
    (l) =>
      snapshots.some(
        (s) =>
          s.entityId === l.entityId && s.year === l.year && s.week === l.week,
      ) &&
      (filters.salesType === "all" ||
        l.customerType.toLowerCase() === filters.salesType),
  );
  const scoped = salesTeamState(
    { ...report, snapshots, lines: latestLines },
    filters.salesTeam,
    filters.customer,
  );
  return {
    teams: teamOrderbookSummary(scoped.lines, filters.year),
    names: [...new Set(latestLines.map((l) => teamName(l.salesTeam)))].sort(),
    source: {
      reviewed:
        snapshots.length > 0 &&
        snapshots.every((s) =>
          retained.reviewedScopes?.includes(
            `${s.entityId}:${s.year}:${s.week}`,
          ),
        ),
      weeks: [...new Set(snapshots.map((s) => s.week))].sort((a, b) => a - b),
      files: [...new Set(snapshots.map((s) => s.sourceFile))],
      periods: snapshots.map((s) => ({
        entityId: s.entityId,
        year: s.year,
        month: s.month,
        week: s.week,
      })),
    },
  };
}

/** Explicit reviewed sales scopes advance the pinned team reference; later imports remain paused. */
export function publishTeamReference(
  state: Store,
  batch: ImportBatch,
  at: string,
) {
  if (!batch.updateTeamReporting) return;
  if (
    !batch.snapshots.length ||
    batch.customerAnalysis ||
    batch.receivables ||
    batch.teamActualData
  )
    throw new Error("Team reference requires reviewed weekly sales scopes");
  retainTeamSource(state, at);
  const retained = state.retainedTeamSource!,
    key = (s: { entityId: string; year: number; week: number }) =>
      s.entityId + ":" + s.year + ":" + s.week,
    keys = new Set(batch.snapshots.map(key));
  retained.snapshots = retained.snapshots
    .filter((s) => !keys.has(key(s)))
    .concat(structuredClone(batch.snapshots));
  retained.lines = retained.lines
    .filter((l) => !keys.has(key(l)))
    .concat(structuredClone(batch.lines));
  retained.reviewedScopes = [
    ...new Set([...(retained.reviewedScopes ?? []), ...keys]),
  ];
  retained.reviewedAt = at;
}
