import type { Snapshot } from "./types";

// Project-owner approval, 2026-09-29. Units: kEUR. Not weekly forecasts.
export const approved2026Budgets: Readonly<Record<string, number>> = {
  dhk: 24830,
  ddc: 5769,
  dcp: 2608,
};

// Project-owner FY2027 budget version, 2026-10-03. No DCP budget supplied.
export const approved2027Budgets: Readonly<Record<string, number>> = {
  dhk: 29014,
  ddc: 6017,
};

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
          ? "Project owner approval · 2026-09-29 · lib/annual-budgets.ts · kEUR · fixed FY2026"
          : "Project owner approval · 2026-10-03 · lib/annual-budgets.ts · kEUR · FY2027 version",
      ...(snapshot.year === 2026 &&
      approved2027Budgets[snapshot.entityId] !== undefined
        ? {
            nextBudget:
              "Project owner approval · 2026-10-03 · lib/annual-budgets.ts · kEUR · FY2027 version",
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
