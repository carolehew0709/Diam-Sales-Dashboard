# Roadmap

## Implemented locally

- USA-style page structure with China-first APAC hierarchy and visible China/entity summaries.
- Real W-sheet extraction, approved PDA-to-DCP mapping, explicit missing-source handling.
- Annual/MTD metric separation, Prospect naming, year/type/entity filters, monthly and weekly matrix.
- Server-enforced scoped reads/imports/publishing/exports, password login and superadmin account controls.
- Review acknowledgement, idempotent versioned publishing, atomic local file storage and PostgreSQL adapter interface.
- Eight-sheet scoped export, automated calculation/permission/import regression tests, local API smoke checks.

## Awaiting source data

- Approved DHK/DDC annual budgets and Prospect.
- DCP entity-level splits/current-month invoicing replacing the confirmed mapped legacy aggregate when available.
- DSI/DDJ/DDI source workbooks; formal APAC brand source.
- Intercompany elimination rules if a consolidated revenue view is required.

## Deferred by owner

- AWS/Alibaba Cloud database provisioning and production connection configuration.
- Vercel release with production identity/storage secrets.
- SSO, centralized request-abuse protection, object storage, infrastructure backups/monitoring.
