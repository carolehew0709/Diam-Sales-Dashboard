# Source and metric contract

The independent Windows sales-order matching utility is documented in [order-matcher.md](order-matcher.md). It copies verified DEHK source currency/prices into a separate DDC result workbook and does not modify dashboard snapshots, permissions or published data.

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

- Annual Budget: approved annual budget for the selected scope/year; null if any selected entity budget is missing. Budgets have no External/Group allocation, so filtered sales-type coverage/gap are unavailable.
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

At the owner request, the FY2027 Annual Budget total now displays the known approved DEHK + DDC budget: 29,014 + 6,017 = 35,031 kEUR for China/APAC selections that include both. It is explicitly labelled a known subtotal and names the included BUs; missing DCP/DSI/DDI/DDJ budgets remain null. Permission and BU filters apply before summing. `budgetComplete` remains false if any selected BU budget is absent; coverage/gap still require a complete comparable budget. FY2026 aggregation retains its existing complete-budget rule. Exports show the subtotal with its partial-scope note.


The owner subsequently requested pending FY2027 DCP/DSI/DDI/DDJ budgets display as 0. `pending2027Budgets` keeps these placeholders separate from confirmed budgets; source/operating data remains absent. Each pending BU shows budget 0 and a translated pending finding. China/APAC Annual Budget sums to 35,031 with a pending-budget note. `budgetComplete` stays false, so these provisional zeros do not enable approved-budget coverage/gap. No monthly allocation is invented; FY2026 values are unchanged.


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

## Residual Gap sign convention (2026-10-08)

Owner confirmation supersedes the earlier budget-minus-base sign: Residual Gap = annual Sales + OB minus approved annual budget, excluding Prospect in both scenarios. Positive means above budget; negative means below budget; zero means at budget. No absolute-value conversion is applied. Entity KPIs, China/selected aggregates, Gap by BU, and Excel exports share the same calculation. FY2026 China W40 base 39,939.10739 minus approved budget 33,207 = +6,732.10739 kEUR (displayed 6,732). Coverage stays 120%; monthly Remaining, invoice-only top strip, BU sales-type rules and missing-budget protections remain unchanged.

## FY2027 provisional comparisons (2026-10-08)

Owner requested FY2027 calculations as well. Pending DCP/DSI/DDI/DDJ budgets now count as 0 for provisional comparisons only; budgetComplete remains false and UI/export retain pending status. Coverage = complete annual Sales + OB / comparable budget total, Gap = complete annual Sales + OB minus comparable budget total, excluding Prospect. China uses 35,031 budget. Missing BU Sales + OB still prevents complete aggregate comparisons (APAC stays blank while DSI/DDI/DDJ have no source). A zero budget permits signed Gap when Sales + OB exists, but never permits division for Coverage. FY2026 and External/Group budget availability are unchanged. FY2027 uses next-year OB with YTD sales 0; Remaining stays blank because no future MTD invoicing is supplied.

## Final budget allocations (2026-10-09)

Owner table in screenshot 4bdcb716c2c1194b6363ecb78198efa8.png supersedes all earlier FY2026/FY2027 budget versions above. Unit: kEUR.

| BU / Sales Type | FY2026 | FY2027 |
| --- | ---: | ---: |
| DDC External | 5,467 | 6,017 |
| DEHK External | 19,344 | 24,732 |
| DEHK Group | 5,788 | 5,039 |
| DCP External | 2,608 | Pending (dash) |
| All Sales approved/known total | 33,207 | 35,788 |

DDC/DCP are External-only in the supplied table, so their Group allocation is 0. DCP FY2027 dash remains pending, displayed and provisionally compared as 0 under the prior owner rule. DSI/DDI/DDJ remain unavailable in FY2026 and pending in FY2027. FY2026 External total 27,419 and Group 5,788 reconcile to 33,207. FY2027 External known total 30,749 and Group 5,039 reconcile to 35,788. All Sales BU budgets derive from the split table; they are not separately maintained. The Sales Type selection uses the matching annual budget for entity, China/region totals, Coverage, Gap by BU and Executive Summary export. Coverage = Sales + OB / matching annual budget; Gap = Sales + OB minus matching annual budget, excluding Prospect. Zero denominators never produce a ratio. Monthly budget phasing stays unavailable. Existing sales/OB rules, including the owner-confirmed FY2027 DEHK OB 2,597 aggregate vs workbook splits 2,478 External + 101.224 Group, remain unchanged and documented. Source workbooks and generated raw seed are not modified.

## W41 source refresh and DCP anomaly confirmation (2026-10-11)

Active sources are Dashboard 2026 - DDC(3).xlsx, Dashboard 2026 - DEHK(3).xlsx and W41-- Dashboard 2026 - DCP(1).xlsx, all W41 dated 2026-10-09. Original/archived workbooks remain intact. The source seed contains 122 populated entity-week snapshots and 2,475 historical order lines.

DCP W41 H10 remains 200.091 kEUR despite the prior owner-approved YTD 260.81449. The decline of 60.72349 was raised before publication; the owner explicitly confirmed continuing 260.81449 for W41. The reporting copy overrides External/All YTD and top sales cards only, with dated provenance; raw H10 and monthly invoicing remain intact. This approval is limited to W40/W41, not future weeks.

DDC keeps H10 sales 5,136.274, O10 annual base 7,158.8329, K17 OB 2,022.5589; DEHK duplicate orders 2,945.848 (FY2026) and 356.371 (FY2027) are excluded. DDC FY2027 net External OB is 51. DEHK FY2026 H12 YTD 26,606.729 plus K17+K18 OB 5,945.547 = 32,552.276. DCP owner YTD 260.81449 + L10 OB 1.184 = 261.99849. China annual All base is 39,973.10739, Coverage 120%, Gap +6,766.10739; October Remaining 2,807.6859. External base is 30,984.42939 and Group base 8,988.678.

DEHK W41 FY2027 OB is the new source split 2,932.464 External + 150.224 Group = 3,082.688. The prior 2,597 override remains W40-only. China FY2027 OB is 3,133.688 including DDC 51; budget 35,788, Coverage 9%, Gap -32,654.312. Monthly OB phasing is supplied for this new week; future MTD Remaining remains blank. Approved budget splits and prior Sales scenario/Prospect/External/Group display rules remain unchanged. No unexpected formula errors or summary/detail inconsistencies were found in W41 headline source ranges.

## India DDI W41 onboarding (2026-10-15)

Added 2. Dashboard_2026_DDI_Week-41.xlsx unchanged. `Diam India` resolves to DDI/India. The importer respects summary SUMIF order row ranges (W41 rows 24:115) so deferred revenue, new-order notes and the orderbook movement bridge are not imported as customer orders. The baseline now has 163 populated entity-week snapshots and 5,001 order lines, including 41 India snapshots and 2,526 India orders; W41 has 84 real orders. An unexplained 37.243240586632055 kEUR movement-bridge difference remains a translated Review finding without altering the reconciled main table. Source amounts: H10 External YTD 6,017, H11 Group 178; K17 current External OB 2,824.8619257625332, K18 Group 84.489658888; India All base 9,104.351584650532 and Remaining 1,484.396964781534. FY2027 External OB L17 is 109.15973, Group 0. Source budget/Prospect remain unavailable; FY2027 budget keeps the prior pending-0 policy. China special invoicing/intercompany exclusions are not applied to India.

The India editor has only DDI view/edit, cannot read China dashboard/history/customer/export/source data, cannot import any other BU or a mixed-scope batch, cannot publish and cannot administer users. All API/export scopes are enforced server-side. Reporting region options contain only permitted regions; India-only users default to India. The top briefing follows selected reporting region (India Total + DDI for India; China Total + DEHK/DDC/DCP for China), and country totals stay visible within scope even when a BU is selected. India All Sales scenario first-row invoicing uses H12 (H10+H11), unlike External-only DDC/DCP. Credential files are local and ignored. Production credential configuration remains separate from the code deployment.

## India W43 update and FY2026 budget (2026-10-24)

Received `2. Dashboard_2026_DDI_Week-43.xlsx`, with 57 sheets including hidden `DB analysis orders` and `Synth`. Only W1–W43 are populated; W44–W52 are unused templates. Supporting pivots and the old W2 comparison are not independent sales sources. W2 H282/H284/H286 have pre-existing #REF! errors outside the imported order range. W42/W43 contain cached numeric summary/detail values with no formula errors or missing formula caches. The parser uses source SUMIF detail boundaries, never footer notes. The private workbook is retained unchanged outside the public repository; the committed demonstration seed remains the separately identified W41 India baseline, not a substitute for live published W43 data.

The existing analyze → review → publish flow published batch `72d39179-dbbc-4ec5-81e3-5dee6c38ddff` to AWS PostgreSQL, revision 7. It contains 43 DDI snapshots and 2,688 historical order lines. W1–W41 values match the prior published India source; W42 adds 80 orders and W43 adds 82. Other BUs, users/permissions, customer analyses and AR were verified unchanged. Repeating publication of this batch is idempotent. W42 retains its source movement-bridge Review; W43's main table and monthly/detail totals reconcile. Source dates are W42 2026-10-16 and W43 2026-10-23; other BUs retain their independent weeks.

| Metric (kEUR) | Prior W41 | W42 | W43 |
| --- | ---: | ---: | ---: |
| Invoiced sales (H10 + H11) | 6,195 | 6,369 | 6,452 |
| Current-year OB (K17 + K18) | 2,909.351584650533 | 2,826.358961003534 | 2,742.911482379534 |
| Annual Sales + OB | 9,104.351584650532 | 9,195.358961003534 | 9,194.911482379533 |
| Remaining this month | 1,484.396964781534 | 908.266804424555 | 687.208400426555 |
| FY2027 OB (L17 + L18) | 109.15973 | 91.48217 | 105 |

W42→W43 invoicing rises 83 and OB falls 83.447478624, giving a net annual-base decrease of 0.447478624; preserve source amounts rather than forcing a monotonic forecast. W43 October invoices are 513 External + 50 Group; October OB is 687.208400426555, November OB 1,212.848273150610 and December OB 842.854808802370. Prospect remains missing.

The owner additionally confirmed India Annual Budgets at **10,667 kEUR for FY2026** and **10,200 kEUR for FY2027**, total only. `lib/annual-budgets.ts` applies them to All sales without inventing External/Group or monthly allocations, and weekly imports cannot overwrite them. W43 FY2026 Coverage is 86.199601409764% and Gap is -1,472.088517620467 kEUR, both excluding Prospect. FY2027 supplied OB 105 gives Coverage 1.029411764706% and Gap -10,095 kEUR. Team budgets remain missing. Prior documentation describing the India budgets as unavailable/pending is superseded by these confirmations; China budgets remain unchanged. FY2027 APAC known budget becomes 45,988 (China 35,788 + India 10,200); unavailable operating inputs still prevent complete APAC Coverage/Gap, and other pending BUs remain marked.

## Japan DDJ W43 source and budgets (2026-10-24)

Owner supplied `Dashboard 2026_W43- DJP.xlsx` and explicitly confirmed W43. Source G2 `Diam Japan`, G4 `W43` and G6 `October` agree with the filename. Map `Diam Japan` and `DJP` aliases to existing internal `ddj`, display BU `DDJ`, reporting region Japan; do not create a second BU. All-sales invoice-only top strip uses H12 = H10+H11, retaining Group invoices. External/Group and the DDC/DCP special rules stay separate.

All 57 sheets were inventoried, including hidden parameters and DB analysis orders. W1–W43 contain 43 valid Japan snapshots and 2,143 order lines; W44–W52 are unpopulated templates, not zero-valued new reporting weeks. Supporting Synth/pivot/analysis sheets are not added to weekly totals. Formula caches are supplied, no formula errors were found, and source order SUMIF bounds exclude footer/template rows. The original workbook contains customer/order details and stays in a restricted private source directory, excluded from public Git. The demonstration seed is unchanged; active production data uses authenticated analyze → review → explicit publish into PostgreSQL.

| Metric (kEUR) | W41 | W42 | W43 |
| --- | ---: | ---: | ---: |
| Invoiced sales H12 | 7,562 | 7,562 | 7,562 |
| Current-year OB K17+K18 | 1,734 | 1,992 | 2,041 |
| Annual Sales + OB O12 | 9,296 | 9,554 | 9,603 |
| Remaining this month | 917 | 534 | 512 |
| FY2027 OB L17+L18 | 531 | 675 | 438 |
| Actual order rows | 54 | 57 | 57 |

W43 is dated 2026-10-23. H10 is 7,549 and H11 is 13; all-sales invoicing is 7,562, not External alone. October invoicing is a supplied 0; monthly OB is October 512, November 720 and December 809, totaling 2,041. FY2027 monthly OB is January 179, February 78 and March 181, totaling 438. Annual base increases 49 from W42, entirely from current-year OB. FY2027 OB decreases 237; preserve the new source instead of carrying the prior week's amount. Prospect and team assignments are unavailable and must not be inferred.

Owner-confirmed DDJ total-only Annual Budget is 9,700 for FY2026 and 11,000 for FY2027. No External/Group or monthly allocation is approved; those views retain missing budgets, as do team views. DDJ no longer uses the FY2027 pending-zero placeholder. W43 FY2026 Coverage = 9,603 / 9,700 = 99%; Gap = -97. FY2027 Coverage = 438 / 11,000 = 3.981818181818%; Gap = -10,562. Both exclude Prospect. FY2027 APAC known budget now totals 56,988 (China 35,788 + India 10,200 + Japan 11,000), superseding the preceding subtotal. Singapore remains pending with missing operating data.

Publication is scoped to Japan entity/year/week only. Verify 43 snapshots/2,143 orders, latest W43, unchanged other-BU records, India budgets/data, users/permissions, AR and customer analyses; retain audit/revision and same-batch idempotency. Synthetic Japan regression tests cover aliases, populated-week detection, source order bounds, Group invoicing, total-only budgets and India isolation. Verify the deployed dashboard and downloaded Excel against the table above.

## China W43 partial publication (2026-10-24)

Received `Dashboard 2026 - DEHK(5).xlsx`, `Dashboard 2026 - DDC(5).xlsx` and `W43-- Dashboard 2026 - DCP(1).xlsx`. Each workbook contains 57 sheets, with latest valid source G4 W43/G6 October, reporting date 2026-10-23. All sheets including hidden/supporting sheets were inspected for errors and formula caches: no formula errors or missing cached formula values were found. W44–W52 are unused templates. W1–W42 financial values match the previously published data. Source files contain private customer/order details, remain unchanged in restricted server storage, and are ignored by public Git; the committed demonstration seed remains the separate W42 China baseline.

DEHK was published through analyze → review → explicit publish in batch `e905945a-54aa-4cdf-b1d4-38bf627f61b6`, revision 9 (43 snapshots, 1,531 historical order rows; W43 has 42 actual orders). DDC was published in batch `2875e2cb-6c5e-4ed9-991e-65605616f1d4`, revision 10 (43 snapshots, 819 historical rows; W43 has 19 actual orders). Re-publication of each batch is idempotent. DCP, India, Japan, users/permissions, AR and customer analyses were verified unchanged by these two publications.

| Metric (kEUR) | DEHK W42 | DEHK W43 | DDC W42 | DDC W43 |
| --- | ---: | ---: | ---: | ---: |
| Reported invoiced sales | 27,360.379 | 27,605.287 | 5,247.068 | 5,322.373 |
| Reported current OB | 5,388.523 | 5,432.615 | 2,013.3319 | 2,052.6339 |
| Annual Sales + OB | 32,748.902 | 33,037.902 | 7,260.3999 | 7,375.0069 |
| FY2027 reported OB | 3,411.526 | 3,606.526 | 51 | 51 |

DEHK uses H12 invoices and K17+K18 OB; its annual base rises 289 (invoices +244.908, OB +44.092). DDC retains External-only H10/O10/K17 reporting; annual base rises 114.607 (invoices +75.305, OB +39.302). Group and intercompany exclusions remain unchanged. Monthly and team OB use source allocations; approved annual budgets remain China 33,207 for FY2026 and 35,788 for FY2027, with no monthly budget/Prospect inference.

DCP's new workbook has 42 populated snapshots and 252 historical order rows, including two W43 orders. W43 H10 remains 200.091, below the owner-confirmed W42 reporting value 260.81449. Batch `606afa81-cc3c-42ed-80bc-b5ece2f59629` was initially held in review while the owner decision was pending, leaving DCP W42 and mixed China source weeks at revision 10. The owner subsequently explicitly confirmed **W43 continues at 260.81449 kEUR** on 2026-10-24. This confirmation activates W43 in `lib/reporting-overrides.ts`, preserves raw H10 and all monthly invoice amounts, and does not extend into W44 or later. Complete the existing reviewed batch through explicit publication, rather than replacing source values or making a new baseline overwrite the database.

The reviewed DCP batch was subsequently explicitly published to AWS PostgreSQL at **revision 11**, after deploying the confirmed W43 reporting rule. All three China BUs are now W43. Same-batch publication was verified idempotent and raw H10 remains 200.091 in storage. DCP annual Sales + OB remains 260.81449 + 1.184 = 261.99849. China FY2026 All base is 40,674.90739, External base 31,500.53639 and Group base 9,174.371; budget is 33,207 and Remaining this month is 1,250.8159. FY2027 base is 3,657.526 against budget 35,788. Other BU records, users/permissions, annual budget rules, AR and monthly customer datasets were verified unchanged by this publication.

The owner confirms W43 teams are in the first table column. In the supplied sheets this is Excel **D**, aligned with order rows from row 24. The existing parser reads this column, normalizes whitespace and keeps `X` as a marker rather than a team. DEHK has eight named teams; DDC includes named teams plus missing assignments; DCP's two current orders have no team and remain Unassigned. Team OB must reconcile to the same scoped, intercompany-adjusted orders in annual/monthly contributions and exports. Team invoice sales, budgets and Prospect remain unavailable; this source column does not authorize allocating them from BU totals.

## Team filter scope and DDC confirmation (2026-10-26)

The owner confines Sales Team to the team module as a front-end presentation filter. It no longer changes global dashboard data: only team OB contribution, monthly detail and their PNG/SVG/bilingual chart workbook sheet follow the local selection. A one-team share is relative to the selected OB total, explicitly labeled. Global scope changes reset the selector. Existing team-specific API projections and authorization remain intact for compatibility. The owner also reconfirms continuing the FY2026 DDC Group exclusion until further notice.

Terminology and scenario calculations remain under discussion. Read-only verification of private DDC/DEHK W43 sources confirms O8 is `Forecast 2026`, O10 = H10 + K17, O11 = H11 + K18, and O12 = SUM(O10:O11). Thus that source Forecast is an annual total including invoices and remaining OB, not OB itself. DDC External W43 reconciles 5,322.373 + 2,052.6339 = 7,375.0069 kEUR. Direct-entity imports do not supply a separate Prospect/P1 monthly series. Current monthly Sales planning uses actuals + source OB; Sales + Prospect adds a distinct supplied monthly Prospect series only when available, otherwise explicitly falls back to the known base. No metric renaming, inferred pipeline or additional amount is authorized by this discussion.
