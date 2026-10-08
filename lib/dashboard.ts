import { reportingState } from "./intercompany";
import { applyApprovedBudget, approved2027Budgets, pending2027Budgets } from "./annual-budgets";
import { applyReportingOverrides } from "./reporting-overrides";
import { entities, regions, matchesRegion } from "./entities";
import { canView } from "./permissions";
import type {
  Amount,
  Filters,
  Snapshot,
  Store,
  User,
  Split,
  SalesType,
} from "./types";
export const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export const defaultFilters: Filters = {
  region: "China",
  bu: "all",
  entity: "all",
  year: 2026,
  scenario: "Sales + Prospect",
  salesType: "all",
};
export function filtersFrom(url: URL): Filters {
  return {
    region: url.searchParams.get("region") ?? "China",
    bu:
      url.searchParams.get("bu") === "DHK"
        ? "DEHK"
        : (url.searchParams.get("bu") ?? "all"),
    entity: url.searchParams.get("entity") ?? "all",
    year: url.searchParams.get("year") === "2027" ? 2027 : 2026,
    scenario:
      url.searchParams.get("scenario") === "Sales"
        ? "Sales"
        : "Sales + Prospect",
    salesType: ["external", "group"].includes(
      url.searchParams.get("salesType") ?? "",
    )
      ? (url.searchParams.get("salesType") as SalesType)
      : "all",
  };
}
export const sumKnown = (values: Amount[]): Amount =>
  values.some((v) => v !== null)
    ? values.reduce<number>((a, v) => a + (v ?? 0), 0)
    : null;
export const sumComplete = (values: Amount[]): Amount =>
  values.length && values.every((v) => v !== null)
    ? values.reduce<number>((a, v) => a + v!, 0)
    : null;
export const splitValue = (split: Split, type: SalesType): Amount =>
  type === "all" ? sumComplete([split.external, split.group]) : split[type];
export function entityMetric(s: Snapshot | undefined, filters: Filters, entityId = s?.entityId) {
  if (s) s = applyReportingOverrides(applyApprovedBudget(s), filters.salesType);
  const future = filters.year === 2027,
    type = filters.salesType;
  const sales = s && !future ? splitValue(s.turnover, type) : s ? 0 : null;
  const unallocatedNext = future && s?.nextOrderbookOverride != null;
  const orderbook =
    unallocatedNext && type === "all"
      ? s!.nextOrderbookOverride!
      : s
        ? splitValue(future ? s.nextOrderbook : s.orderbook, type)
        : null;
  const base =
    s &&
    !future &&
    s.entityId === "ddc" &&
    s.ddcAnnualTotal !== undefined &&
    type === "all"
      ? s.ddcAnnualTotal
      : s && !future && s.baseOverride !== null
        ? type === "all"
          ? s.baseOverride
          : null
        : sumComplete([sales, orderbook]);
  const prospect =
    s && type === "all" ? (future ? s.nextProspect : s.prospect) : null;
  const budget =
    type === "all" && future && entityId
      ? (approved2027Budgets[entityId] ?? pending2027Budgets[entityId] ?? s?.nextAnnualBudget ?? null)
      : s && type === "all" ? s.annualBudget : null;
  const budgetComplete = budget !== null && !(future && entityId && entityId in pending2027Budgets);
  const budgetComparable = budgetComplete || (future && type === "all" && !!entityId && entityId in pending2027Budgets);
  const scenarioComplete =
    base !== null && (filters.scenario === "Sales" || prospect !== null);
  const scenario =
    base === null
      ? null
      : base + (filters.scenario === "Sales" ? 0 : (prospect ?? 0));
  const monthSales = s && !future ? splitValue(s.monthTurnover, type) : null,
    monthEstimate = s && !future ? splitValue(s.monthEstimate, type) : null;
  const remaining =
    monthSales !== null && monthEstimate !== null
      ? Math.max(0, monthEstimate - monthSales)
      : null;
  const monthly = months.map((label, i) => {
    const ob =
      unallocatedNext && type === "all"
        ? null
        : s
          ? splitValue(
              {
                external: (future ? s.nextMonthlyOrderbook : s.monthlyOrderbook)
                  .external[i],
                group: (future ? s.nextMonthlyOrderbook : s.monthlyOrderbook)
                  .group[i],
              },
              type,
            )
          : null;
    const actual =
      s && !future
        ? i >= s.month
          ? 0
          : splitValue(
              {
                external: s.monthlySales.external[i],
                group: s.monthlySales.group[i],
              },
              type,
            )
        : s
          ? 0
          : null;
    const base =
      s && !future && s.monthlyBaseOverride && type === "all"
        ? s.monthlyBaseOverride[i]
        : sumComplete([actual, ob]);
    const upside = s && !future && type === "all" ? s.monthlyProspect[i] : null;
    return {
      label,
      base,
      prospect: upside,
      scenario:
        filters.scenario === "Sales" ? base : sumComplete([base, upside]),
      budget: s && !future && type === "all" ? s.monthlyBudget[i] : null,
      orderbook: ob,
    };
  });
  // Anchor the current cumulative point to YTD + current-month OB; don't allocate YTD across missing historical months.
  const cumulative = monthly.map((m, i) => {
    let base = sumComplete(monthly.slice(0, i + 1).map((x) => x.base));
    if (s && !future && !s.monthlyBaseOverride && i >= s.month - 1)
      base = sumComplete([
        sales,
        ...monthly.slice(s.month - 1, i + 1).map((x) => x.orderbook),
      ]);
    const p = sumComplete(monthly.slice(0, i + 1).map((x) => x.prospect));
    return {
      label: m.label,
      base,
      scenario: filters.scenario === "Sales" ? base : sumComplete([base, p]),
      budget: sumComplete(monthly.slice(0, i + 1).map((x) => x.budget)),
    };
  });
  return {
    sales,
    orderbook,
    base,
    prospect,
    scenario,
    scenarioComplete,
    budget,
    budgetComplete,
    budgetComparable,
    coverage:
      budgetComparable && budget !== null && budget > 0 && base !== null
        ? base / budget
        : null,
    gap: budgetComparable && budget !== null && base !== null ? base - budget : null,
    remaining,
    monthSales,
    monthEstimate,
    monthly,
    cumulative,
  };
}
export type Metric = ReturnType<typeof entityMetric>;
/** First-row display only; never changes annual KPI or scenario calculations. */
export function chinaStripAmount(row: { snapshot?: Snapshot; metrics: Metric }, filters: Filters): Amount {
  if (filters.year === 2026 && filters.scenario === "Sales") {
    return filters.salesType === "all" && row.snapshot?.salesCardValue !== undefined
      ? row.snapshot.salesCardValue : row.metrics.sales;
  }
  return filters.year === 2026 && filters.salesType === "all" && row.snapshot?.entityId === "dcp" && row.snapshot.sourceCells.dcpReporting
    ? row.metrics.sales : row.metrics.base;
}
export function combine(metrics: Metric[], showKnownBudget = false): Metric {
  const total = (
    key:
      | "sales"
      | "orderbook"
      | "base"
      | "prospect"
      | "scenario"
      | "remaining"
      | "monthSales"
      | "monthEstimate",
  ) => sumKnown(metrics.map((m) => m[key]));
  const completeBudget = metrics.every((m) => m.budgetComplete)
    ? sumComplete(metrics.map((m) => m.budget)) : null;
  const comparableBudget = metrics.every(m => m.budgetComparable)
    ? sumComplete(metrics.map(m => m.budget)) : null;
  const budget = showKnownBudget ? sumKnown(metrics.map((m) => m.budget)) : completeBudget;
  // Coverage and Gap always compare the complete annual Sales + OB base, excluding Prospect.
  const completeBase = sumComplete(metrics.map((m) => m.base));
  const scenarioComplete =
    metrics.length > 0 && metrics.every((m) => m.scenarioComplete)
      ? sumComplete(metrics.map((m) => m.scenario))
      : null;
  return {
    sales: total("sales"),
    orderbook: total("orderbook"),
    base: total("base"),
    prospect: total("prospect"),
    scenario: total("scenario"),
    scenarioComplete: scenarioComplete !== null,
    budget,
    budgetComplete: completeBudget !== null,
    budgetComparable: comparableBudget !== null,
    coverage:
      comparableBudget !== null && comparableBudget > 0 && completeBase !== null
        ? completeBase / comparableBudget
        : null,
    gap:
      comparableBudget !== null && completeBase !== null
        ? completeBase - comparableBudget
        : null,
    remaining: total("remaining"),
    monthSales: total("monthSales"),
    monthEstimate: total("monthEstimate"),
    monthly: months.map((label, i) => ({
      label,
      base: sumComplete(metrics.map((m) => m.monthly[i].base)),
      prospect: sumComplete(metrics.map((m) => m.monthly[i].prospect)),
      scenario: sumComplete(metrics.map((m) => m.monthly[i].scenario)),
      budget: sumComplete(metrics.map((m) => m.monthly[i].budget)),
      orderbook: sumComplete(metrics.map((m) => m.monthly[i].orderbook)),
    })),
    cumulative: months.map((label, i) => ({
      label,
      base: sumComplete(metrics.map((m) => m.cumulative[i].base)),
      scenario: sumComplete(metrics.map((m) => m.cumulative[i].scenario)),
      budget: sumComplete(metrics.map((m) => m.cumulative[i].budget)),
    })),
  };
}
export function getDashboardSnapshot(
  state: Store,
  user: User,
  filters: Filters,
) {
  state = reportingState(state, filters.salesType);
  const allowed = entities.filter((e) => canView(user, e));
  const latest = (id: string) =>
    state.snapshots
      .filter((s) => s.entityId === id && s.year === 2026)
      .sort((a, b) => b.week - a.week)[0];
  const rows = allowed.map((entity) => {
    const raw = latest(entity.id);
    const snapshot = raw ? applyApprovedBudget(raw) : undefined;
    return { entity, snapshot, metrics: entityMetric(snapshot, filters, entity.id) };
  });
  const selected = rows.filter(
    (r) =>
      matchesRegion(r.entity, filters.region) &&
      (filters.bu === "all" ||
        r.entity.businessUnit === filters.bu ||
        (filters.bu === "DHK" && r.entity.id === "dhk")) &&
      (filters.entity === "all" || r.entity.id === filters.entity),
  );
  const combineSelected = (metrics: Metric[]) => combine(metrics, filters.year === 2027);
  const totals = combineSelected(selected.map((r) => r.metrics));
  const china = rows.filter((r) => r.entity.reportingRegion === "China");
  const chinaTotal = combineSelected(china.map((r) => r.metrics));
  const weeks = [
    ...new Set(selected.flatMap((r) => (r.snapshot ? [r.snapshot.week] : []))),
  ].sort((a, b) => a - b);
  const visibleLines = state.lines.filter(
    (l) =>
      selected.some(
        (r) => r.entity.id === l.entityId && r.snapshot?.week === l.week,
      ) &&
      (filters.salesType === "all" ||
        l.customerType.toLowerCase() === filters.salesType),
  );
  const commercial = Object.entries(
    visibleLines.reduce<Record<string, number>>((a, l) => {
      const value = filters.year === 2027 ? l.total2027 : l.total2026;
      a[l.customer || "Unspecified customer"] =
        (a[l.customer || "Unspecified customer"] ?? 0) + value;
      return a;
    }, {}),
  )
    .map(([customer, value]) => ({ customer, value }))
    .sort((a, b) => b.value - a.value);
  const buGroups = [...new Set(selected.map((r) => r.entity.businessUnit))].map(
    (bu) => ({
      name: bu,
      metrics: combineSelected(
        selected
          .filter((r) => r.entity.businessUnit === bu)
          .map((r) => r.metrics),
      ),
    }),
  );
  const checks = selected.flatMap((r) =>
    !r.snapshot
      ? [{ entity: r.entity.code, message: "Source workbook not supplied" }]
      : r.snapshot.findings.map((message) => ({
          entity: r.entity.code,
          message,
        })),
  );
  if (filters.year === 2027) checks.push(...selected
    .filter(r => r.entity.id in pending2027Budgets)
    .map(r => ({entity:r.entity.code,message:"FY2027 annual budget pending; displayed as 0"})));
  const partialKeys = (
    ["sales", "orderbook", "base", "prospect", "scenario", "remaining"] as const
  ).filter((key) =>
    selected.some(
      (r) =>
        r.metrics[key] === null ||
        (key === "scenario" && !r.metrics.scenarioComplete),
    ),
  );
  const history = selected.map((r) => ({
    entity: r.entity,
    records: state.snapshots
      .filter((s) => s.entityId === r.entity.id)
      .sort((a, b) => a.week - b.week)
      .map((s) => ({ week: s.week, value: entityMetric(s, filters).scenario })),
  }));
  return {
    filters,
    entities: allowed,
    regions,
    rows: selected,
    totals,
    china,
    chinaTotal,
    buGroups,
    weeks,
    checks,
    partialKeys,
    commercial,
    history,
    revision: state.revision,
    latestPublish:
      state.audit.filter((a) => a.action === "publish").at(-1)?.at ?? null,
    sourceCount: selected.filter((r) => r.snapshot).length,
    external: sumKnown(
      selected.map((r) =>
        r.snapshot
          ? entityMetric(r.snapshot, { ...filters, salesType: "external" }).base
          : null,
      ),
    ),
    group: sumKnown(
      selected.map((r) =>
        r.snapshot
          ? entityMetric(r.snapshot, { ...filters, salesType: "group" }).base
          : null,
      ),
    ),
  };
}
export type Dashboard = ReturnType<typeof getDashboardSnapshot>;
export function formatK(value: Amount) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        value,
      );
}
export function percent(value: Amount) {
  return value === null ? "Review" : `${(value * 100).toFixed(0)}%`;
}
