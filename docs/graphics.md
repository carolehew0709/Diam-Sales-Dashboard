# Graphics workbook integration

The five-sheet `Graphics.xlsx` supplied on 2026-10-21 is a reference and a monthly customer source. Workbook notes are source evidence, not executable application instructions. The original attachment is unchanged. Existing navigation, filters, sections, KPI formulas, approved budgets, raw workbooks and the AR workflow are retained.

## Sheet-to-website mapping

| Sheet | Website addition | Source and refresh |
| --- | --- | --- |
| Graphics | Catalog for annual/monthly combination plots, waterfall, gauge, BU breakdown, customer mix/YoY and team contribution | Reference only; embedded example images do not supply live amounts |
| Annual vs. Monthly | Selected-region and individual BU monthly planning bars + cumulative planning line; expandable exact data/source table | Current published weekly snapshot and the existing monthly/cumulative Sales + OB / Prospect metrics; follows global region, BU/entity, year, sales type and scenario |
| Budget vs. YTD | Annual budget → YTD invoices → committed OB → annual Sales + OB waterfall; annual coverage remains in the KPI | Current dashboard metrics; approved budgets and existing FY2027 provisional-zero rules; Prospect excluded |
| Entity & Business Unit Breakdow | Monthly customer-mix stacked columns; detailed BU contribution bars and External/Group sales composition use the existing weekly source | Customer mix uses Tiger Plan August 2026, A4:E11; no double-counting row 7 Intergroup and its children |
| Customer Contribution & Focus | Six-customer current-YTD contribution donut alongside comparable YTD bars/growth and source-status table | Tiger Plan August 2026, A4:E11; six-customer total 11,923 kEUR vs 11,873 in 2025 |

The catalog's Team Contribution chart uses published **order book**, including unassigned teams, not team revenue. It follows existing line exclusions and selected scope/type/year. Small tails group as Other without changing the denominator. It does not imply supplied team invoices, budgets or attainment.

## Periods and calculations

Weekly sales planning and monthly customer sources remain separate. The primary full-width monthly/cumulative combination chart reuses the **same monthly and cumulative metrics as the former Annual trajectory / Monthly phasing planning curves**, with monthly columns and one cumulative line. Sales selects Sales + OB; Sales + Prospect selects the supplied monthly/cumulative scenario. If all Prospect phasing is unavailable, known Sales + OB is shown with an explicit notice. Partially supplied scenarios retain their gaps. Missing Prospect is never converted to zero. The Time Matrix uses the same metric-selection helper, so it and the chart cannot choose conflicting scenario fallbacks. No monthly budget is allocated.

The DCP owner-confirmed W40–W42 YTD correction remains 260.81449 kEUR under existing reporting rules. Its unallocated correction is retained in annual/cumulative metrics without inventing a monthly allocation. The previous invoices-only history derivative remains available internally, but no longer drives the main or BU planning combination chart. Raw sources, source overrides, planning metrics and permissions are unchanged; the cached reference W41 totals are not reporting authority.

The example budget sheet calls committed OB “Prospect (OB)”. The website consistently distinguishes committed OB from Prospect/P1. Waterfall uses the current annual base and includes a source-adjustment step if it cannot be reproduced as known Sales + OB; incomplete inputs show Review. The redundant coverage gauge and budget-area treemap are omitted. Coverage stays in the annual KPI and the detailed BU chart/table; BU detail also retains budget, invoiced sales, OB, gap and source evidence.

Customer data is **2026-08**, supported by both “Tiger Plan Aug data” source labels, Y25/Y26 headings, and the workbook's external August finance-file reference. It is a China aggregate for DEHK + DCP + DDC. APAC selection displays only that China subset, explicitly labeled. No BU, sales-type or team allocation is invented. The contribution donut uses all six supplied key customers (11,923 total) as its denominator. The adjacent customer YoY detail preserves the same six current values and prior values (11,873 total). The key-customer share KPI divides by the full monthly-source China total (29,182). YoY compares the same source month in both years. Source FCST is shown as forecast, never as approved budget. Status descriptions are preserved, not inferred from new thresholds.

## Permission and monthly update contract

`/api/customer-analysis` authenticates the caller and returns customer values/months only with view permission to **all three** China BUs, China/APAC reporting region, all BUs/entities, all sales types and all teams. India and partially scoped China accounts receive no aggregate values or month list. Seed data is imported only in server-side repository code; no customer seed is bundled into browser code or served from `public/`.

`data/customer-analysis.json` is a reviewable derivative extracted from the attachment. Existing stores missing `customerAnalyses` use this authorized baseline; an explicit persisted empty array stays empty. Recreate the baseline with `npm run extract:graphics -- <path-to-Graphics.xlsx>`. Do not use this extraction command for routine activation of uploads.

Monthly updates use the current import portal: upload a workbook containing `Customer Contribution & Focus` and `Entity & Business Unit Breakdow` (full `Breakdown` name also supported), their existing headers/columns, consistent explicit English source month names, numeric cached cells and comparable YTD years. All five reference sheets are inventoried. Monthly import ignores weekly example data and creates no sales snapshots/order lines. Missing numeric values, negative contribution amounts, inconsistent source months and unreconciled totals block publication. Customer analysis currently requires the supplied five breakdown categories and six-key-customer-style table with a TOTAL terminator; raw source names remain preserved.

Analyze creates a review batch only. Editing all three China BUs is required to submit/review. Existing publisher permissions plus acknowledged Review findings are required to activate; viewers and editors cannot publish. Publish replaces that monthly record, preserves other months and all weekly data, increments revision and writes an audit event using existing file/PostgreSQL transactions. The website offers a source-month selector. Failed/aborted requests do not leave another filter scope's old customer numbers visible.

## Export

Each displayed chart has local **PNG** (3× resolution) and **SVG** downloads. Exported images contain the title, selected scope, source period, units and limitation/source notes. Text is escaped through DOM text nodes. Exports use a self-contained SVG and browser canvas; no chart data is sent to an external image service. Existing workbook export layout is unchanged. Data/source details remain available alongside each chart.

Chart sections now use an ivory/gold data tooltip instead of native SVG title popups. Hovering or focusing a mark highlights and gently lifts it while reducing emphasis on the others. Donut segments and their legend rows share highlighting; monthly marks show monthly and YTD values together; customer comparisons retain the selected source month. Static hit geometry prevents movement from flickering under the pointer. Keyboard focus and Escape are supported, tooltip placement stays within the viewport, and reduced-motion preferences suppress movement. PNG/SVG/Excel image exports remove interaction hit layers and hover state, preserving the original chart and exact source tables.

The **Download charts Excel / 导出图表 Excel** button in Annual budget & invoicing downloads a separate `.xlsx`: one chart per worksheet, exact numeric data in the upper table and the corresponding high-resolution PNG underneath. The default China view has **11 worksheets**: one main planning combination chart, three expandable BU planning charts, one budget bridge, detailed BU contribution, External/Group composition, team OB, monthly customer mix, customer contribution donut and customer YoY. Removed gauges, treemaps and old planning-curve presentations have no exported sheet. Unavailable charts retain blank values and Review notes; no numbers are invented. Incompatible or unauthorized customer scopes have no customer sheets.

This export is a snapshot: images do not recalculate if spreadsheet cells are edited. Full numeric precision is retained in cells; percentages use numeric ratios with percentage formatting. Sheet names are sanitized and made unique, the data table and image never overlap, and sources/filter context appear on every sheet. It uses only mounted authenticated chart data; it never fetches unscoped source data. Filter/revision changes during export cancel the download; pending or failed monthly-source loading blocks incomplete exports. The writer is loaded on demand, leaving initial dashboard loading unaffected. Existing Export Excel continues to provide the original data workbook separately.

All chart worksheets share one visual template: centered table headers and all data cells (text, amounts, percentages and blanks), a gold title accent, dark headers, clear cell borders, alternating row shading and emphasized total/key-result rows. Metadata stays in a separate wrapped title/source block above the table. Column widths and row heights accommodate source labels without changing the data or the table-above-chart layout.

The export-language selector supports English and Chinese independently of the page language, defaulting to the current page locale. The same authorized chart snapshot is rendered locally under the selected locale, translating sheet names, table headers, months, statuses, descriptions and chart text together. Original customer/team names and source evidence remain unchanged. No additional data request is made, selected filters and customer month are preserved, and changing the page language or data during export cancels the stale export. Filenames include `en` or `zh-CN`.

## Remaining source gaps

| Missing source | Visible behavior |
| --- | --- |
| Comparable 2025 weekly invoiced sales and multi-year BU sales | Weekly sales YoY is explicitly unavailable; the supplied monthly customer YoY is shown separately |
| Original Tiger Plan/finance ledger and later customer months | August values use the supplied Graphics workbook; original ledger validation and September/October updates remain pending |
| Customer allocation by BU, sales type or sales team | Aggregate monthly customer graphics are unavailable under incompatible filters; no proportional allocation |
| Singapore/Japan sales sources; India customer analysis | Existing missing values remain blank; China customers never masquerade as APAC-wide or India data |
| Team invoiced revenue, approved team budgets and Prospect | Contribution explicitly reports source OB only |
| Approved monthly budget allocations | Monthly and cumulative performance charts omit budget from titles, legends, tooltips and chart exports; annual budgets remain in annual KPIs and budget graphics and are not spread over months |
| DCP corrected YTD monthly allocation | No fabricated October monthly amount |

## Review layout and filter behavior (2026-10-22)

The review order is: annual KPIs; full-width monthly/cumulative performance plus expandable BU monthly charts; budget bridge and invoicing progress; BU contribution and sales mix with expandable complete annual region/BU metrics; team/customer OB distribution; monthly customer analysis; Time Matrix; management/source checks. Related charts share a row where space allows and stack on smaller screens. The former Gap by BU sidebar is consolidated into the richer BU contribution detail, including Gap. Duplicate non-China annual tables are omitted because permitted region rows already include those entities.

The duplicate annual Prospect KPI is hidden when Prospect is missing, zero, or has no different scenario result. Its supplied amount or pending status is shown inside Sales & Dashboard (OB). A distinct supplied forecast card appears only in the Sales + Prospect scenario when its result differs. Coverage and Gap continue to exclude Prospect.

All weekly charts and their workbook/image exports use the selected authorized dashboard snapshot. Filter identity includes region, BU, entity, year, sales type, scenario and team. Superseded responses cannot overwrite the newest selection. While a new snapshot loads, the complete previous view stays mounted with its own source/filter labels; controls immediately show the requested selection and remain interactive. The new data replaces it only when ready, without clearing the page, resetting scroll, dimming the dashboard or announcing every scenario change. Workbook export remains blocked during a pending scope change. Independent monthly customer data is not fetched again for a Sales/Prospect-only change. Team scope shows an explicit unavailable invoiced-performance state rather than whole-BU revenue; team/customer OB remains filterable. External/Group composition also honors sales type. Monthly customer analysis has an explicit source-month basis independent of week/scenario and is unavailable for unsupported BU/type/team/permission scopes. Local customer selection falls back to All when that customer is absent from the new global scope.

The weekly Time Matrix remains annual scenario snapshot history and is never summed to produce monthly amounts. Sales filters fit six controls in one desktop row, wrap to three columns on smaller screens and two columns without sticky positioning on phones; AR layout is separate.

Validation covers source reconciliation, period handling, filter/RBAC boundaries, weekly reporting regressions, local image downloads, bilingual rendering and production build. PostgreSQL retains its existing validation limitations; no new database provisioning is implied.

A full browser reload starts at the top: an early local script disables scroll restoration and removes stale section fragments only for reload navigations. Ordinary deep links, in-page section navigation, browser back/forward and filter refresh behavior retain their existing rules.

At owner request, the last-sheet customer contribution donut is restored. The customer section places the customer-mix overview across the upper row, with equally sized contribution and YoY cards below. The restored donut retains monthly source labels, six-customer denominator, scope/RBAC checks, themed hover, PNG/SVG and a separate bilingual Excel chart sheet.

The supplementary matrix is retained for its unique weekly annual outlook history; monthly planning values overlap the monthly chart details. It is collapsed by default and opens in Week mode, while Month remains available. Weekly columns are annual outlook snapshots, not weekly sales increments, and are never summed.

Monthly planning bars distinguish earlier reporting months (sand) from the unfinished current reporting month and later months (slate blue). The boundary follows the selected source snapshots and uses the earliest period for mixed-month scopes; next-year planning is entirely open. Missing source periods do not invent a cutoff. The cumulative line remains gold. Legends, hover and PNG/SVG/bilingual Excel chart images use the same period colors; numeric amounts and monthly allocation rules do not change.
