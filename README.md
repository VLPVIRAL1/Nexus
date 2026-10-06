# Nexus Tax

Nexus Tax is a professional, draft-only U.S. individual tax preparation and review workstation. The current implementation includes a PostgreSQL-backed work queue, guarded client/year/person APIs, secure-intake foundations, canonical import/output services, and an unapproved deterministic 2025 calculation research package. It does not file, transmit, or claim production readiness.

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

Open `http://localhost:3000`. Development uses the seeded synthetic firm and assigned preparer when no session cookie exists. Production has no identity fallback and requires an MFA-verified session.

## Commands

```bash
npm run dev        # development server
npm run typecheck  # strict TypeScript checks
npm test           # unit tests
npm run build      # production build
npm run db:migrate # apply pending PostgreSQL migrations transactionally
npm run test:integration # verify live PostgreSQL constraints and seed state
```

The blank canonical template is at `examples/2025/blank-taxpayer-template.json`. Current PDF/XLSX/JSON services and tax calculations are draft foundations. The 2025 tax package remains `research_unapproved` until qualified independent review; full form rendering, persisted imports, production identity/storage and acceptance gates remain open.

## Safety boundary

Use synthetic data only. All outputs are drafts. No e-file, live CCH/Drake connection, or automated external AI upload exists in Phase 1.
