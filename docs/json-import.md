# JSON import

Imports follow authorize → validate → stage → preview → commit. The server checks firm and assignment scope before locking the tax year. It limits byte size, nesting and record count; rejects unsafe object keys; validates UTF-8 and the canonical schema; and stores exact raw bytes, parsed data, a base revision and stable-ID child paths in PostgreSQL.

Absent fields do not change effective values. Null proposes a reviewed clear. Empty arrays do not delete records. Each change remains `use_imported`, `keep_existing` or `review_later`. Imported review/approval claims remain staged evidence and cannot create authoritative application records. Exact replays return the original batch while recording another attempt; a changed base revision records a stale rejection and forces a fresh preview.

Commit updates the canonical snapshot, tax-year revision, validation/calculation freshness, import result, attempt history and chained audit event in one transaction. The same transaction materializes W-2 and all four supported 1099 families into internal source-record IDs. Imported IDs remain external identity only; changed records create a new version and supersede the prior effective row. Corrected/void flags and an explicit external supersession reference preserve lineage without overwriting history.

A compensating rollback restores the pre-import snapshot only when no later revision depends on the import, deactivates records introduced by that batch, restores eligible superseded rows, creates another tax-year revision and retains the original batch. Production use still requires encrypted storage and the production-data gate.

The initial JSON Schema and matching Zod contract live in `schemas/2025` and `src/lib/canonical-schema.ts`.
