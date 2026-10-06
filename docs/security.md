# Security

The target is firm-scoped least privilege with MFA, authorization on every row/object/job/download, secure sessions, encrypted storage and backups, short-lived source access, input scanning, sensitive reveal auditing, redacted observability, and append-only tamper-evident audit history. Synthetic data is required until the production-data gate passes.

The source intake foundation validates size and content signatures, sanitizes names, hashes bytes, writes to quarantine, requires a clean scanner result, and only then promotes an object. Concrete encrypted object storage, malware scanner, page isolation and short-lived authenticated delivery providers still require infrastructure selection and production verification.
