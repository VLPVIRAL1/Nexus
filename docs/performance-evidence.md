# Synthetic performance evidence

This is repeatable local engineering evidence, not a production SLA. Run `npm run performance:exercise` with the local `nexus_tax` connection and `APP_ENV=development`. The exercise refuses production and non-loopback targets, creates an isolated `nexus_performance_*` database, applies all migrations, generates only synthetic data, records p95 latency, and drops the resolved database in a `finally` block.

## October 9, 2026 result

Environment: Node v24.19.0; PostgreSQL 16 local container over loopback; 5 available AMD EPYC 9V74 vCPUs; 33.3 GiB visible memory. Dataset: 10,000 clients, 25 concurrent database sessions, a 100-record federal calculation fixture, and a 1,000-record canonical import preview.

| Operation | Measured p95 | Target | Result |
|---|---:|---:|---|
| Typical 100-row client list at 25 concurrent sessions | 216.34 ms | ≤ 1,000 ms | Pass |
| Prefix client search at 25 concurrent sessions | 35.52 ms | ≤ 1,000 ms | Pass |
| Open-return header query at 25 concurrent sessions | 3.51 ms | ≤ 2,000 ms | Pass |
| Deterministic calculation with 100 source records | 2.05 ms | ≤ 2,000 ms | Pass |
| Canonical preview with 1,000 repeated form records | 17.28 ms | ≤ 10,000 ms | Pass |

The client list is bounded to 100 rows by default and 200 rows maximum. Interactive client search uses an assigned-client-scoped, rate-limited, private/no-store POST endpoint; it accepts a 2–100 character body query, returns at most 20 rows and does not place the term in the URL. This exercise measures server/database and deterministic processing latency only. It does not establish browser usable-content time, artifact generation under production object storage, wide-area network behavior, maximum-file stress, or production infrastructure capacity. Those remain pilot-infrastructure acceptance work.
