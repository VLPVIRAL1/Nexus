# Architecture

The application is a Next.js TypeScript system organized by tax domain. Browser components never own authoritative tax calculations. Services will authorize firm, assignment, client, and year scope server-side before reading or mutating data. PostgreSQL and Prisma provide transactional persistence; immutable revisions, calculation snapshots, artifacts, and audit events preserve reproducibility.

The first slice contains the workstation shell, synthetic client/year data, a versioned JSON contract, and initial firm-scoped Prisma models. Authentication, imports, source storage, deterministic calculations, outputs, and approval transitions remain gated future slices.
