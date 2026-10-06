# Security

The target is firm-scoped least privilege with MFA, authorization on every row/object/job/download, secure sessions, encrypted storage and backups, short-lived source access, input scanning, sensitive reveal auditing, redacted observability, and append-only tamper-evident audit history. Synthetic data is required until the production-data gate passes.

The server now accepts session creation only from a recent verified MFA assertion, stores only a SHA-256 token digest, binds the session to a user agent when supplied, enforces 30-minute inactivity and 12-hour absolute expiry, supports revocation, and resolves firm membership plus client assignments from PostgreSQL. Production rejects the development identity fallback. An identity provider, login/callback UI, rate limiting, account recovery and production cookie deployment remain release gates.

Client, tax-year and person mutations validate role and assigned-client scope on the server, reject cross-origin cookie mutations in production, use optimistic versions, invalidate stale calculation state and append privacy-minimized chained audit events. Direct-object and stale-write integration fixtures exercise these controls.

The source intake foundation validates size and content signatures, sanitizes names, hashes bytes, writes to quarantine, requires a clean scanner result, and only then promotes an object. Concrete encrypted object storage, malware scanner, page isolation and short-lived authenticated delivery providers still require infrastructure selection and production verification.
