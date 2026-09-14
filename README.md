# DIAM APAC Sales Dashboard

APAC sales performance dashboard demo for DIAM. The app reproduces the core US dashboard surfaces and adds APAC-ready RBAC plus a reviewable Excel/manual import portal.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The persona switcher and account menu demonstrate `superadmin`, `region_admin`, `editor`, `viewer`, and `audit_viewer` behavior. Demo data is derived from the workbooks in `Dashboard/` and is intentionally stored behind a JSON adapter.

See [AGENTS.md](AGENTS.md), [docs/project-context.md](docs/project-context.md), [docs/architecture.md](docs/architecture.md), and [docs/roadmap.md](docs/roadmap.md) before extending the project.
