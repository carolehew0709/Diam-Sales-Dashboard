import type { Amount } from "./types";
import { teamMonthlyPerformance } from "./performance-chart";

type ActualSource = {
  month: number;
  monthly: Amount[];
  groups: { entityIds: string[] }[];
};
type ProspectTeam = { monthly: Amount[]; entityIds: string[] };

/** Presentation series only; keep actuals, outstanding Prospect and source scope distinct. */
export function teamPerformanceSeries(
  actuals: ActualSource | null | undefined,
  teams: readonly ProspectTeam[],
) {
  const prospect = teamMonthlyPerformance(teams);
  const sales = Array.from({ length: 12 }, (_, i): Amount =>
    actuals && i < actuals.month ? (actuals.monthly[i] ?? null) : null,
  );
  const cumulativeSales = sales.map((_, i): Amount =>
    sales.slice(0, i + 1).every((v) => v !== null)
      ? sales.slice(0, i + 1).reduce<number>((n, v) => n + v!, 0)
      : null,
  );
  const actualEntities = [
    ...new Set(actuals?.groups.flatMap((g) => g.entityIds) ?? []),
  ].sort();
  const prospectEntities = [
    ...new Set(teams.flatMap((g) => g.entityIds)),
  ].sort();
  const coverage =
    !actualEntities.length || !prospectEntities.length
      ? "unavailable"
      : JSON.stringify(actualEntities) === JSON.stringify(prospectEntities)
        ? "same"
        : "partial";
  return {
    coverage,
    actualEntities,
    prospectEntities,
    points: sales.map((value, i) => {
      // Future planning carries the last completed actual YTD, without creating future actuals.
      const actualYtd = actuals
        ? (cumulativeSales[Math.min(i, actuals.month - 1)] ?? null)
        : null;
      return {
        sales: value,
        prospect: prospect[i].monthly,
        cumulativeSales: cumulativeSales[i],
        cumulativeProspect: prospect[i].ytd,
        cumulativeCombined:
          coverage !== "unavailable" &&
          actualYtd !== null &&
          prospect[i].ytd !== null
            ? actualYtd + prospect[i].ytd!
            : null,
      };
    }),
  };
}
