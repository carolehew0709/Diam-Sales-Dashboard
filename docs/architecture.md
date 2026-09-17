# Architecture and contracts

## Layers

- `lib/workbook-parser.ts`: shared source parser used by offline extraction and authenticated Excel import.
- `lib/dashboard.ts`: scoped entity, China/BU and monthly/annual calculations shared by API and export.
- `lib/permissions.ts`: account/region rules, with no editor bypass.
- `lib/auth.ts`: signed expiring HttpOnly sessions, password verification, CSRF origin checks and consistent API errors.
- `lib/storage.ts`: StorageAdapter contract (`read`, atomic `transaction`), local file adapter, optional PostgreSQL adapter.
- `lib/repository.ts`: review/publish lifecycle, authorization, revision history and audit events.
- `app/api`: authenticated data/exports, imports and superadmin-only account management.
- Browser components: presentation and interaction. They fetch authorized data, never import the source JSON, user directory or password hashes.

## Permissions

Only superadmin manages users and permissions. Region admins publish only entities with View+Edit inside their own region. Editors may submit/review permitted imports, but never publish. Viewers/audit viewers may read/export permitted data. Cross-region visibility does not grant editing. Editing implies View. Disabled accounts and session versions revoke prior access; account writes are server-authorized.

Sessions last eight hours and use HMAC-SHA256 with a configured secret. Passwords use per-user salted scrypt hashes. Production cookies are Secure and HttpOnly; SameSite=Lax. Same-origin checks guard mutations. There is no default production password or email-to-superadmin fallback. Administrator bootstrap credentials must be explicitly configured. Production identity/SSO, centralized abuse controls and infrastructure monitoring remain deployment work.

## Persistence

The local adapter serializes transactions and atomically renames a temporary file. It is only supported in a single Node process, not multiple workers or network filesystems. PostgreSQL uses a database transaction, advisory lock and row-level lock to publish the complete state atomically. Initial state comes from the generated workbook baseline; subsequent persisted state takes precedence.

The JSON-document PostgreSQL adapter is a portable starting point for AWS RDS or Alibaba Cloud ApsaraDB PostgreSQL. It does not provision infrastructure. A normalized schema/object storage can replace it behind StorageAdapter later. Vercel with no DATABASE_URL is read-only; this is shown in the import portal.

## Import lifecycle

Authenticated analyze/manual submission → persisted review batch → explicit authorized publish. Review responses include every affected entity/week, source, source cells, validation findings and order lines. A review acknowledgement is required for nonfatal source limitations. Validation errors block publish. A batch outside the caller's edit/publish scope is rejected as a whole.

Manual input preserves separate YTD/MTD/estimate External and Group fields, 2026/2027 OB, annual budgets, Prospect and source notes. Each line requires twelve allocations per year reconciling to that year's total. Numeric values must be finite/nonnegative and weeks integer/range-valid. No lines means explicitly zero OB.

Publication replaces matching entity/year/week active snapshots and details; retries of a published batch are idempotent. Earlier batches retain their records as a reviewable revision history. Dashboard refreshes from the API after publication; exports read the same adapter. A new batch for an already-published grain creates a new revision rather than appending duplicate active lines.

## Export

Eight sheets: Executive Summary, Weekly Review, Data Weekly, Orderbook Detail, Entity Snapshots, Budget Recap, Chart Data and Management Checks. Filters and scope are applied server-side; no unauthorized entities are exported. Weekly Review includes source history for the actual selected entities. Missing amounts remain blank. Coverage uses typed ratios. Source split columns are retained in detailed source sheets for review.

## Frontend

The reference's stylesheet and section structure provide the dark topbar, typography stacks, warm canvas, six KPI cards, briefing strip, wide cumulative/narrow gap layout, monthly/invoicing panels, commercial detail, matrix, BU table and checks. APAC additions include hierarchical filters and the persistent China/entity strip. Original source URLs, credentials and session material are excluded from the repository. No fake brand sales or made-up region totals are presented.
