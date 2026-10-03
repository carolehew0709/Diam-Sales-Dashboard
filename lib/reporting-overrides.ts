import type { Snapshot } from "./types";

/** Owner-confirmed WK40 aggregate; never invent a customer, sales-type or monthly allocation. */
export function applyReportingOverrides(snapshot: Snapshot): Snapshot {
  if (snapshot.entityId === "dcp" && snapshot.year === 2026 && snapshot.baseOverride === null) {
    // DCP-specific owner correction: H10 invoices + L10 OB, not H11 or K17/K18.
    const ob = snapshot.monthEstimate.external;
    return {
      ...snapshot,
      turnover: { ...snapshot.turnover, group: 0 },
      monthTurnover: { ...snapshot.monthTurnover, group: 0 },
      monthEstimate: { ...snapshot.monthEstimate, group: 0 },
      orderbook: { external: ob, group: 0 },
      monthlySales: { ...snapshot.monthlySales, group: Array(12).fill(0) },
      monthlyOrderbook: {
        external: Array.from({length:12}, (_, i) => i === snapshot.month - 1 ? ob : 0),
        group: Array(12).fill(0),
      },
      sourceCells: {
        ...snapshot.sourceCells,
        dcpReporting: "Project owner correction · 2026-10-03 · FY2026 DCP: top card and Sales to date H10; OB L10; annual total H10+L10; External row only",
      },
      findings: [...new Set(snapshot.findings
        .filter(f => f !== "Intercompany orderbook excluded; invoiced sales unchanged")
        .concat("DCP reporting uses H10 sales and L10 orderbook; Group values excluded"))],
    };
  }
  if (snapshot.entityId === "ddc" && snapshot.year === 2026) {
    // Owner correction: FY2026 DDC uses only the External row (H10 / O10).
    // This is a reporting copy; raw imports and original Group invoices stay intact.
    return {
      ...snapshot,
      turnover: { ...snapshot.turnover, group: 0 },
      monthTurnover: { ...snapshot.monthTurnover, group: 0 },
      monthEstimate: { ...snapshot.monthEstimate, group: 0 },
      orderbook: { ...snapshot.orderbook, group: 0 },
      monthlySales: { ...snapshot.monthlySales, group: Array(12).fill(0) },
      monthlyOrderbook: {
        ...snapshot.monthlyOrderbook,
        group: Array(12).fill(0),
      },
      sourceCells: {
        ...snapshot.sourceCells,
        ddcReporting:
          "Project owner correction · 2026-10-03 · FY2026 DDC: Sales to date H10; annual total O10; OB K17; External row only",
      },
      findings: [
        ...new Set(
          snapshot.findings
            .filter(
              (f) =>
                f !==
                "Intercompany orderbook excluded; invoiced sales unchanged",
            )
            .concat(
              "DDC reporting uses External row only: H10 sales, O10 annual total, K17 orderbook",
            ),
        ),
      ],
    };
  }
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
