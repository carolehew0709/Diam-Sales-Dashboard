import type { Snapshot, SalesType } from "./types";

type ApprovedSplit = Readonly<{ external: number; group: number }>;

// Final owner-approved budget table, 2026-10-09, screenshot
// 4bdcb716c2c1194b6363ecb78198efa8.png. Units: kEUR; no monthly phasing.
// DDC/DCP are External-only in the supplied table; their Group allocation is 0.
export const approved2026BudgetSplits: Readonly<Record<string, ApprovedSplit>> = {
  dhk: { external: 19344, group: 5788 },
  ddc: { external: 5467, group: 0 },
  dcp: { external: 2608, group: 0 },
};
export const approved2027BudgetSplits: Readonly<Record<string, ApprovedSplit>> = {
  dhk: { external: 24732, group: 5039 },
  ddc: { external: 6017, group: 0 },
};
function totals(splits: Readonly<Record<string, ApprovedSplit>>): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.entries(splits).map(([id, split]) => [id, split.external + split.group]));
}
export const approved2026Budgets = totals(approved2026BudgetSplits);
export const approved2027Budgets = totals(approved2027BudgetSplits);

/** Undefined means no approved budget; never infer an allocation for missing BUs. */
export function approvedAnnualBudget(entityId: string, year: number, salesType: SalesType): number | undefined {
  const split = (year === 2026 ? approved2026BudgetSplits : year === 2027 ? approved2027BudgetSplits : {})[entityId];
  if (!split) return undefined;
  return salesType === "all" ? split.external + split.group : split[salesType];
}

// Owner-requested display placeholders, 2026-10-03; these are NOT approved budgets.
export const pending2027Budgets: Readonly<Record<string, number>> = {
  dcp: 0, dsi: 0, ddi: 0, ddj: 0,
};

export function applyApprovedBudget(snapshot: Snapshot): Snapshot {
  const approved =
    snapshot.year === 2026
      ? approved2026Budgets[snapshot.entityId]
      : snapshot.year === 2027
        ? approved2027Budgets[snapshot.entityId]
        : undefined;
  if (approved === undefined) return snapshot;
  const finding = "Approved annual budget has no supplied monthly phasing";
  return {
    ...snapshot,
    annualBudget: approved,
    nextAnnualBudget:
      snapshot.year === 2026
        ? (approved2027Budgets[snapshot.entityId] ?? snapshot.nextAnnualBudget)
        : snapshot.nextAnnualBudget,
    // Do not reuse the legacy PDA monthly budget or invent a /12 allocation.
    monthlyBudget: Array(12).fill(null),
    sourceCells: {
      ...snapshot.sourceCells,
      budget:
        snapshot.year === 2026
          ? "Project owner final budget table · 2026-10-09 · 4bdcb716c2c1194b6363ecb78198efa8.png · lib/annual-budgets.ts · kEUR · FY2026 External/Group"
          : "Project owner final budget table · 2026-10-09 · 4bdcb716c2c1194b6363ecb78198efa8.png · lib/annual-budgets.ts · kEUR · FY2027 External/Group",
      ...(snapshot.year === 2026 &&
      approved2027Budgets[snapshot.entityId] !== undefined
        ? {
            nextBudget:
              "Project owner final budget table · 2026-10-09 · 4bdcb716c2c1194b6363ecb78198efa8.png · lib/annual-budgets.ts · kEUR · FY2027 External/Group",
          }
        : {}),
    },
    findings: [
      ...new Set(
        snapshot.findings
          .filter((f) => f !== "Annual budget not supplied")
          .concat(finding),
      ),
    ],
  };
}
