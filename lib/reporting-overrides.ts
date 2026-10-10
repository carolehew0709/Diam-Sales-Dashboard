import type { Snapshot, SalesType } from "./types";

/** Owner-confirmed WK40 aggregate; never invent a customer, sales-type or monthly allocation. */
export function applyReportingOverrides(snapshot: Snapshot, salesType: SalesType = "all"): Snapshot {
  if (snapshot.entityId === "dcp" && snapshot.year === 2026 && snapshot.baseOverride === null) {
    // DCP-specific owner correction: H10 invoices + L10 OB, not H11 or K17/K18.
    const sourceOB = snapshot.sourceExternalOrderbook !== undefined ? snapshot.sourceExternalOrderbook : snapshot.orderbook.external;
    const sourceMonthlyOB = snapshot.sourceExternalMonthlyOrderbook ?? snapshot.monthlyOrderbook.external;
    const external = salesType === "external";
    const ob = external ? sourceOB : snapshot.monthEstimate.external;
    const correctedSales = [40, 41].includes(snapshot.week) ? 260814.49 / 1000 : undefined;
    return {
      ...snapshot,
      sourceExternalOrderbook: sourceOB,
      sourceExternalMonthlyOrderbook: sourceMonthlyOB,
      turnover: { ...snapshot.turnover, external: correctedSales ?? snapshot.turnover.external, group: 0 },
      ...(correctedSales !== undefined ? { salesCardValue: correctedSales } : {}),
      monthTurnover: { ...snapshot.monthTurnover, group: 0 },
      monthEstimate: { ...snapshot.monthEstimate, group: 0 },
      orderbook: { external: ob, group: 0 },
      monthlySales: { ...snapshot.monthlySales, group: Array(12).fill(0) },
      monthlyOrderbook: {
        external: external ? sourceMonthlyOB : Array.from({length:12}, (_, i) => i === snapshot.month - 1 ? ob : 0),
        group: Array(12).fill(0),
      },
      sourceCells: {
        ...snapshot.sourceCells,
        ...(correctedSales !== undefined ? {
          dcpYtdSales: snapshot.week === 41
            ? "Project owner confirmation · 2026-10-11 · retain 260.81449 kEUR External YTD for FY2026 W41; workbook H10 200.091 kEUR preserved; no monthly allocation supplied"
            : "Project owner update · 2026-10-03 · screenshot de36605ef8221b65a112da2d841ee66a.png · 260814.49 EUR / 1000 = 260.81449 kEUR · FY2026 W40 · External YTD · no monthly allocation supplied",
        } : {}),
        dcpReporting: external
          ? "Project owner correction · 2026-10-03 · FY2026 External: Sales H10; OB K17; total H10+K17"
          : "Project owner correction · 2026-10-03 · FY2026 DCP: top card and Sales to date H10; OB L10; annual total H10+L10; External row only",
      },
      findings: [...new Set(snapshot.findings
        .filter(f => f !== "Intercompany orderbook excluded; invoiced sales unchanged")
        .filter(f => !["DCP reporting uses H10 sales and L10 orderbook; Group values excluded", "External reporting uses H10 sales and K17 orderbook", "DCP External YTD sales updated by owner; monthly allocation not supplied"].includes(f))
        .concat(external ? "External reporting uses H10 sales and K17 orderbook" : "DCP reporting uses H10 sales and L10 orderbook; Group values excluded")
        .concat(correctedSales !== undefined ? ["DCP External YTD sales updated by owner; monthly allocation not supplied"] : []))],
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
