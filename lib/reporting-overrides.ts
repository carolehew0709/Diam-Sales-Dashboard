import type { Snapshot } from "./types";

/** Owner-confirmed WK40 aggregate; never invent a customer, sales-type or monthly allocation. */
export function applyReportingOverrides(snapshot: Snapshot): Snapshot {
  if (
    snapshot.entityId !== "dhk" ||
    snapshot.year !== 2026 ||
    snapshot.week !== 40
  )
    return snapshot;
  return {
    ...snapshot,
    nextOrderbookOverride: 2597,
    sourceCells: {
      ...snapshot.sourceCells,
      nextOrderbookOverride:
        "Project owner confirmation · 2026-10-03 · FY2027 OB 2597 kEUR · WK40 workbook 2579.224 kEUR · difference 17.776 kEUR unallocated",
    },
    findings: [
      ...new Set([
        ...snapshot.findings,
        "Approved next-year orderbook has no supplied monthly or sales-type allocation",
      ]),
    ],
    sourceCheck: "Review",
  };
}
