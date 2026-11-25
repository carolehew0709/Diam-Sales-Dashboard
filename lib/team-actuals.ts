import type { Store, Filters, User, Snapshot } from "./types";
import { entities, matchesRegion } from "./entities";
import { canView } from "./permissions";
import type { TeamActualLine } from "./team-actual-types";
import { splitPannyTeam } from "./team-names";

const actualTeamName = (row: TeamActualLine) =>
  splitPannyTeam(row.originalTeam, row.team);

export function teamReportingName(
  value: string | undefined,
  data?: Store["teamActualData"],
) {
  const name = value?.replace(/\s+/g, " ").trim() ?? "";
  const key =
    name === "LVMH+Exclusive Team"
      ? "LVMH Team"
      : name === "BD-Trading"
        ? "BD"
        : name;
  const mapped =
    data && Object.hasOwn(data.mappings, key) ? data.mappings[key] : name;
  return splitPannyTeam(name, mapped);
}

/** Rename reporting copies only, preserving raw weekly and retained-source evidence. */
export function teamNamesState(state: Store): Store {
  const data = state.teamActualData;
  const rename = (lines: Store["lines"]) =>
    lines.map((l) => {
      if (!["dhk", "ddc"].includes(l.entityId)) return l;
      const name = teamReportingName(l.salesTeam, data);
      return name !== (l.salesTeam ?? "").replace(/\s+/g, " ").trim()
        ? { ...l, salesTeam: name }
        : l;
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
export function teamActualView(
  state: Store,
  user: User,
  filters: Filters,
  { includeRows = false } = {},
) {
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
  const rawScoped = data.rows.filter(
    (r) =>
      allowed.some((e) => e.id === r.entityId) &&
      (filters.salesType === "all" || filters.salesType === r.salesType),
  );
  const scoped = rawScoped.filter(
    (r) => !(r.entityId === "ddc" && r.salesType === "group"),
  );
  if (!allowed.some((e) => ["dhk", "ddc"].includes(e.id))) return null;
  const unavailable =
    filters.year !== data.year
      ? "year"
      : filters.customer && filters.customer !== "all"
        ? "customer"
        : null;
  const names = unavailable
    ? []
    : [...new Set(scoped.map(actualTeamName))].sort();
  const rows = unavailable
    ? []
    : scoped.filter(
        (r) =>
          !filters.salesTeam ||
          filters.salesTeam === "all" ||
          actualTeamName(r) === filters.salesTeam,
      );
  const rawSelected = unavailable
    ? []
    : rawScoped.filter(
        (r) =>
          !filters.salesTeam ||
          filters.salesTeam === "all" ||
          actualTeamName(r) === filters.salesTeam,
      );
  const sourceSales = rawSelected.length
    ? rawSelected.reduce((n, r) => n + r.ytd, 0)
    : null;
  const excludedDdcGroup = unavailable
    ? null
    : rawSelected
        .filter((r) => r.entityId === "ddc" && r.salesType === "group")
        .reduce((n, r) => n + r.ytd, 0);
  const groups = [...new Set(rows.map(actualTeamName))]
    .map((name) => {
      const selected = rows.filter((r) => actualTeamName(r) === name),
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
    detailRows: includeRows ? rows : undefined,
    sourceSales,
    excludedDdcGroup,
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

/** Latest reporting copy only: never attach the October YTD to earlier weekly history. */
export function projectTeamActuals(
  state: Store,
  snapshot: Snapshot,
  team: string,
  customer: string,
): Snapshot {
  const data = state.teamActualData;
  if (
    !data ||
    team === "all" ||
    customer !== "all" ||
    snapshot.year !== data.year ||
    snapshot.week !==
      Math.max(
        ...state.snapshots
          .filter(
            (s) => s.entityId === snapshot.entityId && s.year === snapshot.year,
          )
          .map((s) => s.week),
      )
  )
    return snapshot;
  const sourceRows = data.rows.filter(
    (r) => r.entityId === snapshot.entityId && actualTeamName(r) === team,
  );
  if (!sourceRows.length) return snapshot;
  const rows = sourceRows.filter(
    (r) => !(r.entityId === "ddc" && r.salesType === "group"),
  );
  const sum = (type: string, kind: "sales" | "budget", month?: number) =>
    rows
      .filter((r) => r.salesType === type)
      .reduce(
        (n, r) =>
          n +
          (month !== undefined
            ? r.monthly[month]!
            : kind === "sales"
              ? r.ytd
              : (r.budget ?? 0)),
        0,
      );
  const turnover = {
    external: sum("external", "sales"),
    group: sum("group", "sales"),
  };
  const budget = {
    external: sum("external", "budget"),
    group: sum("group", "budget"),
  };
  const current = {
    external: sum("external", "sales", data.month - 1),
    group: sum("group", "sales", data.month - 1),
  };
  return {
    ...snapshot,
    month: data.month,
    turnover,
    monthTurnover: current,
    monthEstimate: current,
    annualBudget: budget.external + budget.group,
    monthlySales: {
      external: Array.from({ length: 12 }, (_, i) =>
        i < data.month ? sum("external", "sales", i) : null,
      ),
      group: Array.from({ length: 12 }, (_, i) =>
        i < data.month ? sum("group", "sales", i) : null,
      ),
    },
    teamActualSource: {
      year: data.year,
      month: data.month,
      week: data.reportingWeek,
      sourceFile: data.sourceFile,
      sourceSheet: data.sourceSheet,
      budget,
    },
    sourceCells: {
      ...snapshot.sourceCells,
      teamActuals:
        data.sourceFile +
        " · " +
        data.sourceSheet +
        " · Sales/Team Annual Budget · EUR converted to kEUR",
    },
    findings: snapshot.findings.filter(
      (f) =>
        f !==
        "Team invoices and budget not supplied; only team orderbook is available",
    ),
  };
}
