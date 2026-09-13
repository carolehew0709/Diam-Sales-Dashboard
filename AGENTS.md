# DIAM APAC Sales Dashboard

## Purpose

This repository contains the APAC demo for DIAM's sales-performance dashboard. It is a source-backed prototype using the APAC entity workbooks and the Global Follow Up workbook in `Dashboard/`. The demo reproduces the main US dashboard information architecture while adding APAC-scoped RBAC and a reviewable import portal.

## Working rules

- Keep the dashboard focused on sales performance, planning, order book, P1 upside, source readiness, and management checks.
- Keep metric names and units explicit. The source workbooks use kEUR and entity/week reporting.
- Put business rules in `lib/` and keep pages/components focused on presentation and interaction.
- Add or update documentation when a data grain, permission rule, or import contract changes.
- Use the DIAM assets in `DIAM Logos/`; do not add credentials or copied US staging session data.
- Preserve the original source files. Demo seed data is a normalized, intentionally small derivative.

## Data handling

- The demo uses JSON seed data plus an adapter. It is not a production persistence layer.
- US staging URLs, usernames, passwords, cookies, and tokens are secrets and must never be committed to app code or docs.
- Import data follows analyze -> review -> publish. Never make an upload active without a publish action.
- Show source, week, entity, and validation status for imported records.

## Permission rules

- `superadmin` can manage users and permissions across the APAC boundary.
- `apac_admin` can manage APAC data and users only when explicitly granted admin scope.
- `editor` can submit and review imports for permitted accounts but cannot publish or manage users.
- `viewer` can view permitted dashboard data and export it, but cannot import, publish, or manage users.
- Visibility is the intersection of region scope and account-level `view`; editing additionally requires `edit`.
- The APAC region is the active boundary today. Region codes remain data-driven for future expansion.

## Demo limits

Mock login, JSON state, in-process mutations, and seeded brand data are demo mechanisms. Real SSO, audit logs, database transactions, object storage, Vercel deployment, domain setup, and permanent import storage belong to the roadmap.
