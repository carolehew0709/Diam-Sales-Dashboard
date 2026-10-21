import { entities } from "./entities";
import { canView } from "./permissions";
import type { Store, User, Filters } from "./types";

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
  return {
    permitted,
    scopeMatches,
    months,
    analysis: records.find((r) => r.month === selected) ?? null,
  };
}
