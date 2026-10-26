import type { Filters, Store, Entity, Amount } from "./types";
import type { SalesGraphicSeries } from "./graphics-types";

/** Explore the authorized reporting region, excluding a specifically selected BU. */
export function exploreBusinessUnitRows<T extends { entity: Pick<Entity, "id" | "businessUnit"> }>(
  regionRows: readonly T[],
  filters: Pick<Filters, "bu" | "entity">,
): T[] {
  if (new Set(regionRows.map((row) => row.entity.businessUnit)).size <= 1) return [];
  const selectedBU = filters.bu !== "all"
    ? filters.bu === "DHK" ? "DEHK" : filters.bu
    : filters.entity !== "all"
      ? regionRows.find((row) => row.entity.id === filters.entity)?.entity.businessUnit
      : undefined;
  return regionRows.filter((row) => row.entity.businessUnit !== selectedBU);
}

const complete = (values: Amount[]): Amount =>
  values.length && values.every((v) => v !== null)
    ? values.reduce<number>((a, v) => a + v!, 0)
    : null;

/** Composition requires the complete selected scope and a positive total. */
export function businessUnitShares(values: Amount[]): Amount[] {
  const total = complete(values);
  if (
    total === null ||
    total <= 0 ||
    values.some((v) => !Number.isFinite(v) || v! < 0)
  )
    return values.map(() => null);
  return values.map((value) => value! / total);
}

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
