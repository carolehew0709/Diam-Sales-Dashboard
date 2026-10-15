# Deployment configuration

The application supports Vercel and self-hosted Node.js deployments. Provisioning a database and deploying application code are separate steps; a local build does not update either live deployment.

## Required authentication environment

- DIAM_ADMIN_EMAIL: initial administrator address.
- DIAM_ADMIN_PASSWORD: strong initial administrator password; stored as a salted hash when the store is initialized. Changing this variable does not replace an existing persisted user's password.
- DIAM_SESSION_SECRET: at least 32 characters of cryptographically random secret data; rotate to revoke all signed sessions.

Local-only `npm run setup:local` generates unique values. Never commit `.env.local`, `.local/`, or copy local credentials into documentation. Set production secrets separately in the hosting provider.

## Database interface

Set DATABASE_URL to a PostgreSQL connection string with the provider's required TLS settings. The adapter creates `diam_dashboard_state(id integer primary key, payload jsonb not null)` and uses a transaction/advisory lock for atomic updates. The database user needs access to this table (and CREATE on first initialization). Credentials must remain server-side. Use the provider's CA/certificate configuration; do not disable certificate verification.

AWS RDS PostgreSQL and Alibaba Cloud PostgreSQL can use this adapter without frontend changes. Add provider-specific networking and certificate configuration when the database is selected. Backups, retention, least-privilege credentials and normalized tables should be configured as part of that deployment.

Without DATABASE_URL, local Node persists to DIAM_DATA_PATH (default `.local/dashboard-store.json`). Vercel intentionally rejects persistent mutations and serves only the authenticated configured baseline. No successful publication is reported without durable storage.

## AWS EC2 and private RDS

Run the complete Next.js application on EC2 in the same VPC as RDS. Keep RDS Public access disabled and allow PostgreSQL TCP 5432 from the application security group. EC2 requires its own inbound HTTPS and restricted administration rules. This architecture does not require Vercel static egress IPs.

Download the AWS RDS CA bundle over HTTPS to a persistent path outside the release archive, such as `/home/ubuntu/diam-dashboard/certs/global-bundle.pem`. Verify the endpoint, database and administrator credentials with `psql` using `sslmode=verify-full` and `sslrootcert` before configuring the application.

Create a separate `diam_app` login with CONNECT on `diam_dashboard` and USAGE/CREATE on its public schema. Set its password interactively with psql `\password diam_app`; do not put plaintext passwords in shell commands or SQL history. The application creates and owns its state table on first initialization.

The existing node-postgres connection-string parser supports certificate verification without changing the storage adapter. Configure server-only DATABASE_URL with URL-encoded username/password and query parameters `sslmode=verify-full&sslrootcert=/home/ubuntu/diam-dashboard/certs/global-bundle.pem`. Do not use `sslmode=no-verify`, disable verification, or mix URL SSL parameters with a separate Pool SSL object. The certificate file must exist before starting the application. Keep `.env.local` readable only by the service owner and configure administrator/India bootstrap credentials before the first persistent write.

Use an HTTPS reverse proxy in front of the Next.js server, bind Node to loopback, and run the service under a non-root account with automatic restart. Login uses secure cookies in production and must be tested over HTTPS. Verify database persistence and India-only API/export/import permissions before switching users to the AWS deployment. Initial network/psql success is not application or RBAC verification.

For the 2026-10-15 deployment preparation, upgrade Next.js to at least 15.5.27, sharp to at least 0.35.5 and source-map-js to at least 1.2.2, retain the lockfile, and run audit/tests/build before transferring the release archive. Existing server credentials and downloaded certificates must be preserved when extracting a new archive.

## Release verification

1. `npm ci`
2. `npm run extract:source` when workbook baseline changes.
3. `npm test` and `npm run typecheck`.
4. `npm run build`.
5. Configure separate production secrets/database, deploy, and check login plus unauthorized API rejection.
6. In the deployment test environment, verify analyze → review → publish, reload/new session persistence, role restrictions and export reconciliation before using live submissions.

The local API smoke script (`node scripts/api-smoke.mjs`) only targets localhost and uses local environment credentials without printing them.

## India account bootstrap

Optional Production variables `DIAM_INDIA_EMAIL` and `DIAM_INDIA_PASSWORD` (at least 12 characters, same configuration style as admin) create an India-only editor in an uninitialized store or read-only seed deployment. `DIAM_INDIA_PASSWORD_HASH` remains supported as an alternative when DIAM_INDIA_PASSWORD is absent. The hash must be salted scrypt in the existing 32-hex-salt:128-hex-hash format. Role, APAC boundary, no cross-region view, and DDI-only view/edit permissions are fixed in code. Never commit account credentials or hashes. Production values must be configured in the correct Vercel team and redeployed; Git push alone cannot set secrets. Existing database/file users are authoritative and must be managed through user administration. With no DATABASE_URL the account can log in, view and export, but uploads cannot be saved; do not bypass the durable-storage guard. Editors never publish or manage users.
