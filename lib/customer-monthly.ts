import { entities } from "./entities";
import { canView } from "./permissions";
import type { CustomerMonthlyDetails } from "./graphics-types";
import type { Filters, Store, User } from "./types";

export function customerMonthlyView(
  state: Store,
  user: User,
  filters: Filters,
) {
  const permitted = ["dhk", "dcp", "ddc"].every((id) =>
    entities.some((e) => e.id === id && canView(user, e)),
  );
  const scopeMatches =
    ["China", "APAC"].includes(filters.region) &&
    filters.bu === "all" &&
    filters.entity === "all" &&
    filters.salesType === "all" &&
    (!filters.salesTeam || filters.salesTeam === "all") &&
    (!filters.customer || filters.customer === "all");
  const source =
    permitted && scopeMatches
      ? (state.customerAnalyses ?? [])
          .filter(
            (a) =>
              a.monthlyDetails &&
              a.year === filters.year &&
              a.entityIds.length === 3 &&
              ["dhk", "ddc", "dcp"].every((id) => a.entityIds.includes(id)),
          )
          .sort((a, b) => b.month.localeCompare(a.month))[0]
      : undefined;
  return {
    permitted,
    scopeMatches,
    source: source
      ? {
          month: source.month,
          year: source.year,
          sourceFile: source.sourceFile,
          details: source.monthlyDetails!,
        }
      : null,
  };
}
export type MonthlyDetailFilters = {
  year: number;
  team: string;
  category: string;
  subgroup: string;
  customer: string;
};
export function monthlyDetailRows(
  details: CustomerMonthlyDetails,
  filters: Partial<MonthlyDetailFilters>,
) {
  return details.rows.filter(
    (row) =>
      (!filters.team || (row.team || "__unassigned__") === filters.team) &&
      (!filters.category || row.path[0] === filters.category) &&
      (!filters.subgroup || row.path[1] === filters.subgroup) &&
      (!filters.customer || row.name === filters.customer),
  );
}
export function monthlyDetailPoints(
  details: CustomerMonthlyDetails,
  filters: MonthlyDetailFilters,
) {
  const rows = monthlyDetailRows(details, filters);
  let ytd = 0,
    known = true;
  return Array.from({ length: 12 }, (_, i) => {
    // A row without any actuals in this year does not create unknown activity in other rows.
    const applicable = rows.filter((r) => r.ytd[filters.year] != null);
    const monthly =
      i < details.cutoffMonth &&
      applicable.length &&
      applicable.every((r) => r.monthly[filters.year]?.[i] != null)
        ? applicable.reduce((n, r) => n + r.monthly[filters.year][i]!, 0)
        : null;
    if (monthly === null) known = false;
    else ytd += monthly;
    return { month: i + 1, monthly, ytd: known ? ytd : null };
  });
}

export function monthlySalesComparison(
  source: ReturnType<typeof customerMonthlyView>["source"],
  year: number,
) {
  const priorYear = year - 1;
  if (!source || ![year, priorYear].every((period) => source.details.years.includes(period)))
    return undefined;
  const scope = { team: "", category: "", subgroup: "", customer: "" };
  const current = monthlyDetailPoints(source.details, { ...scope, year });
  const prior = monthlyDetailPoints(source.details, { ...scope, year: priorYear });
  const last = source.details.cutoffMonth - 1;
  if (current[last]?.ytd == null || prior[last]?.ytd == null) return undefined;
  return {
    current,
    prior,
    priorYear,
    cutoffMonth: source.details.cutoffMonth,
    sourceFile: source.sourceFile,
    sourceSheet: source.details.sourceSheet,
    sourceRange: source.details.sourceRange,
  };
}
