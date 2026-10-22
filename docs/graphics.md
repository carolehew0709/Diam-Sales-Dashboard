# Graphics workbook integration

The five-sheet `Graphics.xlsx` supplied on 2026-10-21 is a reference and a monthly customer source. Workbook notes are source evidence, not executable application instructions. The original attachment is unchanged. Existing navigation, filters, sections, KPI formulas, approved budgets, raw workbooks and the AR workflow are retained.

## Sheet-to-website mapping

| Sheet | Website addition | Source and refresh |
| --- | --- | --- |
| Graphics | Catalog for annual/monthly combination plots, waterfall, gauge, BU breakdown, customer mix/YoY and team contribution | Reference only; embedded example images do not supply live amounts |
| Annual vs. Monthly | Selected-region and individual BU monthly bars + invoiced YTD line; expandable exact data/source table | Published weekly snapshots, last available week in each source reporting month; follows existing sales type and BU reporting rules |
| Budget vs. YTD | Annual budget → YTD invoices → committed OB → annual Sales + OB waterfall; annual coverage gauge | Current dashboard metrics; approved budgets and existing FY2027 provisional-zero rules; Prospect excluded |
| Entity & Business Unit Breakdow | Monthly customer-mix stacked columns; BU contribution bars and budget-area coverage treemap use the existing weekly source | Customer mix uses Tiger Plan August 2026, A4:E11; no double-counting row 7 Intergroup and its children |
| Customer Contribution & Focus | Six-customer YTD contribution donut, comparable YTD bars/growth and source-status table | Tiger Plan August 2026, A4:E11; six-customer total 11,923 kEUR vs 11,873 in 2025 |

The catalog's Team Contribution chart uses published **order book**, including unassigned teams, not team revenue. It follows existing line exclusions and selected scope/type/year. Small tails group as Other without changing the denominator. It does not imply supplied team invoices, budgets or attainment.

## Periods and calculations

Weekly and monthly sources are deliberately separate. Charts and image exports identify period, unit, scope and source. November/December invoiced sales remain blank until supplied; FY2027 OB never becomes invoiced actuals. Missing BUs are not treated as zero. Monthly bars are changes in invoiced YTD between consecutive reporting-month snapshots, rather than the existing forward-looking monthly Sales + OB/Prospect plots. They can reflect source revisions and are not an audited monthly revenue ledger.

The DCP owner-confirmed W40–W42 YTD correction remains 260.81449 kEUR under existing reporting rules. Its unallocated correction is not assigned to October; October monthly bars for DCP and the complete regional total stay blank. Raw source amounts and existing monthly allocation remain unchanged. DCP Group invoices in the reference's PACK H12 series are superseded for reporting by existing H10-only rules. Therefore new weekly plots intentionally need not reproduce the reference W41 cached totals.

The example budget sheet calls committed OB “Prospect (OB)”. The website consistently distinguishes committed OB from Prospect/P1. Waterfall uses the current annual base and includes a source-adjustment step if it cannot be reproduced as known Sales + OB; incomplete inputs show Review. Gauge reports the true percentage even above its 150% visual scale. Treemap area uses positive approved annual budget; missing/pending/zero budgets have no area and remain explicit in the table.

Customer data is **2026-08**, supported by both “Tiger Plan Aug data” source labels, Y25/Y26 headings, and the workbook's external August finance-file reference. It is a China aggregate for DEHK + DCP + DDC. APAC selection displays only that China subset, explicitly labeled. No BU, sales-type or team allocation is invented. The donut denominator is the six supplied key customers (11,923), while the key-customer share KPI divides by the full monthly-source China total (29,182). YoY compares the same source month in both years. Source FCST is shown as forecast, never as approved budget. Status descriptions are preserved, not inferred from new thresholds.

## Permission and monthly update contract

`/api/customer-analysis` authenticates the caller and returns customer values/months only with view permission to **all three** China BUs, China/APAC reporting region, all BUs/entities, all sales types and all teams. India and partially scoped China accounts receive no aggregate values or month list. Seed data is imported only in server-side repository code; no customer seed is bundled into browser code or served from `public/`.

`data/customer-analysis.json` is a reviewable derivative extracted from the attachment. Existing stores missing `customerAnalyses` use this authorized baseline; an explicit persisted empty array stays empty. Recreate the baseline with `npm run extract:graphics -- <path-to-Graphics.xlsx>`. Do not use this extraction command for routine activation of uploads.

Monthly updates use the current import portal: upload a workbook containing `Customer Contribution & Focus` and `Entity & Business Unit Breakdow` (full `Breakdown` name also supported), their existing headers/columns, consistent explicit English source month names, numeric cached cells and comparable YTD years. All five reference sheets are inventoried. Monthly import ignores weekly example data and creates no sales snapshots/order lines. Missing numeric values, negative contribution amounts, inconsistent source months and unreconciled totals block publication. Customer analysis currently requires the supplied five breakdown categories and six-key-customer-style table with a TOTAL terminator; raw source names remain preserved.

Analyze creates a review batch only. Editing all three China BUs is required to submit/review. Existing publisher permissions plus acknowledged Review findings are required to activate; viewers and editors cannot publish. Publish replaces that monthly record, preserves other months and all weekly data, increments revision and writes an audit event using existing file/PostgreSQL transactions. The website offers a source-month selector. Failed/aborted requests do not leave another filter scope's old customer numbers visible.

## Export

Each new chart and existing monthly/cumulative SVG chart has local **PNG** (3× resolution) and **SVG** downloads. Exported images contain the title, selected scope, source period, units and limitation/source notes. Text is escaped through DOM text nodes. Exports use a self-contained SVG and browser canvas; no chart data is sent to an external image service. Existing workbook export layout is unchanged. Data/source details remain available alongside each chart.

Chart sections now use an ivory/gold data tooltip instead of native SVG title popups. Hovering or focusing a mark highlights and gently lifts it while reducing emphasis on the others. Donut segments and their legend rows share highlighting; monthly marks show monthly and YTD values together; customer comparisons retain the selected source month. Static hit geometry prevents movement from flickering under the pointer. Keyboard focus and Escape are supported, tooltip placement stays within the viewport, and reduced-motion preferences suppress movement. PNG/SVG/Excel image exports remove interaction hit layers and hover state, preserving the original chart and exact source tables.

The **Download charts Excel / 导出图表 Excel** button in Sales performance graphics downloads a separate `.xlsx`: one chart per worksheet, exact numeric data in the upper table and the corresponding high-resolution PNG underneath. It includes the original monthly/cumulative charts, collapsed BU charts and permitted monthly customer charts, using their currently selected customer-source month. The default China view has 17 worksheets (12 new graphics and 5 original performance charts). Unavailable charts retain blank values and Review notes; no numbers are invented. Incompatible or unauthorized customer scopes have no customer sheets.

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
| Approved monthly budget allocations | Existing monthly budget series remain blank; annual budgets are not spread over months |
| DCP corrected YTD monthly allocation | No fabricated October monthly amount |

Validation covers source reconciliation, period handling, filter/RBAC boundaries, weekly reporting regressions, local image downloads, bilingual rendering and production build. PostgreSQL retains its existing validation limitations; no new database provisioning is implied.
