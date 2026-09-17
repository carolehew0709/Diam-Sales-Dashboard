# DIAM APAC Sales Dashboard

## Purpose

This repository contains the APAC demo for DIAM's sales-performance dashboard. It is a source-backed prototype using the APAC entity workbooks and the Global Follow Up workbook in `Dashboard/`. The demo reproduces the main US dashboard information architecture while adding APAC-scoped RBAC and a reviewable import portal.

## Working rules

- Keep the dashboard focused on sales performance, planning, order book, Prospect (source P1), source readiness, and management checks.
- Keep interface copy in `locales/en.json` and `locales/zh-CN.json` using semantic keys and `useI18n().tr`. Translate display labels only; preserve API enum values and source evidence. See `docs/localization.md`.
- Preserve APAC (Total) -> China (DHK/DCP/DDC), Singapore (DSI), India (DDI), Japan (DDJ). Keep China totals and entity detail visible within the user's scope. Map DEHK to DHK and the approved PDA source to DCP; retain its source limitations.
- Annual Dashboard means approved annual budget. Coverage and Residual Gap use annual values; Remaining this month uses monthly uninvoiced amounts. Missing entity data stays blank.
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

Region options are APAC (Total), China, Singapore, India and Japan. APAC includes all six BUs. China includes DHK, DCP and DDC; Singapore includes DSI; India includes DDI; Japan includes DDJ. The BU filter and Gap by BU use these entity codes. China remains the default reporting region and its permitted totals/detail remain visible across selections. Changing Region resets BU and Entity selection. The account authorization boundary remains APAC; reporting-country selection does not grant additional account access. Empty source values remain blank.
