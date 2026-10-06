# Architecture

The application is a Next.js TypeScript system organized by tax domain. Browser components never own authoritative tax calculations. Services will authorize firm, assignment, client, and year scope server-side before reading or mutating data. PostgreSQL and Prisma provide transactional persistence; immutable revisions, calculation snapshots, artifacts, and audit events preserve reproducibility.

The first slices contain the workstation shell, a versioned JSON contract, firm-scoped Prisma models, transactional SQL migrations, synthetic seed data, append-only audit enforcement, and a database-backed work-queue read path. Authentication, import persistence, source storage, deterministic calculations, full outputs, and approval transitions remain gated future slices.

Local PostgreSQL runs through `compose.yaml`. `scripts/migrate.ts` applies each SQL migration once inside its own transaction and records it in `_migrations`. Prisma remains the preferred application ORM, while the small server read repository uses parameterized `pg` queries until verified Prisma engines are available in the environment.
