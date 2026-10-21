import type { Filters, Store, Entity, Amount } from "./types";
import type { SalesGraphicSeries } from "./graphics-types";

const complete = (values: Amount[]): Amount =>
  values.length && values.every((v) => v !== null)
    ? values.reduce<number>((a, v) => a + v!, 0)
    : null;

/** Input is the same scoped reporting projection used for dashboard KPIs. */
export function salesGraphicSeries(
  state: Store,
  selected: Entity[],
  filters: Filters,
): SalesGraphicSeries[] {
  const series = selected.map((entity) => {
    const snapshots = state.snapshots.filter(
      (s) => s.entityId === entity.id && s.year === filters.year,
    );
    const byMonth = Array.from(
      { length: 12 },
      (_, i) =>
        snapshots
          .filter((s) => s.month === i + 1)
          .sort((a, b) => b.week - a.week)[0],
    );
    const ytd = byMonth.map((s): Amount =>
      !s || s.teamScope
        ? null
        : filters.salesType === "all"
          ? complete([s.turnover.external, s.turnover.group])
          : s.turnover[filters.salesType],
    );
    return {
      id: entity.id,
      name: entity.code,
      points: byMonth.map((s, i) => ({
        month: i + 1,
        ytd: ytd[i],
        // Never allocate an owner-confirmed YTD adjustment to a month.
        monthly:
          s?.sourceCells.dcpYtdSales ||
          (i > 0 && byMonth[i - 1]?.sourceCells.dcpYtdSales)
            ? null
            : i === 0
              ? ytd[i]
              : ytd[i] !== null && ytd[i - 1] !== null
                ? ytd[i]! - ytd[i - 1]!
                : null,
        week: s?.week ?? null,
        sourceFile: s?.sourceFile ?? null,
        sourceSheet: s?.sourceSheet ?? null,
      })),
    };
  });
  return [
    {
      id: "total",
      name: filters.region,
      points: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        ytd: complete(series.map((s) => s.points[i].ytd)),
        monthly: complete(series.map((s) => s.points[i].monthly)),
        week: null,
        sourceFile: null,
        sourceSheet: null,
      })),
    },
    ...series,
  ];
}
