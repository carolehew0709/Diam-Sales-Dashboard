# Source and metric contract

## Grain and scope

A snapshot is entity × source year × ISO week; a line is entity × year × week × source row. Weekly snapshots are immutable observations and are not summed across weeks. The active entity record is its latest populated snapshot, including explicitly entered zeroes. Untouched future W tabs with blank input cells are skipped even when formulas return zero.

Hierarchy: APAC (Total) → China (DHK/DCP/DDC), Singapore (DSI), India (DDI), Japan (DDJ). Country names are reporting Regions; entity codes are BUs. Visibility is applied before aggregation and before customer/order details are returned.

## Confirmed source mapping (2026-09-17)

| File                                          | Destination | Current populated week | Important limits                                                                               |
| --------------------------------------------- | ----------- | ---------------------: | ---------------------------------------------------------------------------------------------- |
| Dashboard 2026 - DEHK.xlsx                    | China / DHK |                     36 | Annual budget and Prospect not supplied                                                        |
| Dashboard 2026 - DDC.xlsx                     | China / DDC |                     36 | Annual budget and Prospect not supplied                                                        |
| DIAM_Global_Follow_Up_2026_W35.xlsx, PDA rows | China / DCP |                     35 | Project-owner-approved mapping of a legacy aggregate; no sales/OB, External/Group or MTD split |

DSI, DDJ and DDI have no supplied records and remain blank. The DCP mapping is a business instruction, not an independently reconciled allocation of the source's original Asia (PDA + PDN + PGC) aggregate.

## Units and provenance

All amounts are kEUR. Weekly entity sheets explicitly label their amounts K€. The parser uses the worksheet's used-range origin and retains actual source cell addresses and row numbers. The source adapter reads YTD, MTD, full-month estimates, annual orderbook and monthly order allocations directly from W tabs, not the ambiguous Synth turnover column. Cached workbook values are used; XLSX formulas are not recalculated by the server. Submit recalculated/saved workbooks.

For closed months, month-end YTD is the next month's YTD minus its MTD. Monthly invoicing is the difference between consecutive observed month-end balances; missing boundaries remain null. Current-month actual uses explicit MTD, future invoicing is zero, and committed OB uses supplied monthly allocations. A cumulative current-month anchor uses actual YTD plus current-month OB, then adds future OB. Historical monthly figures can reflect source corrections.

DCP's annual base/monthly profile, approved budget and current-week Prospect are read from Data Weekly and Budget Recap. Historical Prospect is unavailable rather than copied backwards. The source P1 label is presented as Prospect.

## KPI definitions

- Annual Dashboard: approved annual budget for the selected scope/year; null if any selected entity budget is missing. Budgets have no External/Group allocation, so filtered sales-type coverage/gap are unavailable.
- Sales & Dashboard (OB): YTD invoiced + current-year committed OB. DCP uses the provided unsplit annual scenario, with no invented component split.
- Sales + Prospect: base + supplied Prospect. Known subtotals remain visible when inputs are missing, clearly marked partial. Unknown Prospect is not asserted to be zero; coverage/gap remain unavailable for incomplete scenarios.
- Coverage: selected annual scenario / complete comparable annual budget. Never divide by an artificial denominator of one.
- Residual Gap: annual budget minus selected annual scenario. Positive means below budget; negative means above budget.
- Remaining this month: max(full-month estimate − MTD invoiced, 0). Missing entity values remain unknown; known subtotal is marked partial. For 2027 this current-month metric is unavailable.
- 2027 base uses supplied next-year OB; no future budget or Prospect is invented.

China's pinned strip shows Sales & Dashboard across all permitted China entities under the selected year/sales type even when one entity or another BU is selected. Detail rows include all KPIs. This is an additive entity reporting view; no intercompany elimination has been supplied. External and Group remain separately filterable.

## Known baseline checks

103 populated entity-week snapshots and 1,927 historical order lines. Latest DHK base = 33,028.444 kEUR; DDC = 23,642.9539; mapped DCP = 2,961.9134. China base = 59,633.3113. Known Prospect = 271, so the partial annual Sales + Prospect is 59,904.3113. China annual coverage/gap remain Review because DHK/DDC budgets are absent. Known September remaining-to-invoice = 4,013.8959; DCP's monthly input is absent.

## Reporting Region and BU mapping

Region options are APAC (Total), China, Singapore, India and Japan. APAC includes all six BUs. China includes DHK, DCP and DDC; Singapore includes DSI; India includes DDI; Japan includes DDJ. The BU filter and Gap by BU use these entity codes. China remains the default reporting region and its permitted totals/detail remain visible across selections. Changing Region resets BU and Entity selection. The account authorization boundary remains APAC; reporting-country selection does not grant additional account access. Empty source values remain blank.
