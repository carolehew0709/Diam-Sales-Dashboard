import type { Amount, Scenario } from "./types";
import type { Metric } from "./dashboard";
import { integerAxis } from "./chart-axis";
import { reportingMonthClosed, type ReportingPeriod } from "./reporting-period";

export type PerformanceSeriesKey = "base" | "scenario";

/** Sum the selected snapshot's team delivery allocations, never weekly snapshots. */
export function teamMonthlyPerformance(
  teams: readonly { monthly: Amount[] }[],
) {
  const monthly = Array.from({ length: 12 }, (_, index): Amount =>
    teams.length && teams.every((team) => team.monthly[index] != null)
      ? teams.reduce((sum, team) => sum + team.monthly[index]!, 0)
      : null,
  );
  return monthly.map((value, index) => ({
    monthly: value,
    ytd: monthly.slice(0, index + 1).every((amount) => amount !== null)
      ? monthly
          .slice(0, index + 1)
          .reduce<number>((sum, amount) => sum + amount!, 0)
      : null,
  }));
}

/** Zero-based first unfinished month; mixed scopes use the earliest unclosed boundary. */
export function firstOpenMonth(
  year: number,
  reports: (ReportingPeriod | undefined)[],
): number | null {
  if (
    !reports.length ||
    reports.some(
      (s) =>
        !s ||
        !Number.isInteger(s.year) ||
        !Number.isInteger(s.month) ||
        s.month < 1 ||
        s.month > 12,
    )
  )
    return null;
  return Math.max(
    0,
    Math.min(
      12,
      ...reports.map(
        (s) =>
          (s!.year - year) * 12 +
          s!.month -
          1 +
          (reportingMonthClosed(s!) ? 1 : 0),
      ),
    ),
  );
}

/** Trend scenarios use invoiced Sales and committed Prospect, excluding additional P1. */
export function monthlyPerformanceSeries(
  metrics: Pick<Metric, "monthly" | "cumulative">,
  scenario: Scenario,
  dimensionScoped = false,
) {
  const hasSales = metrics.monthly.some((m) => m.sales != null) ||
    metrics.cumulative.some((m) => m.sales != null);
  if (scenario === "Sales + Prospect" && dimensionScoped && !hasSales) {
    const points = teamMonthlyPerformance([{ monthly: metrics.monthly.map((m) => m.orderbook) }]);
    return {
      key: "orderbook" as const,
      points: metrics.monthly.map((m, i) => ({ label: m.label, ...points[i] })),
    };
  }
  const key: "sales" | "base" = scenario === "Sales" ? "sales" : "base";
  return {
    key,
    points: metrics.monthly.map((m, i) => ({
      label: m.label,
      monthly: m[key],
      ytd: metrics.cumulative[i][key],
    })),
  };
}

/** Keep the source-backed orderbook separate from closed actuals and adjustments. */
export function monthlySalesParts(
  month: Pick<Metric["monthly"][number], "sales" | "orderbook" | "base">,
) {
  const sales = month.sales;
  if (month.base === null) return { sales, prospect: null };
  const outstanding = month.base - (sales ?? 0);
  const prospect =
    Math.abs(outstanding) < 1e-8
      ? 0
      : month.orderbook !== null && Math.abs(outstanding - month.orderbook) < 1e-8
        ? month.orderbook
        : null;
  return { sales, prospect };
}

/** Fit the axis to the actual plotted points from both scenarios of each sales type. */
export function monthlyPerformanceAxis(
  variants: readonly Pick<Metric, "monthly" | "cumulative">[],
  dimensionScoped: boolean,
) {
  return integerAxis(
    variants.flatMap((metrics) => [
      ...(["Sales", "Sales + Prospect"] as const).flatMap((scenario) =>
        monthlyPerformanceSeries(metrics, scenario, dimensionScoped).points
          .flatMap(({ monthly, ytd }) => [monthly, ytd]),
      ),
      ...metrics.monthly.flatMap((month) => {
        const { sales, prospect } = monthlySalesParts(month);
        return [
          Math.min(0, sales ?? 0) + Math.min(0, prospect ?? 0),
          Math.max(0, sales ?? 0) + Math.max(0, prospect ?? 0),
        ];
      }),
    ]),
  );
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
