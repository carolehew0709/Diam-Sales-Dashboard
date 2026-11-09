import {
  approved2026Budgets,
  approved2027Budgets,
  approved2026BudgetSplits,
  approved2027BudgetSplits,
  pending2027Budgets,
} from "./annual-budgets";
import type {
  Store,
  BudgetVersion,
  CorrectionVersion,
  SalesType,
} from "./types";
/** Deterministic additive migration: never edits source snapshots or published records. */
export function ensureGovernance(state: Store) {
  if (!state.budgetVersions) {
    state.budgetVersions = [];
    for (const year of [2026, 2027]) {
      const totals = year === 2026 ? approved2026Budgets : approved2027Budgets;
      const splits =
        year === 2026 ? approved2026BudgetSplits : approved2027BudgetSplits;
      for (const [entityId, total] of Object.entries(totals))
        state.budgetVersions.push({
          id: `initial-budget-${entityId}-${year}`,
          entityId,
          year,
          total,
          external: splits[entityId]?.external ?? null,
          group: splits[entityId]?.group ?? null,
          reason: ["ddi", "ddj"].includes(entityId)
            ? "Owner approval 2026-10-24; total only"
            : "Owner final budget table 2026-10-09",
          actor: "migration",
          at: "2026-10-26T00:00:00.000Z",
        });
    }
    for (const entityId of Object.keys(pending2027Budgets))
      state.budgetVersions.push({
        id: `initial-budget-${entityId}-2027`,
        entityId,
        year: 2027,
        total: 0,
        external: 0,
        group: 0,
        pending: true,
        reason: "Owner provisional-zero decision; budget pending",
        actor: "migration",
        at: "2026-10-26T00:00:00.000Z",
      });
  }
  if (!state.correctionVersions)
    state.correctionVersions = [
      {
        id: "initial-dcp-ytd",
        entityId: "dcp",
        year: 2026,
        weeks: [40, 41, 42, 43],
        salesType: "external",
        metric: "sales",
        value: 260.81449,
        reason:
          "Owner confirmations: W40 2026-10-03; W41 2026-10-11; W42 2026-10-19; W43 2026-10-24. No monthly allocation.",
        actor: "migration",
        at: "2026-10-26T00:00:00.000Z",
      },
      {
        id: "initial-dhk-next",
        entityId: "dhk",
        year: 2027,
        weeks: [40],
        salesType: "all",
        metric: "orderbook",
        value: 2597,
        reason:
          "Owner 2026-10-03 W40 FY2027 outlook; no monthly / sales-type allocation",
        actor: "migration",
        at: "2026-10-26T00:00:00.000Z",
      },
    ];
  return state;
}
export function activeBudgets(state: Store): BudgetVersion[] {
  const map = new Map<string, BudgetVersion>();
  for (const v of state.budgetVersions ?? [])
    if (!v.revokedAt) map.set(`${v.entityId}:${v.year}`, v);
  return [...map.values()];
}
export function activeCorrections(state: Store): CorrectionVersion[] {
  return (state.correctionVersions ?? []).filter((v) => !v.revokedAt);
}
/** Attach versioned policy to reporting copies; API source records remain unchanged. */
export function policyState(state: Store, salesType: SalesType): Store {
  // Legacy callers without migrated state retain their established projection.
  if (!state.budgetVersions && !state.correctionVersions) return state;
  const budgets = activeBudgets(state),
    corrections = activeCorrections(state);
  return {
    ...state,
    snapshots: state.snapshots.map((raw) => {
      const s = {
        ...raw,
        managedCorrections: true,
        managedBudgets: {} as NonNullable<typeof raw.managedBudgets>,
        policyMetrics: {} as NonNullable<typeof raw.policyMetrics>,
        sourceCells: { ...raw.sourceCells },
        findings: [...raw.findings],
      };
      for (const year of [s.year, s.year + 1])
        for (const salesType of ["all", "external", "group"] as const) {
          const b = budgets.find(
            (b) => b.entityId === s.entityId && b.year === year,
          );
          s.managedBudgets[`${year}:${salesType}`] = {
            value: b ? (salesType === "all" ? b.total : b[salesType]) : null,
            pending: !!b?.pending,
            reason: b?.reason ?? "Approved budget not supplied",
          };
          s.sourceCells[`budget.${year}`] = b
            ? `${b.id} · ${b.reason}`
            : "Approved budget not supplied";
          const applicable = corrections.filter(
            (c) =>
              c.entityId === s.entityId &&
              c.year === year &&
              c.weeks.includes(s.week),
          );
          const metrics: NonNullable<typeof s.policyMetrics>[string] = {};
          for (const c of applicable) {
            if (c.salesType === salesType) metrics[c.metric] = c.value;
            // A supplied split correction can change All only when the other split is known.
            else if (
              salesType === "all" &&
              c.salesType !== "all" &&
              ["sales", "orderbook"].includes(c.metric)
            ) {
              const split =
                c.metric === "sales"
                  ? s.turnover
                  : year === s.year
                    ? s.orderbook
                    : s.nextOrderbook;
              const opposite =
                c.salesType === "external" ? "group" : "external";
              const oppositeCorrection = applicable
                .filter(
                  (v) => v.metric === c.metric && v.salesType === opposite,
                )
                .at(-1);
              const other =
                s.year === 2026 &&
                year === 2026 &&
                ["dcp", "ddc"].includes(s.entityId) &&
                opposite === "group"
                  ? 0
                  : (oppositeCorrection?.value ?? split[opposite]);
              if (other !== null) metrics[c.metric] = c.value + other;
            } else continue;
            s.sourceCells[`correction.${year}.${c.metric}`] =
              `${c.id} · ${c.reason}`;
            s.findings.push(
              `Approved ${c.metric} correction: ${c.value} kEUR; no monthly, team or customer allocation supplied`,
            );
          }
          s.policyMetrics[`${year}:${salesType}`] = metrics;
        }
      s.findings = [...new Set(s.findings)];
      return s;
    }),
  };
}
