import type { Store, Filters, User } from "./types";
import { entities, matchesRegion } from "./entities";
import { canView } from "./permissions";
/** Rename reporting copies only, preserving raw weekly and retained-source evidence. */
export function teamNamesState(state: Store): Store {
  const data = state.teamActualData;
  if (!data) return state;
  const rename = (lines: Store["lines"]) =>
    lines.map((l) => {
      if (!["dhk", "ddc"].includes(l.entityId)) return l;
      const name = l.salesTeam?.replace(/\s+/g, " ").trim() ?? "";
      const key =
        name === "LVMH+Exclusive Team"
          ? "LVMH Team"
          : name === "BD-Trading"
            ? "BD"
            : name;
      const mapped = data.mappings[key];
      return mapped ? { ...l, salesTeam: mapped } : l;
    });
  return {
    ...state,
    lines: rename(state.lines),
    retainedTeamSource: state.retainedTeamSource
      ? {
          ...state.retainedTeamSource,
          lines: rename(state.retainedTeamSource.lines),
        }
      : undefined,
  };
}
export function teamActualView(state: Store, user: User, filters: Filters) {
  const data = state.teamActualData;
  if (!data) return null;
  const allowed = entities.filter(
    (e) =>
      canView(user, e) &&
      matchesRegion(e, filters.region) &&
      (filters.bu === "all" ||
        filters.bu === e.businessUnit ||
        (filters.bu === "DHK" && e.id === "dhk")) &&
      (filters.entity === "all" || filters.entity === e.id),
  );
  const scoped = data.rows.filter(
    (r) =>
      allowed.some((e) => e.id === r.entityId) &&
      !(r.entityId === "ddc" && r.salesType === "group") &&
      (filters.salesType === "all" || filters.salesType === r.salesType),
  );
  if (!allowed.some((e) => ["dhk", "ddc"].includes(e.id))) return null;
  const names = [...new Set(scoped.map((r) => r.team))].sort();
  const unavailable =
    filters.year !== data.year
      ? "year"
      : filters.customer && filters.customer !== "all"
        ? "customer"
        : null;
  const rows = unavailable
    ? []
    : scoped.filter(
        (r) =>
          !filters.salesTeam ||
          filters.salesTeam === "all" ||
          r.team === filters.salesTeam,
      );
  const groups = [...new Set(rows.map((r) => r.team))]
    .map((name) => {
      const selected = rows.filter((r) => r.team === name),
        sales = selected.reduce((a, r) => a + r.ytd, 0);
      const budget = selected.reduce((a, r) => a + (r.budget ?? 0), 0);
      return {
        name,
        sales,
        budget,
        attainment: budget > 0 ? sales / budget : null,
        monthly: Array.from({ length: 12 }, (_, i) =>
          i < data.month
            ? selected.reduce((a, r) => a + r.monthly[i]!, 0)
            : null,
        ),
        entityIds: [...new Set(selected.map((r) => r.entityId))],
      };
    })
    .sort((a, b) => b.sales - a.sales);
  const sales = groups.length ? groups.reduce((a, r) => a + r.sales, 0) : null,
    budget = groups.length ? groups.reduce((a, r) => a + r.budget, 0) : null;
  return {
    reportingWeek: data.reportingWeek,
    year: data.year,
    month: data.month,
    sourceFile: data.sourceFile,
    sourceSheet: data.sourceSheet,
    names,
    unavailable,
    groups,
    sales,
    budget,
    attainment:
      sales !== null && budget !== null && budget > 0 ? sales / budget : null,
    monthly: Array.from({ length: 12 }, (_, i) =>
      groups.length && i < data.month
        ? groups.reduce((a, r) => a + r.monthly[i]!, 0)
        : null,
    ),
  };
}
