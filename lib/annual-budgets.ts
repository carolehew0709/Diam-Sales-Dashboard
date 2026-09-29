import type { Snapshot } from "./types";

// Project-owner approval, 2026-09-29. Units: kEUR. Not weekly forecasts.
export const approved2026Budgets: Readonly<Record<string, number>> = {
  dhk: 24830,
  ddc: 5769,
  dcp: 2608,
};

export function applyApprovedBudget(snapshot: Snapshot): Snapshot {
  const approved =
    snapshot.year === 2026 ? approved2026Budgets[snapshot.entityId] : undefined;
  if (approved === undefined) return snapshot;
  const finding = "Approved annual budget has no supplied monthly phasing";
  return {
    ...snapshot,
    annualBudget: approved,
    // Do not reuse the legacy PDA monthly budget or invent a /12 allocation.
    monthlyBudget: Array(12).fill(null),
    sourceCells: {
      ...snapshot.sourceCells,
      budget:
        "Project owner approval · 2026-09-29 · lib/annual-budgets.ts · kEUR · fixed FY2026",
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
