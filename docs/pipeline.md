# Pipeline and sales operations

Pipeline is based on an opportunity export from CRM. Sales Performance and its weekly Prospect allocations retain their own sources.

## Import and scope

In Pipeline, an authorized publisher selects an XLSX export, enters the export's snapshot date, reviews the affected Entities and amounts, and publishes. An original copy is saved in the private import archive. The dated copies are stored by Entity in the app's persistent store, and the dashboard uses the latest published date within the selected ISO week for each Entity with data that week. A partial workbook affects only the Entities present. A new publication for the same Entity and date replaces that date and preserves other dates. The server ties publication to the reviewed file, date and Entity scope, and checks publish authorization again inside the transaction. Invalid critical fields or duplicate opportunity IDs block import.

- The export provides one row per opportunity. Use G for opportunity ID and C for project code. Projects are deduplicated by code within each status and across the total independently.
- K identifies the operating Entity. DEHK maps to `dhk`; 迪亚姆展示设备（昆山）有限公司 maps to `ddc`. Region follows existing Entity settings. Team uses the source sales group in L. Customer uses J. The Customer Group field uses a supplied customer-group column or the temporary B brand fallback when absent.
- Keep O expected income in its original E settlement currency in source records. The workbook's base-currency F and other currency label AM do not contribute to amounts. Pipeline amounts are displayed in kEUR, using 7.7 RMB and 1.1 USD per EUR. This applies to weekly status, sales stages, key projects, movement cards, previous-month income changes and upload review. Missing amounts are reported separately.
- Use I for business status, S for the sales stage, and the marked current stage in Q if S is absent. Optional columns named `重点项目` or `Key Project` mark key projects through an affirmative flag.
- Count YTD and weekly new opportunities by AB creation date and lost opportunities by I lost status and V decision date. The first export forms the YTD baseline. This event series can show movements before the first published status snapshot. It cannot reconstruct earlier stages or amounts.
- The movement cards sum expected income for the same opportunities as their counts. A nonempty group with no reported amount stays blank. The adjacent weekly status and sales stage panels deduplicate projects within each row.
- The new-opportunity comparison uses the current month to date and full previous month from source dates. Status and income comparisons use the most recent published snapshot from the previous month for each Entity in scope. Missing comparisons stay blank. Integer y-axis ticks do not round the underlying chart data.
- The existing Entity view and publish permissions apply. The workbook and commercial detail stay out of Git.

## Sales Operation Management

The home module shows Order → Shipment → Invoice → Payment and the planned Team, Week and Customer Group views. The page uses an empty state until ERP data is connected.

## Project-based reporting (2026-11-19)

The visible overview, movement cards, comparison counts and status tables now count distinct Entity + project code. Original opportunity IDs and rows remain the import/storage evidence. A later source row on an existing project is not a newly created project: project creation uses the earliest supplied creation date in the complete authorized Entity snapshot, before Team/Customer filters. New-project amounts sum known income of the matching project cohort once per source row. Recorded-loss project counts use the earliest dated lost record; their amounts sum the dated lost records of those projects. Missing income is reported as affected projects, not source-row counts. Native currencies and the fixed kEUR rates remain unchanged.

Project Status and Sales Status each offer Weekly and YTD plus a Projects/kEUR trend selector. Weekly means projects first created in the selected week; YTD means first created since January 1 through the selected snapshot date. Trend points group these creation cohorts by week and apply status/stage from the selected snapshot. These are cohort curves, not historical status-transition reconstructions. A project with different underlying statuses/stages may occur in more than one category, consistent with the earlier per-status grain.

Project Status omits won records from its rows, total and trend. Sales Status retains the supplied quote/design/sample/production/complete stages. ERP/Job Number/OB exclusions are explicitly deferred until an authoritative ERP source is provided; production or complete is not used as an invented order flag. There is no visible opportunity-count column. Original source workbook/error identifiers retain their real meaning. Each trend supports local PNG/SVG and the existing bilingual chart Excel export.
