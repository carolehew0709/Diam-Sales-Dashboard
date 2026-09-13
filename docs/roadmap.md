# Roadmap

## Demo milestone (current)

- APAC Sales Performance overview, analysis, business units/entities, management checks, export, and Sales by Brand base page.
- Mock login with superadmin, two APAC admins, entity editors, viewer, and audit read-only personas.
- Account-level view/edit permission matrix and region-admin cross-region switch.
- Excel-derived snapshot from the supplied DDC, DEHK, and Global Follow Up workbooks; rerunnable extraction via `npm run extract:source`.
- Real `.xlsx` export with dashboard summary and monthly phasing sheets.
- Workbook-aware import review and manual entity-week entry, validation, and publish simulation.
- Project context, architecture, and contributor rules.

## Production milestone

- Replace JSON adapter with Postgres/Supabase schema and migrations.
- Persist import files, versions, publish events, corrections, and audit logs.
- Add real SSO/identity provider, secure sessions, MFA policy, and server-side authorization.
- Parse and validate real workbook contents server-side, including source reconciliation and duplicate detection.
- Add scheduled refresh, alerts, data-quality ownership, and historical snapshot retention.

## Deployment milestone

- Configure Vercel project and environment secrets.
- Connect the purchased company domain, HTTPS, DNS, and production monitoring.
- Set backup/recovery, access reviews, release environments, and operational runbooks.
