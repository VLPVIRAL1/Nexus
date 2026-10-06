# Phase 1 traceability matrix

| Requirement | Current module | Evidence | Status |
|---|---|---|---|
| Dense Drake-inspired shell | `src/components/app-shell.tsx`, `workspace.tsx` | Build + visual review pending | Implemented foundation |
| Canonical 2025 root contract | `schemas/2025`, `canonical-schema.ts` | `canonical-schema.test.ts` | Initial contract |
| Firm-scoped client/year/person and session workflows | `migrations/0001_foundation.sql`, `0002_identity_and_workflows.sql`, `src/server/session-service.ts`, `client-workflow-service.ts` | Live migration/seed, session/revocation, direct-object and stale-write integration tests | Server foundation implemented; production IdP/rate limiting pending |
| W-2 entry pattern | `workspace.tsx` | Visual/keyboard tests pending | Synthetic UI slice |
| 2025 tax calculation research package | `src/tax-engine/2025`, `src/tax-engine/dependency-graph.ts` | Exact IRS table/source-hash, method, dependency, blocker and end-to-end unit tests | Implemented as `research_unapproved`; Reviewed Draft activation disabled |
| Reviewed Draft approval | — | Completeness/security gates absent | Disabled |
| PDF/XLSX output foundation | `src/services/outputs` | PDF/XLSX/JSON service tests | Foundation implemented; full forms pending |
| Filing/vendor sync | `src/integrations` | Planned-adapter test | Correctly unavailable |
