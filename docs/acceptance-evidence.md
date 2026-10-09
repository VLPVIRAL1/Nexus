# Phase 1 acceptance evidence register

This register tracks Section 124 without converting implementation evidence into product, tax, security, or production approval. `Technical pass` means the cited automated or synthetic control passed. It is not a release decision. `Blocked` names evidence that must be supplied by an independent authorized owner.

| Scenario | Owner | Implementation and evidence | Status | Remaining release evidence |
|---|---|---|---|---|
| AC-01 Supported Single wage/interest return | Tax rule owner | `tax-engine-2025.test.ts`; persisted intake/calculation/output integration fixtures; controlled form pages | Blocked | Independently computed fixture, approved rule package, current completeness attestation and reviewer-signed Reviewed Draft run |
| AC-02 MFJ ownership | Tax rule owner | Owner-specific wage/withholding and Schedule SE/QBI unit fixture | Blocked | Independently checked MFJ source-to-line fixture and reviewer sign-off |
| AC-03 Five-form comprehensive import | Product owner | Exact five-family registry-key test plus persisted AC-03 import → lineage → calculation-bound source-only export round trip covering every scalar, checkbox, repeated row, raw field and unmapped field | Technical pass | None beyond release-suite rerun |
| AC-04 Unsupported source fact | Product owner | Unsupported intake, mapping and tax-engine blocker fixtures; partial-output manifests | Technical pass | Representative preparer confirms blocker language and affected-result disclosure |
| AC-05 Replay and changed re-import | Engineering owner | Unit exact replay/stale preview tests; live preview/commit/replay/attempt/rollback fixture | Technical pass | None beyond release-suite rerun |
| AC-06 Corrected, void and duplicate records | Engineering owner | Live evidence-backed immutable lineage and non-contributing-effective-record fixture | Technical pass | None beyond release-suite rerun |
| AC-07 Split allocation | Engineering owner | Unit rounding/over-allocation tests; live amount/percentage/residual/unsupported mapping fixture | Technical pass | None beyond release-suite rerun |
| AC-08 Supported service business | Tax rule owner | MFJ multi-owner Schedule C/SE/1/2/8995 engine fixture and renderer coverage | Blocked | Independent expected lines and approved rule package |
| AC-09 Preferential dividends and Schedule B | Tax rule owner | Qualified-dividend method, Schedule B threshold, dependency and worksheet-page tests | Blocked | Independent worksheet fixture and approved rule package |
| AC-10 Tax boundary fixtures | Tax rule owner | Exact 2,062-band table hash; method boundary, wage-base and QBI threshold tests | Blocked | Qualified independent boundary review and signed expected-result source |
| AC-11 Unknown completeness answers | Product owner | Live required-answer/document evidence/attestation/invalidation fixture | Technical pass | None beyond release-suite rerun |
| AC-12 Two-user edit and stale preview | Engineering owner | Optimistic conflict unit test; live stale person/import/review revision fixtures | Technical pass | None beyond release-suite rerun |
| AC-13 Changed reviewed value | Engineering owner | Live changed-after-review and consistent Changes Requested invalidation fixtures | Technical pass | None beyond release-suite rerun |
| AC-14 Role and firm isolation | Security owner | Authorization tests; live cross-firm/direct-object/export/job/admin checks; Supabase password/TOTP enrollment and challenge adapter; encrypted temporary flows; explicit subject provisioning; production proxy/cookie boundary | Blocked | Deploy/configure the approved Supabase project and ingress, provision pilot subjects, run independent security review |
| AC-15 Malicious or oversized input | Security owner | Unsafe-key, signature, size, active-PDF, formula-neutralization and fail-closed scanner tests | Blocked | Approved production scanner/key deployment and security review |
| AC-16 Job failure/retry and recovery | Infrastructure owner | Durable claim/retry/idempotency fixture; October 9 coherent local restore exercise | Blocked | Managed backup restore and accepted production RPO/RTO exercise |
| AC-17 Output tie-out | Engineering owner | PDF manifest/page tests; XLSX formula cached-result tests; five persisted artifact modes and SHA-256 download checks | Blocked | Execute `output-tie-out-protocol.md` using an independently approved calculation fixture |
| AC-18 Drake-inspired UI task | Design owner | 27 Playwright auth/WCAG/keyboard/visual checks and nine committed visual baselines | Blocked | Manual assistive-technology and representative-preparer protocol in `manual-acceptance-protocol.md` |
| AC-19 Rule/template update | Tax rule owner | Immutable version/hash manifests, revision staleness triggers and unapproved-package activation blocker | Blocked | Approved initial package, then witnessed prior-run reproduction/update exercise |
| AC-20 No false filing/integration claims | Product owner | Planned adapters advertise no capability; all controlled pages are draft-only and not official IRS forms | Technical pass | Product owner scope-gate sign-off |

## Release gates

| Gate | Accountable owner | Current status | Required record |
|---|---|---|---|
| Scope | Product owner | Pending | Signed supported profile, schema, intake registry and no-filing pilot scope |
| Data | Engineering owner | Technical controls implemented | Rerun `npm run acceptance:technical` on the release candidate and retain the evidence reference |
| Calculation | Qualified tax rule owner | Blocked | Named reviewer, credentials/authority, independent fixtures, reviewed source revisions and approved immutable package version |
| UI/review | Design/product owner | Blocked | Completed manual assistive-technology and representative-preparer protocol |
| Output | Tax rule and product owners | Blocked | Visual/consumer tie-out against the independently approved calculation fixture |
| Production data | Security and infrastructure owners | Blocked | IdP/MFA, scanner/key, monitoring, retention, backup/restore, incident ownership and authorization records |

Approval evidence must identify the reviewer, role, organization, date, exact commit, rule/template versions, evidence location, decision and limitations. Secrets, taxpayer data and source bytes must never be committed to this register.

Use `production-release-evidence-template.md` for the gate record, `manual-acceptance-protocol.md` for AC-18 and `output-tie-out-protocol.md` for AC-17. `npm run readiness:production` fails closed when required production configuration, ownership or evidence references are absent.
