# DIAM APAC Sales Dashboard

## Purpose

This repository contains the APAC demo for DIAM's sales-performance dashboard. It is a source-backed prototype using the APAC entity workbooks and the Global Follow Up workbook in `Dashboard/`. The demo reproduces the main US dashboard information architecture while adding APAC-scoped RBAC and a reviewable import portal.

## Working rules

- After completing and verifying requested changes, automatically commit and push the task changes to the current upstream branch unless the user asks otherwise. Do not include unrelated local files or force-push.

- Keep the dashboard focused on sales performance, planning, order book, Prospect (source P1), source readiness, and management checks.
- Keep interface copy in `locales/en.json` and `locales/zh-CN.json` using semantic keys and `useI18n().tr`. Translate display labels only; preserve API enum values and source evidence. See `docs/localization.md`.
- Preserve APAC (Total) -> China (DEHK/DCP/DDC), Singapore (DSI), India (DDI), Japan (DDJ). Keep China totals and entity detail visible within the user's scope. Display the Hong Kong BU as DEHK; retain internal entity ID `dhk` and legacy alias DHK. Map DEHK to `dhk` and Diam Pack Luxe China to DCP. Prefer the supplied DCP entity workbook; retain legacy PDA mapping only for historical imports with its limitations.
- FY2026 approved budgets are fixed in `lib/annual-budgets.ts`: DEHK 25,132 (External 19,344 + Group 5,788), DDC 5,467 (External only), DCP 2,608 (External only) kEUR. Weekly imports must not overwrite them. No monthly budget allocation is supplied.
- FY2027 confirmed budgets: DEHK 29,771 (External 24,732 + Group 5,039) and DDC 6,017 (External only) kEUR. At owner request, DCP/DSI/DDI/DDJ pending budgets display as 0, with explicit pending status. China/APAC budget shows 35,788; placeholders remain separate from approved budgets. At owner request (2026-10-08), FY2027 Coverage/Gap use pending budgets as 0 for explicitly provisional calculations when annual Sales + OB is complete; zero total budget leaves Coverage blank.
- Final owner budget table (2026-10-09) supersedes earlier budget versions. All Sales sums the approved External/Group split; the Sales Type filter uses its matching budget for Coverage/Gap. DDC/DCP have no Group allocation in the supplied table. DCP FY2027 dash remains pending, displayed/calculated as provisional 0. Original workbook values stay preserved.
- Annual Dashboard means approved annual budget. Coverage and Residual Gap use annual values; Remaining this month uses monthly uninvoiced amounts. Missing entity data stays blank.
- Coverage and Residual Gap exclude Prospect in both scenarios: annual Sales + OB divided by approved annual budget, and annual Sales + OB minus approved annual budget (positive above budget, negative below budget). Missing Prospect does not block these metrics; complete comparable annual Sales + OB and budgets are still required, with the explicit FY2027 provisional-zero exception above.
- FY2026 Scenario = Sales changes only the first/top China strip: DEHK uses H12, DDC/DCP use H10, and China Total sums permitted BUs. Sales + Prospect top-strip values and all lower KPI/chart/export calculations retain their existing rules.
- Apply the approved intercompany orderbook exclusions in `lib/intercompany.ts`: DDC to DEHK; DCP to DEHK/DDC. Preserve raw source data and invoiced sales in storage, and keep KPI, monthly, historical and exported amounts consistent. FY2026 DDC reporting uses External row only: H10 for Sales to date, O10 for its top card and annual Sales + OB, K17 for OB; Group invoicing/OB are excluded from reporting copies. FY2026 direct DCP entity reporting uses H10 for Sales to date and its top card, L10 for OB, H10+L10 for annual Sales + OB; Group values are excluded in reporting copies. DEHK and legacy PDA rules remain unchanged.
- Keep metric names and units explicit. The source workbooks use kEUR and entity/week reporting.
- Put business rules in `lib/` and keep pages/components focused on presentation and interaction.
- Add or update documentation when a data grain, permission rule, or import contract changes.
- Use the DIAM assets in `DIAM Logos/`; do not add credentials or copied US staging session data.
- Preserve the original source files. `data/apac-dashboard.json` is a generated, reviewable derivative; regenerate it with `npm run extract:source` after replacing a workbook.
- Do not silently fill missing source values. Keep missing annual budgets/readiness visible as `Review` and document the source limitation.

## Data handling

- JSON is the initial seed. Local changes persist through the file adapter; cloud persistence uses the PostgreSQL adapter interface and requires DATABASE_URL. Do not enable ephemeral file writes on Vercel.
- US staging URLs, usernames, passwords, cookies, and tokens are secrets and must never be committed to app code or docs.
- Import data follows analyze -> review -> publish. Never make an upload active without a publish action.
- Show source, week, entity, and validation status for imported records.

## Permission rules

- `superadmin` can manage users and permissions across the APAC boundary.
- `region_admin` can manage data only inside assigned Region scope; only `superadmin` manages users and permissions.
- `editor` can submit and review imports for permitted accounts but cannot publish or manage users.
- `viewer` can view permitted dashboard data and export it, but cannot import, publish, or manage users.
- Visibility is the intersection of region scope and account-level `view`; editing additionally requires `edit`.
- The APAC region is the active boundary today. Region codes remain data-driven for future expansion.

## Demo limits

The current dashboard snapshot is extracted from the three workbooks in `Dashboard/`. Password login, scoped API access, import review/publish, revision history, and local persistence are implemented. The PostgreSQL transaction adapter is prepared but has not been validated against a provisioned cloud database. Brand data remains unavailable until formal APAC sources are supplied. SSO, centralized abuse protection, immutable audit storage, object storage, cloud database configuration, and Vercel rollout remain deployment work.

## Reporting Region and BU mapping

Region options are APAC (Total), China, Singapore, India and Japan. APAC includes all six BUs. China includes DEHK, DCP and DDC; Singapore includes DSI; India includes DDI; Japan includes DDJ. The BU filter and Gap by BU use these entity codes. China remains the default reporting region and its permitted totals/detail remain visible across selections. Changing Region resets BU and Entity selection. The account authorization boundary remains APAC; reporting-country selection does not grant additional account access. Empty source values remain blank.

FY2026 sales-type formulas: All sales retains established BU rules; External uses H10 sales + K17 OB for every direct entity source, independent of DDC O10/DCP L10 overrides. Group stays unchanged (DEHK H11 + K18; DDC/DCP excluded). Sales scenario top strip continues its invoices-only rule.

DCP FY2026 W40/W41 External YTD owner correction: screenshot 260,814.49 EUR = 260.81449 kEUR (approximately 260.8K), applies to All/External invoices and top sales cards only for W40 and, after owner confirmation on 2026-10-11, W41. Do not carry into later weeks without confirmation. Raw H10, prior weeks, monthly allocation and other BUs remain preserved.
