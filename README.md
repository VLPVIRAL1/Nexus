# Nexus Tax

Nexus Tax is a professional, draft-only U.S. individual tax preparation and review workstation. The current implementation includes a PostgreSQL-backed work queue, guarded client/year/person APIs, secure-intake foundations, canonical import/output services, an unapproved deterministic 2025 calculation research package and governed release-closure evidence workspaces. It does not file, transmit, or claim production readiness.

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

Run the durable output worker in a second terminal:

```bash
npm run worker:artifacts
```

Open `http://localhost:3000`. Development uses the seeded synthetic firm and assigned preparer when no session cookie exists. Production has no identity fallback and requires an MFA-verified session.

## Commands

```bash
npm run dev        # development server
npm run worker:artifacts # durable PDF/XLSX/JSON generation worker
npm run typecheck  # strict TypeScript checks
npm test           # unit tests
npm run build      # production build
npm run db:migrate # apply pending PostgreSQL migrations transactionally
npm run test:integration # verify live PostgreSQL constraints and seed state
npm run recovery:exercise # restore the local synthetic database and verify coherent hashes/history
npm run acceptance:technical # full technical release suite including browser, recovery and performance evidence
npm run readiness:production # fail-closed production configuration and ownership check
```

For production authentication, configure the Supabase and Nexus auth variables in `.env.example`, enable TOTP MFA and the recovery redirect in the selected Supabase project, then explicitly link each approved provider subject with `npm run auth:link -- --subject=<supabase-user-uuid> --user-email=<local-user-email>`. Never use a service-role key in the browser or repository.

The blank canonical template is at `examples/2025/blank-taxpayer-template.json`. Current PDF pages are controlled internal previews, never official filing forms. The 2025 tax package remains `research_unapproved` until qualified independent review; production provider activation, storage infrastructure, recovery evidence and acceptance gates remain open.

Administrators and assigned preparer/reviewer roles use **Administration → Release closure** to maintain release gates, independent tax fixtures, security/infrastructure controls, human acceptance sessions and source-to-output tie-outs. These records enforce separation and evidence identity; they do not grant missing external approvals.

## Safety boundary

Use synthetic data only. All outputs are drafts. No e-file, live CCH/Drake connection, or automated external AI upload exists in Phase 1.
