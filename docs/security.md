# Security

The target is firm-scoped least privilege with MFA, authorization on every row/object/job/download, secure sessions, encrypted storage and backups, short-lived source access, input scanning, sensitive reveal auditing, redacted observability, and append-only tamper-evident audit history. Synthetic data is required until the production-data gate passes.

The server accepts session creation only from a recent verified MFA assertion, stores only a SHA-256 token digest, binds the session to a user agent when supplied, enforces 30-minute inactivity and 12-hour absolute expiry, supports revocation, and resolves firm membership plus client assignments from PostgreSQL. Production rejects the development identity fallback.

Administrators can manage client scope through a server-authorized assignment matrix. The service verifies firm membership, prevents misleading assignment kinds that conflict with the member’s firm role, applies changes immediately to newly resolved request contexts and writes each change to the append-only hash-chained audit log.

PostgreSQL-backed fixed-window limits protect source upload, import preview/commit/rollback, calculation execution, artifact enqueue/retry, assignment mutation and client search. Limits are scoped by firm, user and operation; excess requests return HTTP 429 with `Retry-After`. Assigned-client search uses a bounded same-origin POST body and private/no-store response so terms do not enter URLs or browser history.

Provider-ready pre-session limits separately bound login and account-recovery attempts by both trusted network bucket and normalized principal. PostgreSQL stores only HMAC-SHA-256 identifiers, never raw network addresses or login names; production fails closed unless `AUTH_RATE_LIMIT_SECRET` contains at least 32 characters. A future identity-provider adapter must invoke this guard before credential exchange or recovery dispatch and must derive the network bucket from a trusted proxy boundary, not an untrusted forwarded header. The production identity provider, login/callback UI, account recovery and production cookie deployment remain release gates.

Retention disposal is administrator-only and separately throttled. It requires an approved delete policy, preview, unchanged policy version, authorization reference and typed confirmation. Hold placement, release and disposal serialize on the same firm lock; execution rechecks active holds and retains immutable hashed item/run evidence. The application does not delete append-only audit history or claim control of provider-managed backup expiry.

Client, tax-year and person mutations validate role and assigned-client scope on the server, reject cross-origin cookie mutations in production, use optimistic versions, invalidate stale calculation state and append privacy-minimized chained audit events. Direct-object and stale-write integration fixtures exercise these controls.

The source intake foundation validates size and content signatures, sanitizes names, hashes bytes, writes to quarantine, requires a clean scanner result, and only then promotes an object. Concrete encrypted object storage, malware scanner, page isolation and short-lived authenticated delivery providers still require infrastructure selection and production verification.
