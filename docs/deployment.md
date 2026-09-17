# Deployment configuration

No cloud database is provisioned in this change. Current Vercel production is not updated by local development.

## Required authentication environment

- DIAM_ADMIN_EMAIL: initial administrator address.
- DIAM_ADMIN_PASSWORD: strong initial administrator password; stored as a salted hash when the store is initialized. Changing this variable does not replace an existing persisted user's password.
- DIAM_SESSION_SECRET: at least 32 characters of cryptographically random secret data; rotate to revoke all signed sessions.

Local-only `npm run setup:local` generates unique values. Never commit `.env.local`, `.local/`, or copy local credentials into documentation. Set production secrets separately in the hosting provider.

## Database interface

Set DATABASE_URL to a PostgreSQL connection string with the provider's required TLS settings. The adapter creates `diam_dashboard_state(id integer primary key, payload jsonb not null)` and uses a transaction/advisory lock for atomic updates. The database user needs access to this table (and CREATE on first initialization). Credentials must remain server-side. Use the provider's CA/certificate configuration; do not disable certificate verification.

AWS RDS PostgreSQL and Alibaba Cloud PostgreSQL can use this adapter without frontend changes. Add provider-specific networking and certificate configuration when the database is selected. Backups, retention, least-privilege credentials and normalized tables should be configured as part of that deployment.

Without DATABASE_URL, local Node persists to DIAM_DATA_PATH (default `.local/dashboard-store.json`). Vercel intentionally rejects persistent mutations and serves only the authenticated configured baseline. No successful publication is reported without durable storage.

## Release verification

1. `npm ci`
2. `npm run extract:source` when workbook baseline changes.
3. `npm test` and `npm run typecheck`.
4. `npm run build`.
5. Configure separate production secrets/database, deploy, and check login plus unauthorized API rejection.
6. In the deployment test environment, verify analyze → review → publish, reload/new session persistence, role restrictions and export reconciliation before using live submissions.

The local API smoke script (`node scripts/api-smoke.mjs`) only targets localhost and uses local environment credentials without printing them.
