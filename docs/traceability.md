# Phase 1 traceability matrix

| Requirement | Current module | Evidence | Status |
|---|---|---|---|
| Dense Drake-inspired shell | `src/components/app-shell.tsx`, `workspace.tsx` | Build + visual review pending | Implemented foundation |
| Canonical 2025 root contract | `schemas/2025`, `canonical-schema.ts` | `canonical-schema.test.ts` | Initial contract |
| Safe canonical import and source lineage | `src/services/import-service.ts`, `src/server/import-persistence-service.ts`, `migrations/0003_import_history.sql`, `0004_source_form_lineage.sql` | Stable-ID/limits/replay/stale unit fixtures and live preview/commit/materialization/replay/rollback integration fixture | Server workflow implemented; full review UI and duplicate-resolution UX pending |
| Intake and document completeness | `src/domain/intake.ts`, `src/server/intake-service.ts`, `migrations/0005_intake_completeness.sql`, persisted intake route | Live answer/document/attestation/invalidation integration fixture | Core evidence workflow implemented; registry expansion and source-upload links pending |
| Firm-scoped client/year/person and session workflows | `migrations/0001_foundation.sql`, `0002_identity_and_workflows.sql`, `src/server/session-service.ts`, `client-workflow-service.ts` | Live migration/seed, session/revocation, direct-object and stale-write integration tests | Server foundation implemented; production IdP/rate limiting pending |
| W-2 entry pattern | `workspace.tsx` | Visual/keyboard tests pending | Synthetic UI slice |
| 2025 tax calculation research package | `src/tax-engine/2025`, `src/tax-engine/dependency-graph.ts` | Exact IRS table/source-hash, method, dependency, blocker and end-to-end unit tests | Implemented as `research_unapproved`; Reviewed Draft activation disabled |
| Reviewed Draft approval | — | Completeness/security gates absent | Disabled |
| Draft PDF package and reviewer XLSX | `src/services/outputs/form-data-2025.ts`, `tax-form-renderer.ts`, `return-package-service.ts`, `workpaper-service.ts`, `src/server/output-persistence-service.ts` | Unit PDF page/manifest and workbook-sheet tests; live persistence, hash, replay, authorization, download and stale-artifact integration test; manual two-page visual inspection | Controlled internal supported-form previews and expanded reviewer workpaper implemented; official-template adapter, asynchronous jobs and final visual/consumer evidence pending |
| Filing/vendor sync | `src/integrations` | Planned-adapter test | Correctly unavailable |
