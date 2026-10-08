# DIAM APAC Sales Performance

China-first sales dashboard with the USA reference layout and APAC-specific hierarchy.

## Local development

```sh
npm ci
npm run setup:local
npm run dev
```

Open http://localhost:3000. Setup creates a unique administrator password and session secret in gitignored `.env.local`; login details are in `.local/local-access.txt`. There is no persona switcher or unauthenticated data API.

```sh
npm run extract:source
npm test
npm run typecheck
npm run build
```

The original workbooks are read-only. `Dashboard/source-manifest.json` selects the active versions; previous workbooks remain archived in place. Extraction writes the reviewable `data/apac-dashboard.json` baseline. Once a persistent store has been initialized, use the import workflow to publish replacements; regenerating the baseline does not overwrite previously persisted imports.

## Business structure

APAC (Total) aggregates China (DEHK, DCP, DDC), Singapore (DSI), India (DDI) and Japan (DDJ). China is the default Region and its aggregate/entity strip remains visible. Entities without source data remain blank.

Mappings: DEHK → internal entity ID `dhk` (legacy alias DHK); DDC → DDC; Diam Pack Luxe China → DCP. The active baseline uses DEHK/DDC W40 and DCP W40 entity workbooks. The previously approved Global Follow Up PDA → DCP mapping remains supported for legacy imports, but that aggregate workbook is no longer active.

Annual Dashboard means approved annual budget. FY2026 budgets are fixed at DEHK 24,830, DDC 5,769 and DCP 2,608 kEUR (China total 33,207), overriding weekly workbook/manual values. FY2027 budget version: DEHK 29,014 and DDC 6,017 kEUR; other entity budgets display pending 0 placeholders, which do not count as approved budgets. WK40 DEHK FY2027 OB is owner-confirmed at 2,597 kEUR with no complete monthly allocation. Sales & Dashboard = YTD invoiced sales + annual committed orderbook. Sales + Prospect adds expected orders. Coverage = annual Sales + OB / comparable approved annual budget. Residual Gap = annual Sales + OB minus approved annual budget: positive above budget, negative below budget. Both exclude Prospect regardless of scenario. Remaining this month = full-month estimate minus MTD invoicing, bounded at zero.

## Storage and deployment

Local development persists accounts, review batches, published records and audit events in `.local/dashboard-store.json` with serialized atomic writes. This is a single-process development adapter.

`lib/storage.ts` defines the storage interface and includes a transactional PostgreSQL adapter selected by `DATABASE_URL`, suitable for an appropriately configured AWS or Alibaba Cloud PostgreSQL service. Provisioning is intentionally deferred. Vercel without a database can serve the authenticated workbook baseline but cannot submit/publish imports or save accounts. No silent fallback to ephemeral write storage.

See [architecture](docs/architecture.md), [source contract](docs/project-context.md), and [deployment](docs/deployment.md).

## Reporting Region and BU mapping

Region options are APAC (Total), China, Singapore, India and Japan. APAC includes all six BUs. China includes DEHK, DCP and DDC; Singapore includes DSI; India includes DDI; Japan includes DDJ. The BU filter and Gap by BU use these entity codes. China remains the default reporting region and its permitted totals/detail remain visible across selections. Changing Region resets BU and Entity selection. The account authorization boundary remains APAC; reporting-country selection does not grant additional account access. Empty source values remain blank.

DDC FY2026 uses the owner-approved External-row reporting rule: H10 for Sales to date, O10 for its China strip card and annual Sales + OB, K17 for OB. Raw Group source data is preserved but excluded from DDC FY2026 reports; other BUs retain their existing rules.

DCP FY2026 direct entity reporting uses H10 for Sales to date/top card, L10 for OB, and H10+L10 for annual Sales + OB. Raw Group values remain preserved and are excluded from reporting copies.
