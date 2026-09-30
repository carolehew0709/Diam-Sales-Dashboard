# Source and metric contract

## Grain and scope

A snapshot is entity × source year × ISO week; a line is entity × year × week × source row. Weekly snapshots are immutable observations and are not summed across weeks. The active entity record is its latest populated snapshot, including explicitly entered zeroes. Untouched future W tabs with blank input cells are skipped even when formulas return zero.

Hierarchy: APAC (Total) → China (DHK/DCP/DDC), Singapore (DSI), India (DDI), Japan (DDJ). Country names are reporting Regions; entity codes are BUs. Visibility is applied before aggregation and before customer/order details are returned.

## Confirmed source mapping (updated 2026-09-29)

| File                            | Destination | Current populated week | Important limits                                                   |
| ------------------------------- | ----------- | ---------------------: | ------------------------------------------------------------------ |
| Dashboard 2026 - DEHK(2).xlsx   | China / DHK |                     39 | Prospect not supplied; budget fixed by owner approval              |
| Dashboard 2026 - DDC(2).xlsx    | China / DDC |                     39 | Prospect not supplied; budget fixed by owner approval              |
| W38-- Dashboard 2026 - DCP.xlsx | China / DCP |                     38 | Direct entity source; Prospect not supplied; fixed approved budget |

DSI, DDJ and DDI have no supplied records and remain blank. DCP now uses its own workbook (entity label: Diam Pack Luxe China). The legacy PDA aggregate workbook is retained unchanged for traceability but is no longer in the active source manifest.

## Units and provenance

All amounts are kEUR. Weekly entity sheets explicitly label their amounts K€. The parser uses the worksheet's used-range origin and retains actual source cell addresses and row numbers. The source adapter reads YTD, MTD, full-month estimates, annual orderbook and monthly order allocations directly from W tabs, not the ambiguous Synth turnover column. Cached workbook values are used; XLSX formulas are not recalculated by the server. Submit recalculated/saved workbooks.

For closed months, month-end YTD is the next month's YTD minus its MTD. Monthly invoicing is the difference between consecutive observed month-end balances; missing boundaries remain null. Current-month actual uses explicit MTD, future invoicing is zero, and committed OB uses supplied monthly allocations. A cumulative current-month anchor uses actual YTD plus current-month OB, then adds future OB. Historical monthly figures can reflect source corrections.

DCP follows the same direct entity-week sales/orderbook parsing rules as DHK/DDC. Its W38 workbook supplies External/Group sales, monthly invoicing, orderbook and monthly order allocations. Prospect is absent and is not carried forward from the old PDA aggregate.

## KPI definitions

- Annual Dashboard: approved annual budget for the selected scope/year; null if any selected entity budget is missing. Budgets have no External/Group allocation, so filtered sales-type coverage/gap are unavailable.
- Sales & Dashboard (OB): YTD invoiced + current-year committed OB. DCP uses the provided unsplit annual scenario, with no invented component split.
- Sales + Prospect: base + supplied Prospect. Known subtotals remain visible when inputs are missing, clearly marked partial. Unknown Prospect is not asserted to be zero; coverage/gap remain unavailable for incomplete scenarios.
- Coverage: selected annual scenario / complete comparable annual budget. Never divide by an artificial denominator of one.
- Residual Gap: annual budget minus selected annual scenario. Positive means below budget; negative means above budget.
- Remaining this month: max(full-month estimate − MTD invoiced, 0). Missing entity values remain unknown; known subtotal is marked partial. For 2027 this current-month metric is unavailable.
- 2027 base uses supplied next-year OB; no future budget or Prospect is invented.

China's pinned strip shows Sales & Dashboard across all permitted China entities under the selected year/sales type even when one entity or another BU is selected. Detail rows include all KPIs. Reporting applies the owner-approved intercompany orderbook deductions described below before aggregation. External and Group remain separately filterable.

## Known baseline checks

115 populated entity-week snapshots and 2,348 historical order lines. DHK/DDC use W39 (2026-09-25); DCP uses W38 (2026-09-18). DHK base = 34,042.396 kEUR; DDC = 25,008.8949; DCP = 2,622.104117529132. China base = 61,673.39501752914. Prospect is missing for all three entities, so Sales + Prospect remains partial and its coverage/gap are unavailable. Sales coverage uses the fixed China budget 33,207. September remaining-to-invoice = 1,773.013017529132 kEUR across mixed W38/W39 reporting dates. DCP YTD sales = 2,620.651, orderbook = 1.45311752913171, Remaining this month = 1.45311752913171 kEUR.

## Reporting Region and BU mapping

Region options are APAC (Total), China, Singapore, India and Japan. APAC includes all six BUs. China includes DHK, DCP and DDC; Singapore includes DSI; India includes DDI; Japan includes DDJ. The BU filter and Gap by BU use these entity codes. China remains the default reporting region and its permitted totals/detail remain visible across selections. Changing Region resets BU and Entity selection. The account authorization boundary remains APAC; reporting-country selection does not grant additional account access. Empty source values remain blank.

## Fixed FY2026 budget approval (2026-09-29)

The project owner supplies DHK 24,830, DDC 5,769, DCP 2,608 kEUR, totaling 33,207 kEUR for China. `lib/annual-budgets.ts` is the year/entity control; it overrides all weekly source and manual budgets for these entities throughout 2026, including historical views and existing stored snapshots. It does not affect 2027. The source detail identifies the owner approval separately from workbook cells. No monthly or External/Group budget allocation was approved: these comparisons remain blank, and the old PDA monthly budget is not reused or divided proportionally. APAC's full budget remains incomplete while DSI/DDI/DDJ budgets are missing.

`Dashboard/source-manifest.json` selects the current source workbooks. The original W36 files remain unchanged for traceability and are excluded from extraction, avoiding duplicate entity-week records. New source files are copied unchanged; extraction generates the reviewable JSON baseline. Persistent local updates follow the reviewed import/publish workflow rather than replacing user/account state.

The entity-week parser anchors its cell offsets to the ENTITY NAME header, not the used-range left edge. DCP W19/W20/W22 have an empty leading column that changes !ref without changing the template. W1 is unpopulated and is excluded; DCP W2–W38 are active.

## Intercompany orderbook exclusions (approved 2026-09-30)

Reporting excludes Group orders from DDC to DHK (including source customer DEHK HK), and from DCP to DHK/DEHK or DDC. Matching uses normalized customer identities, not fixed spreadsheet row numbers. Other Group orders and all invoiced YTD/MTD sales remain unchanged. This implements the specifically identified orderbook overlap, not a blanket elimination of Group invoicing.

DDC W39 K24: 4,384.23 kEUR is excluded; gross Sales + Orderbook 25,008.8949 becomes 20,624.6649. DCP W38 K24 (DEHK) 1.45311752913171 and K25 (DDC) 0 are excluded; gross 2,622.104117529132 becomes 2,620.651. China net Sales + Orderbook is 57,287.7119 kEUR. Fixed budgets remain 33,207 total.

`lib/intercompany.ts` provides a pure, idempotent reporting projection applied to stored snapshots and detail rows before KPI, historical, monthly, customer and export calculations. It deducts the same rows' current/next-year totals and monthly allocations, and deducts only the current month's order allocation from the monthly estimate. Remaining this month is DDC 99.4279, DCP 0 and China 592.0399 kEUR. Export includes a separate Intercompany Exclusions sheet with original amounts and source rows; Orderbook Detail contains the net included orders. Source workbooks, generated source JSON, and persistent imports retain their original values, so this rule also works on existing databases without a destructive data migration. Deductions do not depend on which counterparties the viewer can see or selects.
