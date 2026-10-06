# Nexus Tax

Nexus Tax is a professional, draft-only U.S. individual tax preparation and review workstation. The current implementation establishes the Phase 1 foundation and a synthetic W-2 vertical slice. It does not calculate, file, transmit, or claim production readiness.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- PostgreSQL 16 or newer for persisted workflows

## Quick start

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. The current UI uses synthetic in-memory data, so the workstation can be reviewed before a database is connected.

## Commands

```bash
npm run dev        # development server
npm run typecheck  # strict TypeScript checks
npm test           # unit tests
npm run build      # production build
npm run db:migrate # create/apply a PostgreSQL development migration
```

The blank canonical template is at `examples/2025/blank-taxpayer-template.json`. Tax calculation, PDF generation, XLSX workpapers, imports, and database seeding are planned capabilities and must not be represented as working until their acceptance evidence passes.

## Safety boundary

Use synthetic data only. All outputs are drafts. No e-file, live CCH/Drake connection, or automated external AI upload exists in Phase 1.
