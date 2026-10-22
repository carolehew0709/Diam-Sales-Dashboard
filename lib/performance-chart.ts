import type { Amount } from "./types";

export type PerformanceSeriesKey = "base" | "scenario";

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
