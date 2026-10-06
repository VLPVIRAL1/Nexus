# JSON import

Imports will follow authorize → validate → stage → preview → commit. Absent fields do not change effective values. Null proposes a reviewed clear. Empty arrays do not delete records. Exact replays are idempotent, and a changed base revision forces a fresh preview. Commits, audit events, diagnostics, and invalidation markers are atomic.

The initial JSON Schema and matching Zod contract live in `schemas/2025` and `src/lib/canonical-schema.ts`.
