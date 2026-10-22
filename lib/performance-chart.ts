import type { Amount } from "./types";
import type { Metric } from "./dashboard";
import type { Scenario } from "./types";

export type PerformanceSeriesKey = "base" | "scenario";

/** Original planning curves combined without substituting zero for missing Prospect. */
export function monthlyPerformanceSeries(
  metrics: Pick<Metric, "monthly" | "cumulative">,
  scenario: Scenario,
  salesTeam = "all",
) {
  const teamScoped = salesTeam !== "all";
  const wantsProspect = scenario === "Sales + Prospect";
  const hasScenario =
    metrics.monthly.some((m) => m.scenario !== null) ||
    metrics.cumulative.some((m) => m.scenario !== null);
  const key: PerformanceSeriesKey =
    wantsProspect && hasScenario ? "scenario" : "base";
  const partial =
    !teamScoped &&
    wantsProspect &&
    metrics.monthly.some(
      (m, i) =>
        (m.base !== null && m.scenario === null) ||
        (metrics.cumulative[i].base !== null &&
          metrics.cumulative[i].scenario === null),
    );
  return {
    key,
    partial,
    points: metrics.monthly.map((m, i) => ({
      label: m.label,
      monthly: teamScoped ? null : m[key],
      ytd: teamScoped ? null : metrics.cumulative[i][key],
    })),
  };
}

/** Compare the full monthly series, preserving zero values and missing months. */
export function performanceChartSeries(
  rows: { base: Amount; scenario: Amount }[],
): {
  keys: PerformanceSeriesKey[];
  scenario: "unavailable" | "same" | "distinct";
} {
  const keys: PerformanceSeriesKey[] = [];
  if (rows.some((r) => r.base !== null)) keys.push("base");
  if (!rows.some((r) => r.scenario !== null))
    return { keys, scenario: "unavailable" };
  if (rows.every((r) => r.base === r.scenario))
    return { keys, scenario: "same" };
  keys.push("scenario");
  return { keys, scenario: "distinct" };
}
