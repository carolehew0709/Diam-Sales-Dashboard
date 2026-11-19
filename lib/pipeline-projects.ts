import {
  pipelineIncomeKEUR,
  pipelineTotals,
  previousMonth,
  weekStart,
  isoDate,
  type Opportunity,
} from "./pipeline";

export const projectKey = (row: Opportunity) =>
  `${row.entityId}:${row.project}`;
export type PipelinePeriod = "weekly" | "ytd";
export function projectDates(rows: Opportunity[], asOf: string) {
  const dates = new Map<string, { created: string; lost: string | null }>();
  for (const row of rows) {
    if (row.created > asOf) continue;
    const key = projectKey(row),
      known = dates.get(key);
    const lost =
      row.status === "lost" && row.decided && row.decided <= asOf
        ? row.decided
        : null;
    dates.set(key, {
      created:
        known && known.created < row.created ? known.created : row.created,
      lost: known?.lost && (!lost || known.lost < lost) ? known.lost : lost,
    });
  }
  return dates;
}
export function projectPeriodRows(
  rows: Opportunity[],
  reference: Opportunity[],
  asOf: string,
  period: PipelinePeriod,
) {
  const dates = projectDates(reference, asOf),
    start = period === "weekly" ? weekStart(asOf) : `${asOf.slice(0, 4)}-01-01`;
  return rows.filter(
    (r) =>
      r.created <= asOf && (dates.get(projectKey(r))?.created ?? "") >= start,
  );
}
export function projectTotals(rows: Opportunity[]) {
  const total = pipelineTotals(rows);
  return {
    projects: new Set(rows.map(projectKey)).size,
    kEUR: rows.length ? pipelineIncomeKEUR(total.amounts) : 0,
    missing: new Set(rows.filter((r) => r.amount === null).map(projectKey))
      .size,
  };
}
export function pipelineProjectMovement(
  rows: Opportunity[],
  asOf: string,
  reference = rows,
) {
  const dates = projectDates(reference, asOf),
    start = `${asOf.slice(0, 4)}-01-01`,
    week = weekStart(asOf),
    month = asOf.slice(0, 7),
    priorMonth = previousMonth(month);
  const available = rows.filter((r) => r.created <= asOf),
    ids = [...new Set(available.map(projectKey))];
  const created = ids.filter((id) => dates.get(id)!.created >= start);
  const lost = ids.filter(
    (id) => dates.get(id)!.lost && dates.get(id)!.lost! >= start,
  );
  const thisWeek = created.filter((id) => dates.get(id)!.created >= week),
    lostWeek = lost.filter((id) => dates.get(id)!.lost! >= week);
  const income = (keys: string[], loss = false) => {
    const set = new Set(keys);
    const totals = projectTotals(
      available.filter(
        (r) =>
          set.has(projectKey(r)) &&
          (!loss || (r.status === "lost" && !!r.decided && r.decided <= asOf)),
      ),
    );
    return { kEUR: totals.kEUR, missing: totals.missing };
  };
  const trend: { week: string; added: number; lost: number }[] = [];
  for (
    let d = +new Date(weekStart(start) + "T00:00:00Z");
    d <= +new Date(week + "T00:00:00Z");
    d += 7 * 86400000
  ) {
    const w = isoDate(new Date(d)),
      end = isoDate(new Date(d + 6 * 86400000));
    trend.push({
      week: w,
      added: created.filter((id) => dates.get(id)!.created <= end).length,
      lost: lost.filter((id) => dates.get(id)!.lost! <= end).length,
    });
  }
  return {
    ytdAdded: created.length,
    ytdLost: lost.length,
    weekAdded: thisWeek.length,
    weekLost: lostWeek.length,
    income: {
      ytdAdded: income(created),
      ytdLost: income(lost, true),
      weekAdded: income(thisWeek),
      weekLost: income(lostWeek, true),
    },
    monthAdded: created.filter((id) => dates.get(id)!.created.startsWith(month))
      .length,
    priorMonthAdded: created.filter((id) =>
      dates.get(id)!.created.startsWith(priorMonth),
    ).length,
    monthLost: lost.filter((id) => dates.get(id)!.lost!.startsWith(month))
      .length,
    priorMonthLost: lost.filter((id) =>
      dates.get(id)!.lost!.startsWith(priorMonth),
    ).length,
    month,
    priorMonth,
    undatedLosses: new Set(
      available
        .filter((r) => r.status === "lost" && !r.decided)
        .map(projectKey),
    ).size,
    trend,
  };
}
export function projectStatusTrend(
  rows: Opportunity[],
  reference: Opportunity[],
  asOf: string,
  period: PipelinePeriod,
  keys: string[],
  byStage: boolean,
) {
  const dates = projectDates(reference, asOf),
    eligible = projectPeriodRows(rows, reference, asOf, "ytd");
  const start = weekStart(`${asOf.slice(0, 4)}-01-01`),
    last = weekStart(asOf);
  const trend: {
    week: string;
    values: { key: string; projects: number; kEUR: number | null }[];
  }[] = [];
  for (
    let d = +new Date(start + "T00:00:00Z");
    d <= +new Date(last + "T00:00:00Z");
    d += 7 * 86400000
  ) {
    const w = isoDate(new Date(d)),
      end = isoDate(new Date(d + 6 * 86400000));
    const cohort = eligible.filter((r) => {
      const date = dates.get(projectKey(r))!.created;
      return date <= end && (period === "ytd" || date >= w);
    });
    trend.push({
      week: w,
      values: keys.map((key) => ({
        key,
        ...projectTotals(
          cohort.filter(
            (r) => (byStage ? (r.stage ?? "unspecified") : r.status) === key,
          ),
        ),
      })),
    });
  }
  return trend;
}
