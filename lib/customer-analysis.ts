import { entities } from "./entities";
import { canView } from "./permissions";
import type { Store, User, Filters } from "./types";
import { customerName } from "./sales-teams";

export function customerAnalysisView(
  state: Store,
  user: User,
  filters: Filters,
  month?: string | null,
) {
  const permitted = ["dhk", "dcp", "ddc"].every((id) =>
    entities.some((e) => e.id === id && canView(user, e)),
  );
  const scopeMatches =
    ["APAC", "China"].includes(filters.region) &&
    filters.bu === "all" &&
    filters.entity === "all" &&
    filters.salesType === "all" &&
    (!filters.salesTeam || filters.salesTeam === "all");
  const records =
    permitted && scopeMatches
      ? (state.customerAnalyses ?? []).filter(
          (r) =>
            r.year === filters.year &&
            r.entityIds.length === 3 &&
            ["dhk", "dcp", "ddc"].every((id) => r.entityIds.includes(id)),
        )
      : [];
  const months = [...new Set(records.map((r) => r.month))].sort().reverse();
  const selected = month || months[0];
  const source = records.find((r) => r.month === selected);
  const customerScoped = !!filters.customer && filters.customer !== "all";
  const customers = source?.customers.filter((row) => !customerScoped || customerName(row.name) === customerName(filters.customer));
  const analysis = source && customers?.length
    ? { ...source, customers, breakdown: customerScoped ? [] : source.breakdown }
    : null;
  return {
    permitted,
    scopeMatches,
    months,
    customerScoped,
    customer: filters.customer ?? "all",
    referenceTotal: source?.breakdown.reduce((sum, row) => sum + row.values[3], 0) ?? null,
    analysis,
  };
}
