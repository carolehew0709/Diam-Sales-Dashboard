import { entities, matchesRegion } from "./entities";
import { canView } from "./permissions";
import type { User } from "./types";

export const pipelineStatuses = ["active", "won", "lost"] as const;
export const pipelineCurrencies = ["EUR", "RMB", "USD"] as const;
export const pipelineStages = [
  "quote",
  "design",
  "sample",
  "production",
  "complete",
] as const;
export type PipelineStatus = (typeof pipelineStatuses)[number];
export type PipelineCurrency = (typeof pipelineCurrencies)[number];
export type PipelineStage = (typeof pipelineStages)[number];

export type Opportunity = {
  id: string;
  project: string;
  name: string;
  team: string;
  brand: string;
  customerGroup: string;
  customer: string;
  entityId: string;
  status: PipelineStatus;
  stage: PipelineStage | null;
  currency: PipelineCurrency;
  amount: number | null;
  created: string;
  decided: string | null;
  keyProject: boolean;
  sourceRow: number;
};

export type PipelineSnapshot = {
  id: string;
  entityId: string;
  asOf: string;
  fileName: string;
  sheet: string;
  fingerprint: string;
  rows: Opportunity[];
};

export type PipelineFilters = {
  region: string;
  entity: string;
  team: string;
  group: string;
  customer: string;
};

export const pipelineFilters: PipelineFilters = {
  region: "",
  entity: "",
  team: "",
  group: "",
  customer: "",
};

export const hasPipelineAccess = (user: User) =>
  entities.some((entity) => canView(user, entity));

const DAY = 86_400_000;
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
export function weekStart(value: string) {
  const date = new Date(value + "T00:00:00Z");
  return isoDate(new Date(+date - ((date.getUTCDay() + 6) % 7) * DAY));
}

export function weekLabel(monday: string) {
  const thursday = new Date(+new Date(monday + "T00:00:00Z") + 3 * DAY);
  const year = thursday.getUTCFullYear();
  const week = Math.ceil((+thursday - Date.UTC(year, 0, 1) + DAY) / (7 * DAY));
  return `${year} · W${String(week).padStart(2, "0")}`;
}

export function previousMonth(month: string) {
  const [year, number] = month.split("-").map(Number);
  return isoDate(new Date(Date.UTC(year, number - 2, 1))).slice(0, 7);
}

export function pipelineForWeek(
  snapshots: PipelineSnapshot[],
  user: User,
  requested: string | null,
) {
  const scope = entities.filter((entity) => canView(user, entity));
  const allowed = new Set(scope.map((entity) => entity.id));
  const ordered = snapshots
    .filter((s) => allowed.has(s.entityId))
    .sort((a, b) => b.asOf.localeCompare(a.asOf));
  const weeks = [...new Set(ordered.map((s) => weekStart(s.asOf)))];
  const week =
    requested && weeks.includes(requested) ? requested : (weeks[0] ?? "");
  const current = scope.flatMap((entity) => {
    const snapshot = ordered.find(
      (s) => s.entityId === entity.id && weekStart(s.asOf) === week,
    );
    return snapshot ? [snapshot] : [];
  });
  const previous = current.flatMap((snapshot) => {
    const month = previousMonth(snapshot.asOf.slice(0, 7));
    const earlier = ordered.find(
      (s) => s.entityId === snapshot.entityId && s.asOf.startsWith(month),
    );
    return earlier ? [earlier] : [];
  });
  return { scope, weeks, week, current, previous };
}

export type PipelineData = ReturnType<typeof pipelineForWeek>;

export function pipelineRows(
  snapshots: PipelineSnapshot[],
  filters: PipelineFilters,
) {
  const ids = new Set(
    entities
      .filter(
        (entity) =>
          (!filters.entity || entity.id === filters.entity) &&
          (!filters.region || matchesRegion(entity, filters.region)),
      )
      .map((entity) => entity.id),
  );
  return snapshots
    .filter((s) => ids.has(s.entityId))
    .flatMap((s) => s.rows)
    .filter(
      (row) =>
        (!filters.team || (row.team || "__missing__") === filters.team) &&
        (!filters.group ||
          (row.customerGroup || "__missing__") === filters.group) &&
        (!filters.customer ||
          (row.customer || "__missing__") === filters.customer),
    );
}

function opportunityIncome(rows: Opportunity[]) {
  const amounts: Record<PipelineCurrency, number | null> = {
    EUR: null,
    RMB: null,
    USD: null,
  };
  let missing = 0;
  for (const { amount, currency } of rows) {
    if (amount === null) missing++;
    else amounts[currency] = (amounts[currency] ?? 0) + amount;
  }
  return { amounts, missing };
}

export function pipelineTotals(rows: Opportunity[]) {
  const { amounts, missing } = opportunityIncome(rows);
  return {
    projects: new Set(rows.map((row) => row.project)).size,
    opportunities: rows.length,
    withoutAmount: missing,
    amounts,
  };
}

// Fixed reporting rates: native currency units per EUR.
export const pipelineFx = { EUR: 1, RMB: 7.7, USD: 1.1 } as const;

export function pipelineIncomeKEUR(
  amounts: Record<PipelineCurrency, number | null>,
) {
  let eur: number | null = null;
  for (const currency of pipelineCurrencies) {
    const amount = amounts[currency];
    if (amount !== null) eur = (eur ?? 0) + amount / pipelineFx[currency];
  }
  return eur === null ? null : eur / 1000;
}

function movementIncome(rows: Opportunity[]) {
  const { amounts, missing } = opportunityIncome(rows);
  return {
    kEUR: rows.length ? pipelineIncomeKEUR(amounts) : 0,
    missing,
  };
}

/** The current export supplies creation and loss events, even before we have status snapshots. */
export function pipelineMovement(rows: Opportunity[], asOf: string) {
  const yearStart = `${asOf.slice(0, 4)}-01-01`;
  const week = weekStart(asOf);
  const month = asOf.slice(0, 7);
  const priorMonth = previousMonth(month);
  const created = rows.filter(
    (row) => row.created >= yearStart && row.created <= asOf,
  );
  const lost = rows.filter(
    (row) =>
      row.status === "lost" &&
      row.decided &&
      row.decided >= yearStart &&
      row.decided <= asOf,
  );
  const undatedLosses = rows.filter(
    (row) => row.status === "lost" && !row.decided,
  ).length;
  const firstDate = [
    ...created.map((r) => r.created),
    ...lost.map((r) => r.decided!),
  ].sort()[0];
  const events = new Map<string, { added: number; lost: number }>();
  for (const [kind, dates] of [
    ["added", created.map((r) => r.created)],
    ["lost", lost.map((r) => r.decided!)],
  ] as const)
    for (const date of dates) {
      const key = weekStart(date);
      const event = events.get(key) ?? { added: 0, lost: 0 };
      event[kind]++;
      events.set(key, event);
    }
  const trend = [];
  let added = 0;
  let losses = 0;
  if (firstDate)
    for (
      let date = +new Date(weekStart(firstDate));
      date <= +new Date(week);
      date += 7 * DAY
    ) {
      const start = isoDate(new Date(date));
      added += events.get(start)?.added ?? 0;
      losses += events.get(start)?.lost ?? 0;
      trend.push({ week: start, added, lost: losses });
    }
  const addedThisWeek = created.filter((r) => r.created >= week);
  const lostThisWeek = lost.filter((r) => r.decided! >= week);
  return {
    ytdAdded: created.length,
    ytdLost: lost.length,
    weekAdded: addedThisWeek.length,
    weekLost: lostThisWeek.length,
    income: {
      ytdAdded: movementIncome(created),
      ytdLost: movementIncome(lost),
      weekAdded: movementIncome(addedThisWeek),
      weekLost: movementIncome(lostThisWeek),
    },
    monthAdded: created.filter((r) => r.created.startsWith(month)).length,
    priorMonthAdded: created.filter((r) => r.created.startsWith(priorMonth))
      .length,
    monthLost: lost.filter((r) => r.decided!.startsWith(month)).length,
    priorMonthLost: lost.filter((r) => r.decided!.startsWith(priorMonth))
      .length,
    month,
    priorMonth,
    undatedLosses,
    trend,
  };
}
