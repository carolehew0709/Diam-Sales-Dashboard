# Architecture

## Demo stack

Next.js App Router, React, TypeScript, CSS modules-free global styling, and lucide-react icons. The app is intentionally dependency-light so the demo is easy to review and later deploy.

## Layers

1. `app/`: routes and API handlers.
2. `components/`: dashboard shell, charts, tables, import/admin panels.
3. `lib/`: types, seed repository, aggregation, permission checks, and import validation.
4. `data/`: normalized demo seed JSON.

The repository adapter exposes dashboard reads, user/permission reads, and import lifecycle operations. Today it is an in-memory JSON-backed demo. The adapter boundary is the migration point for Postgres/Supabase later.

## Permission model

`User` has a role, region scope, and account permissions. Visibility requires a matching region or an explicit cross-region grant, plus `view` on the account. Editing requires `edit`. The UI hides unavailable actions, while API handlers repeat authorization checks.

## Import flow

Excel and manual entry both create an `ImportBatch` in `review` state. Normalization and validation produce findings and completeness. Only an authorized publish operation moves the batch into the active snapshot. The demo uses a client-side workbook-shape parser for `.xlsx` file names and a structured manual form; production should replace this with a server-side parser and durable object storage.

## Production path

Keep the page contracts stable while replacing the adapter with Postgres/Supabase, add real identity/SSO, server-side file parsing, audit events, row-level security, background jobs, and Vercel/domain configuration.
