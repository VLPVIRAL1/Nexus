# Phase 1 traceability matrix

| Requirement | Current module | Evidence | Status |
|---|---|---|---|
| Dense Drake-inspired shell | `src/components/app-shell.tsx`, `workspace.tsx` | Build + visual review pending | Implemented foundation |
| Canonical 2025 root contract | `schemas/2025`, `canonical-schema.ts` | `canonical-schema.test.ts` | Initial contract |
| Firm-scoped client/year model | `prisma/schema.prisma` | Migration pending PostgreSQL | Initial model |
| W-2 entry pattern | `workspace.tsx` | Visual/keyboard tests pending | Synthetic UI slice |
| Tax calculation | — | Approved rules/fixtures absent | Disabled |
| Reviewed Draft approval | — | Completeness/security gates absent | Disabled |
| PDF/XLSX output foundation | `src/services/outputs` | PDF/XLSX/JSON service tests | Foundation implemented; full forms pending |
| Filing/vendor sync | `src/integrations` | Planned-adapter test | Correctly unavailable |
