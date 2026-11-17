# Pipeline and sales operations

Pipeline is based on an opportunity export from CRM. Sales Performance and its weekly Prospect allocations retain their own sources.

## Import and scope

In Pipeline, an authorized publisher selects an XLSX export, enters the export's snapshot date, reviews the affected Entities and amounts, and publishes. An original copy is saved in the private import archive. The dated copies are stored by Entity in the app's persistent store, and the dashboard uses the latest published date within the selected ISO week for each Entity with data that week. A partial workbook affects only the Entities present. A new publication for the same Entity and date replaces that date and preserves other dates. The server ties publication to the reviewed file, date and Entity scope, and checks publish authorization again inside the transaction. Invalid critical fields or duplicate opportunity IDs block import.

- The export provides one row per opportunity. Use G for opportunity ID and C for project code. Projects are deduplicated by code within each status and across the total independently.
- K identifies the operating Entity. DEHK maps to `dhk`; 迪亚姆展示设备（昆山）有限公司 maps to `ddc`. Region follows existing Entity settings. Team uses the source sales group in L. Customer uses J. The Customer Group field uses a supplied customer-group column or the temporary B brand fallback when absent.
- Report O expected income in original currency using E settlement currency. USD, RMB and EUR are separate sums. Display missing income separately. The workbook's base-currency F and other currency label AM do not contribute to amounts.
- Use I for business status, S for the sales stage, and the marked current stage in Q if S is absent. Optional columns named `重点项目` or `Key Project` mark key projects through an affirmative flag.
- Count YTD and weekly new opportunities by AB creation date and lost opportunities by I lost status and V decision date. The first export forms the YTD baseline. This event series can show movements before the first published status snapshot. It cannot reconstruct earlier stages or amounts.
- The movement cards sum expected income for the same opportunities as their counts. For these four cards only, fixed reporting rates are 7.7 RMB and 1.1 USD per EUR, and the total is displayed in kEUR. Missing amounts are flagged; a nonempty group with no reported amount stays blank. The adjacent weekly status and sales stage panels use original currencies and deduplicate projects within each row.
- The new-opportunity comparison uses the current month to date and full previous month from source dates. Status and income comparisons use the most recent published snapshot from the previous month for each Entity in scope. Missing comparisons stay blank. Integer y-axis ticks do not round the underlying chart data.
- The existing Entity view and publish permissions apply. The workbook and commercial detail stay out of Git.

## Sales Operation Management

The home module shows Order → Shipment → Invoice → Payment and the planned Team, Week and Customer Group views. The page uses an empty state until ERP data is connected.
