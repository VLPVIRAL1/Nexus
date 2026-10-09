# Production release approval record template

Copy this template into the approved evidence system for each release candidate. The repository intentionally contains no signatures, credentials, taxpayer data or source bytes.

## Release identity

- Git commit:
- Deployment identifier and immutable image/artifact digest:
- Date/time and environment:
- Database migration set:
- Rule, form-registry and output-template versions:
- Technical release-suite evidence reference and hash:

## Approval decisions

Each row requires `approved`, `rejected` or `blocked`, plus the named owner, role/qualification, organization, date, evidence reference and limitations.

| Gate | Decision | Accountable owner | Evidence reference | Limitations |
|---|---|---|---|---|
| Scope |  | Product owner |  |  |
| Data |  | Engineering owner |  |  |
| Calculation |  | Qualified tax-rule owner |  |  |
| UI/review |  | Design/product owner |  |  |
| Output |  | Tax-rule and product owners |  |  |
| Production data |  | Security and infrastructure owners |  |  |

## Production-data controls

Record the Supabase project/environment, MFA policy evidence, trusted proxy configuration, scanner and managed-key identifiers, monitoring/alert destinations, incident owner, retention policy version, backup provider, observed restore RPO/RTO, recovery evidence, rollback decision and explicit authorization to process production taxpayer data. Reference secrets by managed-secret identifier only.

## Final decision

- Release decision:
- Decision owner:
- Date/time:
- Rollback authority and trigger:
- Known non-blocking limitations:

Any missing owner, blank decision, failed acceptance scenario, unapproved rule package, incomplete manual protocol or failed `npm run readiness:production` result blocks production data.
