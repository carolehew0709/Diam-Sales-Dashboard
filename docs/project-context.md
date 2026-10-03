# Source and metric contract

## Grain and scope

A snapshot is entity × source year × ISO week; a line is entity × year × week × source row. Weekly snapshots are immutable observations and are not summed across weeks. The active entity record is its latest populated snapshot, including explicitly entered zeroes. Untouched future W tabs with blank input cells are skipped even when formulas return zero.

Hierarchy: APAC (Total) → China (DEHK/DCP/DDC), Singapore (DSI), India (DDI), Japan (DDJ). Country names are reporting Regions; entity codes are BUs. Visibility is applied before aggregation and before customer/order details are returned.

## Confirmed source mapping (updated 2026-10-03)

| File                            | Destination | Current populated week | Important limits                                                   |
| ------------------------------- | ----------- | ---------------------: | ------------------------------------------------------------------ |
| Dashboard 2026 - DEHK(1).xlsx   | China / DEHK |                     40 | Prospect not supplied; budget fixed by owner approval              |
| Dashboard 2026 - DDC(1).xlsx    | China / DDC |                     40 | Prospect not supplied; budget fixed by owner approval              |
| W40-- Dashboard 2026 - DCP.xlsx | China / DCP |                     40 | Direct entity source; Prospect not supplied; fixed approved budget |

DSI, DDJ and DDI have no supplied records and remain blank. DCP now uses its own workbook (entity label: Diam Pack Luxe China). The legacy PDA aggregate workbook is retained unchanged for traceability but is no longer in the active source manifest.

## Units and provenance

All dashboard amounts, chart labels, percentages and exported Excel numeric cells display whole numbers (Excel-style rounding to zero decimal places). Stored workbook values and calculations retain source precision; rounding is applied only at presentation, after intercompany deductions and aggregation. Displayed rounded BU values may therefore differ from the rounded total by 1 kEUR. Missing values remain blank/dashes.

All amounts are kEUR. Weekly entity sheets explicitly label their amounts K€. The parser uses the worksheet's used-range origin and retains actual source cell addresses and row numbers. The source adapter reads YTD, MTD, full-month estimates, annual orderbook and monthly order allocations directly from W tabs, not the ambiguous Synth turnover column. Cached workbook values are used; XLSX formulas are not recalculated by the server. Submit recalculated/saved workbooks.

For closed months, month-end YTD is the next month's YTD minus its MTD. Monthly invoicing is the difference between consecutive observed month-end balances; missing boundaries remain null. Current-month actual uses explicit MTD, future invoicing is zero, and committed OB uses supplied monthly allocations. A cumulative current-month anchor uses actual YTD plus current-month OB, then adds future OB. Historical monthly figures can reflect source corrections.

DCP follows the same direct entity-week sales/orderbook parsing rules as DEHK/DDC. Its W38 workbook supplies External/Group sales, monthly invoicing, orderbook and monthly order allocations. Prospect is absent and is not carried forward from the old PDA aggregate.

## KPI definitions

- Annual Dashboard: approved annual budget for the selected scope/year; null if any selected entity budget is missing. Budgets have no External/Group allocation, so filtered sales-type coverage/gap are unavailable.
- Sales & Dashboard (OB): YTD invoiced + current-year committed OB. DCP uses the provided unsplit annual scenario, with no invented component split.
- Sales + Prospect: base + supplied Prospect. Known subtotals remain visible when inputs are missing, clearly marked partial. Unknown Prospect is not asserted to be zero; it does not block Coverage or Residual Gap.
- Coverage: annual Sales + OB / complete comparable annual budget, excluding Prospect in both scenarios. Never divide by an artificial denominator of one.
- Residual Gap: annual budget minus selected annual scenario. Positive means below budget; negative means above budget.
- Remaining this month: max(full-month estimate − MTD invoiced, 0). Missing entity values remain unknown; known subtotal is marked partial. For 2027 this current-month metric is unavailable.
- 2027 base uses supplied next-year OB; no future budget or Prospect is invented.

China's pinned strip shows Sales & Dashboard across all permitted China entities under the selected year/sales type even when one entity or another BU is selected. Detail rows include all KPIs. Reporting applies the owner-approved intercompany orderbook deductions described below before aggregation. External and Group remain separately filterable.

## Earlier baseline checks (superseded for DDC by the correction below)

117 populated entity-week snapshots and 2,409 historical order lines. DEHK/DDC use W40 (2026-10-02); DCP remains W38 (2026-09-18). Net Sales + Orderbook: DEHK 32,518.276, DDC 22,644.4709, DCP 2,620.651 kEUR; China 57,783.3979 kEUR. DDC gross 25,516.7189 includes 2,872.248 kEUR of DEHK HK orders, excluded from every reporting projection. Current-month remaining: DEHK 1,983.186 and DDC 819.7699 (October), DCP 0 (September). Mixed reporting dates remain visible. Prospect is absent, so Sales + Prospect coverage/gap remain unavailable. FY2026 China budget stays 33,207.

## Reporting Region and BU mapping

Region options are APAC (Total), China, Singapore, India and Japan. APAC includes all six BUs. China includes DEHK, DCP and DDC; Singapore includes DSI; India includes DDI; Japan includes DDJ. The BU filter and Gap by BU use these entity codes. China remains the default reporting region and its permitted totals/detail remain visible across selections. Changing Region resets BU and Entity selection. The account authorization boundary remains APAC; reporting-country selection does not grant additional account access. Empty source values remain blank.

## Fixed FY2026 budget approval (2026-09-29)

The project owner supplies DEHK 24,830, DDC 5,769, DCP 2,608 kEUR, totaling 33,207 kEUR for China. `lib/annual-budgets.ts` is the year/entity control; it overrides all weekly source and manual budgets for these entities throughout 2026, including historical views and existing stored snapshots. FY2027 has a separately approved budget version, described below. The source detail identifies the owner approval separately from workbook cells. No monthly or External/Group budget allocation was approved: these comparisons remain blank, and the old PDA monthly budget is not reused or divided proportionally. APAC's full budget remains incomplete while DSI/DDI/DDJ budgets are missing.

`Dashboard/source-manifest.json` selects the current source workbooks. The original W36 files remain unchanged for traceability and are excluded from extraction, avoiding duplicate entity-week records. New source files are copied unchanged; extraction generates the reviewable JSON baseline. Persistent local updates follow the reviewed import/publish workflow rather than replacing user/account state.

The entity-week parser anchors its cell offsets to the ENTITY NAME header, not the used-range left edge. DCP W19/W20/W22 have an empty leading column that changes !ref without changing the template. W1 is unpopulated and is excluded; DCP W2–W38 are active.

## Intercompany orderbook exclusions (approved 2026-09-30)

Reporting excludes Group orders from DDC to DEHK (including source customer DEHK HK), and from DCP to DEHK/DEHK or DDC. Matching uses normalized customer identities, not fixed spreadsheet row numbers. Other Group orders and all invoiced YTD/MTD sales remain unchanged. This implements the specifically identified orderbook overlap, not a blanket elimination of Group invoicing.

DDC W39 K24: 4,384.23 kEUR is excluded; gross Sales + Orderbook 25,008.8949 becomes 20,624.6649. DCP W38 K24 (DEHK) 1.45311752913171 and K25 (DDC) 0 are excluded; gross 2,622.104117529132 becomes 2,620.651. These are archived W39 checks; the current W40 amounts are listed above. Fixed budgets remain 33,207 total.

`lib/intercompany.ts` provides a pure, idempotent reporting projection applied to stored snapshots and detail rows before KPI, historical, monthly, customer and export calculations. It deducts the same rows' current/next-year totals and monthly allocations, and deducts only the current month's order allocation from the monthly estimate. Current Remaining this month uses the latest entity source month; current amounts are listed above. Export includes a separate Intercompany Exclusions sheet with original amounts and source rows; Orderbook Detail contains the net included orders. Source workbooks, generated source JSON, and persistent imports retain their original values, so this rule also works on existing databases without a destructive data migration. Deductions do not depend on which counterparties the viewer can see or selects.


## FY2027 budget version and WK40 orderbook confirmation (2026-10-03)

The owner supplied DEHK 29,014 and DDC 6,017 kEUR annual budgets. These override nextAnnualBudget on FY2026 snapshots and annualBudget on FY2027 snapshots, including persisted records. DCP and other BUs have no FY2027 budget: China/APAC total budget, coverage and gap remain incomplete. No monthly or sales-type budget allocation is supplied.

The owner explicitly confirmed WK40 DEHK FY2027 Orderbook as 2,597 kEUR, overriding the workbook aggregate 2,579.224 (External 2,478 + Group 101.224). `lib/reporting-overrides.ts` applies this confirmation only to DEHK FY2026 W40; later weekly imports and previous history are not overwritten. FY2027 annual KPI/export use 2,597; raw workbook/detail and source sales-type allocations remain unchanged. The difference 17.776 has no customer, sales-type or month allocation. Total FY2027 monthly/cumulative orderbook is therefore blank for this observation, with a translated Review finding and explicit source provenance. Filtered External/Group views continue to show workbook splits; these are not a complete allocation of the confirmed aggregate. Sales coverage is 2,597 / 29,014; missing Prospect still prevents Sales + Prospect coverage.


## Display correction and source reconciliation (2026-10-03)

The Hong Kong BU display code is DEHK. Stored entity ID `dhk`, permission keys, original workbooks and legacy DHK aliases remain compatible. BU filters, entity cards, charts and exports use DEHK. Legacy `bu=DHK` links still select DEHK.

Rechecked raw source cells: DEHK W40 H10+H11 = 26,606.729; K17+K18 = 5,911.547; base = 32,518.276. DCP W38 H10+H11 = 2,620.651; raw OB 1.45311752913171 is wholly excluded (DEHK row24, DDC row25 zero), leaving OB 0 and base 2,620.651. DDC W40 H10+H11 = 20,621.912; K17+K18 minus DEHK K24 2,872.248 = net OB 2,022.5589; base = 22,644.4709. China YTD 49,849.292 + net OB 7,934.1059 = 57,783.3979. No new numeric discrepancy was found. Missing Prospect means Sales + Prospect is a known subtotal, not a complete forecast. Legacy unsplit-DCP warnings display only when an actual unsplit legacy override is selected.


## DDC External-row reporting correction (2026-10-03)

The owner superseded the previous DDC H10+H11 rule. For FY2026 DDC only: Sales to date uses H10; the top China-strip DDC card and annual Sales + OB use cached O10 directly (H10+K17 in the source); Dashboard OB uses K17. W40 values: sales 5,136.274, OB 2,022.5589, annual total 7,158.8329 kEUR, displayed as 5,136 / 2,023 / 7,159. The top strip labels DDC as Sales + OB, matching its O10 annual total.

The raw parser retains O10 as ddcAnnualTotal with source address, and preserves H11 and Group source rows. The reporting projection excludes FY2026 DDC Group invoicing, monthly actuals/estimates and OB; Group order detail FY2026 amounts become zero while FY2027 source allocations remain intact. This applies consistently to annual metrics, historical weekly views, monthly/cumulative figures, China totals and export. Existing stores without cached O10 use H10+K17; an explicitly missing O10 remains unknown. DEHK, DCP, all other BUs, approved budgets and FY2027 values are unchanged.

Current China FY2026 base is DEHK 32,518.276 + DCP 2,620.651 + DDC 7,158.8329 = 42,297.7599 kEUR. Sales to date totals 34,363.654; OB totals 7,934.1059. Original source files and stored raw invoices remain intact.


## FY2027 known annual budget subtotal (2026-10-03)

At the owner request, the FY2027 Annual Dashboard total now displays the known approved DEHK + DDC budget: 29,014 + 6,017 = 35,031 kEUR for China/APAC selections that include both. It is explicitly labelled a known subtotal and names the included BUs; missing DCP/DSI/DDI/DDJ budgets remain null. Permission and BU filters apply before summing. `budgetComplete` remains false if any selected BU budget is absent; coverage/gap still require a complete comparable budget. FY2026 aggregation retains its existing complete-budget rule. Exports show the subtotal with its partial-scope note.


The owner subsequently requested pending FY2027 DCP/DSI/DDI/DDJ budgets display as 0. `pending2027Budgets` keeps these placeholders separate from confirmed budgets; source/operating data remains absent. Each pending BU shows budget 0 and a translated pending finding. China/APAC Annual Dashboard sums to 35,031 with a pending-budget note. `budgetComplete` stays false, so these provisional zeros do not enable approved-budget coverage/gap. No monthly allocation is invented; FY2026 values are unchanged.


## DCP W40 source refresh (2026-10-03)

The active manifest now selects W40-- Dashboard 2026 - DCP.xlsx; W38 remains archived unchanged. All three China BUs now report W40 / 2026-10-02 / October. The seed contains 119 populated entity-week observations and 2,414 historical lines. DCP W40 YTD invoices H10 200.091 + H11 2,431.542 = 2,631.633 kEUR. Raw OB is External 1.184 + Group 6.161. The Group line is DDC at source row24 and is excluded under the existing counterparty rule; no DEHK duplicate appears in W40. Net OB and October Remaining are each 1.184; net annual Sales + OB is 2,632.817 (displayed 2,633). FY2026 DCP budget remains 2,608; its FY2027 budget remains pending, displayed as 0.

With the established DDC H10/O10 rule and unchanged DEHK W40, China sales to date is 34,374.636; net OB is 7,935.2899; annual base is 42,309.9259 (displayed 42,310); October Remaining is 2,804.1399 (displayed 2,804). Prospect remains unavailable. Raw workbook data and original invoices remain intact, and source replacement follows review/publish for the local persistent store. These figures supersede earlier W38 DCP baseline examples above.


## DCP H10 / L10 reporting correction (2026-10-03)

The owner superseded the earlier DCP H10+H11 invoicing rule. FY2026 direct DCP entity snapshots now use only H10 for Sales to date and the top China-strip DCP card; OB is read directly from L10 (source full-month External estimate), not K17/K18. Annual Sales + OB = H10 + L10. W40 H10 is 200.091 and L10 is 1.184 kEUR: top card/Sales to date display 200, OB displays 1, annual base displays 201. The DCP top card is explicitly labelled Sales to date. Group invoices, estimates and orders are excluded from reporting copies; all original stored/source values are preserved.

Monthly actuals use External only; the selected source month carries the L10 reporting OB and other months carry no additional committed OB under this owner-specific annual rule. Current Remaining retains L10 minus J10, bounded at zero. Historical weekly views and exports apply the same H10/L10 rule; original order detail remains evidence of the source lines and can differ from an L10 estimate. Legacy PDA unsplit observations keep their prior handling. DEHK/DDC rules and all budgets/FY2027 data are unchanged.

China FY2026 sales is 31,943.094; OB is 7,935.2899; base is 39,878.3839 (displayed 39,878). October Remaining is unchanged at 2,804.1399. These totals supersede the previous DCP Group-inclusive examples above.

Top China strip presentation order is China Total, DEHK, DDC, DCP (owner request, 2026-10-03). Other entity tables retain their existing ordering.


## Sales scenario first-row display (2026-10-03)

Only the FY2026 top China strip changes when Scenario = Sales: DEHK reads cached H12 (W40 26,606.729); DDC and DCP read cached H10 (5,136.274 and 200.091). China Total sums the permitted BU values, 31,943.094 kEUR (displayed 31,943). The parser preserves these values and source addresses in salesCardValue. Missing cells stay null; older stores/manual imports without the field fall back to existing invoicing metrics. External/Group filters retain their scoped invoicing metrics.

`chinaStripAmount` affects this first row only. Lower KPI cards, scenario calculations, charts, history and export are unchanged. Sales + Prospect retains its existing top-row display (DEHK annual base, DDC O10 annual base, DCP H10 sales). FY2027 first-row behavior is unchanged.


## External sales-type formula (2026-10-03)

All sales retains all owner-specific formulas. For FY2026 External, each direct BU source uses H10 invoices, K17 annual OB, and H10+K17 base (sum of source values, not the cached DDC O10 nor the DCP All-sales L10). DCP reporting preserves original K17/monthly External allocations before applying its All-sales override, so changing sales type or repeated export projections cannot lose the source values. External monthly/history/export use the same K17 source allocations. The Sales-scenario first strip continues to show H10 invoices; Sales + Prospect External strip shows H10+K17 totals. Group numbers remain unchanged: DEHK H11+K18, DDC/DCP zero. FY2027 rules are unchanged.

W40 External: DEHK 18,256.216 + 5,282.382 = 23,538.598; DDC 5,136.274 + 2,022.5589 = 7,158.8329; DCP 200.091 + 1.184 = 201.275. China sales 23,592.581, OB 7,306.1249, total 30,898.7059 (displayed 30,899).


## DCP W40 External YTD correction (2026-10-03)

The owner supplied a corrected DCP YTD sales figure of approximately 260.8K, with screenshot value 260,814.49 EUR. Reporting converts it to 260.81449 kEUR and applies it to FY2026 DCP W40 only. It is entirely External, affects both All sales and External invoices and top cards, and leaves Group at zero. Original workbook H10 (200.091 kEUR), stored raw source records, previous weeks and other BUs remain unchanged. Source provenance identifies the owner screenshot and conversion. The owner supplied no monthly allocation: existing monthly invoice observations and J10 stay intact, with a Review finding, while the annual/cumulative-current-month anchor uses the corrected YTD total.

DCP OB is unchanged at 1.184; Sales + OB = 261.99849 (displayed 262), Sales to date/top sales card displays 261. China All-sales YTD is 32,003.81749, annual base 39,939.10739; External YTD is 23,653.30449, base 30,959.42939. Approved budgets and FY2027 records remain unchanged.

## Coverage and Residual Gap exclude Prospect (2026-10-03)

Owner confirmation supersedes earlier scenario-completeness restrictions above: both scenario selections calculate Coverage as annual Sales + OB / approved annual budget and Residual Gap as approved annual budget minus annual Sales + OB. Supplied or missing Prospect never affects these two metrics. Scenario totals, Prospect readiness, top-strip rules and monthly calculations remain unchanged. Complete comparable budgets and complete annual Sales + OB are still required; External/Group budget allocations and pending FY2027 budgets are not invented. Entity, aggregate, history and export share this rule.
