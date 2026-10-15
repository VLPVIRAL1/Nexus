# Comprehensive Federal Diagnostics and Commercial-Workflow Parity Plan

**Status:** Technical foundation implemented; authority research, full condition fixtures, licensed comparisons and independent approvals remain open
**Created:** October 15, 2026
**First release scope:** Tax year 2025 federal preparation and review diagnostics for every form and tax treatment the Nexus coverage ledger declares supported
**Preservation rule:** Do not delete, rename, suppress or weaken an existing diagnostic until its replacement has proven trigger, non-trigger, persistence, actionability and regression parity

## Implementation checkpoint — October 15, 2026

Completed in source and verified against a clean PostgreSQL database:

- deterministic generated inventory of 283 literal and intake-derived 2025 federal preparation codes, with owner, source location, stage, class, severity, disposition and immutable definition hash;
- append-only definition, authority, condition, manifest and occurrence-event persistence, including compatibility backfill for pre-registry issues;
- one lifecycle service for create, deterministic dedupe, resolve and reopen behavior; all application issue writers now use it;
- read-only administrator registry/API with evidence-gap and external-gate visibility;
- preparer-context severity/search filtering plus definition version, authority state and fingerprint disclosure;
- CI manifest-drift enforcement and unit/database regression coverage; and
- explicit disabled/pending gates for MeF, licensed Drake/ProConnect/CCH comparison and independent tax approval.

This checkpoint does not close the program. The 283 legacy definitions intentionally remain `authority_review_status=pending`, the generated legacy condition rows intentionally expose missing positive/negative fixtures, and the manifest remains `research_unapproved`. Phases 0, 1, 3–10 remain open until their human research, coverage and acceptance exit gates below are evidenced.

## 1. Outcome and honest completion standard

Build a year-versioned diagnostic system that detects every publicly authoritative IRS condition applicable to Nexus's declared federal support envelope, explains the issue in preparer language, identifies the affected facts and forms, opens the exact correction location when one exists, blocks unsafe calculation/output states, and preserves immutable evidence of when the condition appeared and was resolved.

Commercial products are comparison references, not a source to copy. Nexus will independently author its diagnostic codes, messages, rules and screen organization. A diagnostic observed in a properly licensed Drake Tax, ProConnect or CCH workflow becomes a research lead that must be traced to an IRS authority or explicitly classified as vendor workflow advice before it is implemented.

There is no single public IRS list containing every preparation diagnostic. IRS form instructions, publications, worksheets, regulations, revenue guidance, source-form instructions and—when Nexus is authorized to e-file—the applicable MeF schemas and business rules collectively define the authoritative corpus. Therefore, “all diagnostics” means complete, evidenced coverage for a declared tax year, jurisdiction, form set, filing channel and supported-fact envelope. It does not mean undocumented parity with every proprietary vendor message or every U.S. tax situation.

## 2. Current baseline

The repository currently contains at least 197 statically discoverable diagnostic codes plus dynamic intake-derived codes. Existing behavior includes:

- structural, completeness, source-consistency, mapping, tax-logic and calculation-support findings;
- fail-closed calculation blockers for many supported 2025 federal modules;
- persisted `validation_issues` with revision-created/resolved history;
- workbench blocker/warning counts and issue-to-topic navigation;
- diagnostic export to the review workbook and draft outputs;
- explicit unsupported-treatment blockers; and
- calculation and reviewed-draft gates when blocking/error findings remain open.

This is a substantial diagnostic baseline, but it is not yet a certified complete IRS or commercial-product parity library. The principal gaps are a central versioned definition registry, condition-to-authority coverage matrices, complete negative/boundary test evidence, governed suppression policy, authorized MeF business rules, licensed vendor-comparison evidence and annual maintenance/sign-off.

## 3. Scope tracks

| Track | Scope | Initial status |
|---|---|---|
| A — Federal preparation | Data entry, completeness, eligibility, calculation, reconciliation, due diligence, review and draft-output diagnostics for supported 2025 federal modules | Implement in this program |
| B — Federal e-file | IRS MeF schema, business-rule and reject-code diagnostics, acknowledgements and retransmission guidance | Architecture only until IRS/software-provider authorization and licensed rule artifacts exist |
| C — State/local | Jurisdiction-specific preparation and e-file diagnostics | Deferred with the state/local engine |
| D — Commercial parity | Independently observed workflow and usability comparison against licensed Drake, ProConnect and CCH environments | Implement as a controlled comparison lab; never copy proprietary text, codes or trade dress |

Track A must be complete before Nexus claims diagnostic completeness for its supported federal draft profile. Tracks B and C must remain visibly unavailable rather than being implied by Track A.

## 4. Diagnostic taxonomy

Every definition must have one primary class and may have supporting tags:

1. Schema and structural validity — required objects, types, enumerations, dates, identifiers and repeated-row shape.
2. Source-form validity — official boxes/codes, totals, ownership, corrections, voids, duplicates and tax-year compatibility.
3. Completeness — unanswered interviews, missing forms, missing evidence, missing taxpayer/spouse/dependent facts and unreviewed unknown states.
4. Eligibility — filing status, dependent, credit, deduction, election and form applicability.
5. Cross-field consistency — values that contradict another box, person, form, period, status or election.
6. Reconciliation — source-to-return, withholding, payments, marketplace, activity, basis, carryover and output tie-outs.
7. Calculation domain — limits, phaseouts, thresholds, mutually exclusive treatments, taxable/nontaxable classifications and required worksheets.
8. Cross-form dependency — a fact or result requiring another form, schedule, interview or reviewed calculation.
9. Due diligence and substantiation — Form 8867, preparer knowledge, required records, evidence and signature state.
10. Unsupported or research-pending — applicable facts that the current rule package cannot safely calculate.
11. Review/workflow — stale calculation, changed-after-review, unresolved review point, unauthorized override and incomplete approval.
12. Output/package — missing required pages, stale artifacts, identity mismatch, package-order, workbook tie-out and draft-only restrictions.
13. E-file schema/business rule — separate gated class for MeF validation and IRS acknowledgements.
14. Advisory/planning — non-blocking preparer guidance clearly distinguished from return correctness.

Severity is independent of class: `blocking`, `error`, `warning`, `information` or `planning`. A diagnostic's severity may vary only through an explicit year/version rule, never through ad hoc UI logic.

## 5. Versioned definition and evidence model

Create a central `diagnostic_definitions` registry and immutable version history with at least:

- stable Nexus code and definition version;
- tax year, jurisdiction, return type, filing channel and effective dates;
- class, severity, evaluation stage and support state;
- affected form/schedule, line/box, canonical paths and topic route;
- predicate identifier and required fact dependencies;
- preparer-facing message, resolution steps and unsupported-case explanation;
- authoritative source IDs, page/section/paragraph, source hash and research date;
- whether the rule is preparer judgment, mathematical, schema, workflow or filing-channel specific;
- suppression/override policy and required reason/evidence;
- positive, negative, boundary and interaction fixture IDs;
- superseded-by history and annual-review status; and
- optional vendor-observation references stored as non-sensitive evidence metadata, never copied proprietary content.

Persist diagnostic occurrences separately from definitions. Each occurrence records the definition/version, tax-year revision, affected record/path, normalized fingerprint, operands safe for audit, created/resolved revision, resolution reason, actor/system origin and calculation/output identities. Protected taxpayer values must not be copied into diagnostic codes, URLs, logs or definition text.

## 6. Evaluation architecture

Use one orchestration pipeline with deterministic stages:

```text
Canonical facts
  → schema/source validation
  → completeness and applicability
  → cross-field and reconciliation rules
  → pre-calculation support blockers
  → calculation and cross-form diagnostics
  → due-diligence/review diagnostics
  → output/package diagnostics
  → gated e-file diagnostics (future)
  → deduplicate, persist, route and summarize
```

Requirements:

- Pure evaluators receive immutable versioned facts and return deterministic findings.
- Each definition declares dependencies so only affected diagnostics are reevaluated after an edit.
- Identical facts and rule packages produce identical diagnostic fingerprints and ordering.
- Dedupe uses definition, record, field and material operands; it must not merge distinct dependents, activities or source records.
- Findings resolve only when the current evaluator no longer produces them or an allowed reviewed disposition is recorded.
- Blocking tax-law or unsupported findings cannot be dismissed by the context panel.
- Suppression is limited to explicitly suppressible advisory/workflow findings and requires actor, reason, evidence and expiry.
- Unknown remains different from `no`; absent facts never silently rule out an applicable form.
- Imported and manually entered facts pass through the same diagnostic pipeline.
- Diagnostics run at save, import preview/commit, calculation, review transition and output generation as applicable.

## 7. Condition-to-diagnostic coverage ledger

Add a generated ledger for every supported form/module. Each row represents one authoritative condition, not merely one implemented code:

| Field | Purpose |
|---|---|
| Condition ID | Stable tax-year-specific authority condition |
| Authority | IRS document/rule and hashed excerpt |
| Applicable facts | Inputs required to determine applies/does-not-apply |
| Supported state | calculated, blocked, deferred or not applicable |
| Diagnostic code | Finding emitted when condition is unsatisfied |
| Positive fixture | Proves the diagnostic fires |
| Negative fixture | Proves a valid return is not flagged |
| Boundary fixtures | Threshold/date/age/month/rounding edges |
| Interaction fixtures | Filing-status, spouse, dependent, activity and cross-form combinations |
| UI destination | Exact topic/section/field or explicit no-edit explanation |
| Output effect | calculate/review/PDF/XLSX/JSON/e-file gate |

CI fails when a supported authority condition lacks a definition, a definition lacks authority, a required fixture is absent, a code is orphaned, or a form's coverage percentage falls below its approved threshold.

## 8. Implementation phases

### Phase 0 — Governance, legal boundaries and source acquisition

- Appoint tax-content owner, diagnostic engineering owner, reviewer and release approver.
- Define licensed access rules for commercial comparison environments and prohibit copying vendor text/codes.
- Inventory authoritative 2025 IRS sources for every supported form and hash/archive allowed artifacts.
- Decide which MeF artifacts Nexus is authorized to possess/use; keep Track B disabled otherwise.
- Define severity, suppression, unsupported-treatment and breaking-change policies.

**Exit gate:** Signed source/licensing matrix and named accountable owners exist; no proprietary artifact is imported into source control without authorization.

### Phase 1 — Freeze and classify the current baseline

- Enumerate literal and dynamic codes from services, tax modules, database writers, output validation and workflow gates.
- Record trigger logic, message, severity, category, paths, persistence lifecycle, test evidence and authority for each current code.
- Identify duplicates, inconsistent severities, generic codes, dead rules and findings with no actionable destination.
- Create regression returns proving existing trigger/non-trigger behavior before refactoring.

**Exit gate:** Every current diagnostic has an owner and disposition: retain, version, split, merge, supersede or remove after parity.

### Phase 2 — Registry, authority and occurrence persistence

- Add definition/version/authority/coverage tables and migrations without rewriting existing occurrences.
- Seed the current code set as legacy versioned definitions.
- Add definition APIs and read-only administration views with role/MFA controls.
- Link occurrences to definition versions while preserving existing review/output queries.
- Add immutable change history and authority-hash verification.

**Exit gate:** Existing UI and calculations produce identical findings, while every new occurrence identifies an immutable definition version.

### Phase 3 — Deterministic evaluation and lifecycle engine

- Introduce staged evaluator contracts, dependency indexing, normalized fingerprints and stable ordering.
- Consolidate direct database issue inserts behind the diagnostic service.
- Implement reevaluation, resolution, reopen-on-change, dedupe, stale-state and allowed-suppression rules.
- Add bounded execution, telemetry without tax values and failure-safe behavior when an evaluator fails.

**Exit gate:** Save/import/calculate/review/output paths use one lifecycle model; no navigation or read action mutates findings.

### Phase 4 — Foundational return and source diagnostics

Complete the authority ledger and diagnostic sets for:

- taxpayer/spouse identity, residency, death, age, blindness and claimable-dependent facts;
- all five filing statuses and qualifying-person requirements;
- dependents, CTC/ODC/ACTC classifications and identifier rules;
- W-2, 1095-A, 1098-E, 1098-T, 5498, 5498-SA, 1099-NEC/MISC/INT/DIV/B/G/K/R/SA, SSA-1099 and RRB-1099;
- correction, void, duplicate, ownership, tax-year and source-linkage rules;
- intake completeness, expected documents and evidence; and
- JSON schema/import decisions, unknown fields, lineage and source-to-record reconciliation.

**Exit gate:** Every registered box/code and every foundational interview condition has positive, negative and malformed/boundary fixtures.

### Phase 5 — Income, deduction, credit and additional-tax diagnostics

Complete module matrices and interaction tests for:

- Forms 1040 and Schedules 1, 2, 3, A, B, D and SE;
- Schedules C, E and F, including Forms 4562, 4797, 6198, 8582 and 8829 dependencies;
- Forms 2441, 5329, 6251, 8606, 8615, 8812, 8863, 8889, 8949, 8959, 8960, 8962, 8995 and 8995-A;
- Schedule EIC and Form 8867;
- payments, withholding, carryovers, basis, loss limitations, passive/at-risk limits and source reconciliation; and
- every explicit supported/unsupported boundary in the 2025 coverage ledger.

For each module, test all filing statuses, taxpayer/spouse ownership, dependent interactions, zero/negative/maximum amounts, threshold values on both sides, month/date boundaries, rounding order, carry-in/carry-out and required-form manifestation.

**Exit gate:** The generated ledger reports 100% condition coverage for the approved 2025 federal support envelope and zero unexplained golden-return diagnostic differences.

### Phase 6 — Cross-module, due-diligence, review and output diagnostics

- Add cross-form dependency and contradiction rules that cannot live in a single module.
- Verify Form 8867 section applicability, evidence, notes and immutable signature state.
- Cover changed-after-review, stale calculation, stale output, override governance and separation-of-duties rules.
- Validate required/rendered/missing forms, page identity, draft labels, print order, workbook tie-outs, JSON exclusions and artifact hashes.
- Add explicit “diagnostic system incomplete/unavailable” blockers if required evaluators or rule definitions fail to load.

**Exit gate:** No supported return reaches Reviewed Draft or current artifact generation with an unresolved blocking/error finding or an incomplete required evaluator set.

### Phase 7 — Preparer diagnostic experience

- Add filters for severity, form, person, activity, source, assigned reviewer, new/changed/stale and resolved state.
- Provide next/previous navigation, exact field focus, related-source preview and calculation trace.
- Group root causes without hiding child records; show counts and affected forms.
- Show authority/year and technical operands on demand while keeping the primary message concise.
- Add bulk review only for eligible non-blocking findings; never bulk-dismiss correctness blockers.
- Add diagnostic search/reference and “why did this appear/disappear?” history.
- Ensure keyboard, screen-reader, 200% zoom and non-color severity behavior.

**Exit gate:** Every finding is actionable or explicitly explains why no input can resolve it; representative preparers complete correction workflows without developer assistance.

### Phase 8 — IRS MeF diagnostic track (authorization-gated)

- After authorization, ingest only the applicable year/version of IRS schemas and business rules under their permitted terms.
- Keep preparation codes distinct from schema/business-rule/reject codes.
- Validate XML construction, attachments, binary constraints, elections, signatures and transmission metadata.
- Map IRS acknowledgements/rejects to preparer actions without changing or obscuring the original IRS code/text where display is permitted.
- Test retransmission, duplicate submission, accepted-with-alert, rejected and unavailable-service states in the authorized ATS/sandbox.

**Exit gate:** IRS/provider authorization, ATS evidence and independent filing review are recorded. Until then, e-file validation and readiness remain disabled.

### Phase 9 — Licensed commercial-workflow comparison

- Define representative return suites spanning simple, family, investment, retirement, business, rental, farm, credit, additional-tax and blocked cases.
- Have qualified preparers run identical synthetic facts in current licensed Drake, ProConnect and CCH products.
- Record only permitted observations: condition, severity class, timing, affected form/topic and whether preparer action is useful.
- Trace each gap to public authority or classify it as vendor-specific advisory/workflow behavior.
- Add independently worded Nexus diagnostics where the condition is authoritative or materially improves safe preparation.
- Document justified differences; numeric count parity is not the goal.

**Exit gate:** Every observed material vendor finding is matched, intentionally excluded with rationale, or blocked pending authority; legal/product reviewers approve the comparison record.

### Phase 10 — Verification, independent tax review and annual operation

- Run unit, property, mutation, integration, golden-return, browser, accessibility, performance and security tests.
- Use an independent qualified tax professional to review authorities, predicates, severity and resolution guidance.
- Measure false positives and false negatives with blind synthetic returns.
- Sign the rule package and diagnostic manifest together; neither can be approved independently when their versions differ.
- Establish annual source monitoring, draft/final form change handling, correction/revocation workflow and prior-year freeze policy.
- Publish internal release notes listing added, changed, retired and severity-changed diagnostics.

**Exit gate:** Technical, tax-content, accessibility and product approvals are recorded for the exact hashes. Diagnostic completeness claims name the tax year, forms, jurisdiction and filing channel.

## 9. Verification requirements

Every diagnostic definition requires:

- one fixture where it must fire;
- one materially similar fixture where it must not fire;
- boundary fixtures for every threshold/date/age/month/percentage/rounding condition;
- interaction fixtures for applicable filing statuses, persons, dependents and activities;
- a persistence test proving create, dedupe, resolve and reopen behavior;
- a UI test proving severity, message, destination and keyboard focus;
- an output/review gate test when blocking/error severity applies; and
- an authority review with exact source/version/hash.

Program-level tests must include property-based malformed input, pairwise condition generation, mutation testing of predicates, identical manual/JSON behavior, deterministic fingerprints, large-return performance, concurrent-edit conflict behavior and redaction/no-sensitive-URL checks.

## 10. Acceptance measures

- 100% of approved supported-form authority conditions appear in the condition ledger.
- 100% of active definitions have authority, owner, version, trigger/non-trigger tests and a UI destination or explicit no-edit explanation.
- 100% of declared unsupported conditions fail closed with retained facts and clear preparer action.
- 0 unresolved critical/major false negatives in the independent blind-return suite.
- 0 unexplained differences between manual and imported facts or between identical immutable calculation inputs.
- 0 blockers dismissible without satisfying the domain rule or an explicitly permitted governed disposition.
- 0 proprietary vendor text/codes/assets copied into Nexus without written authorization.
- Performance remains within the established return-open/save/calculate budgets.
- Automated WCAG 2.2 A/AA passes and independent keyboard/screen-reader acceptance is recorded.
- The rule-package and diagnostic-manifest hashes receive independent tax-content approval before any supported-draft completeness claim.

## 11. Rollout and rollback

- Gate the new evaluator by firm/user feature flag and retain the existing diagnostic path during parity comparison.
- Dual-run old and new evaluators in read-only shadow mode; store only normalized differences without protected values.
- Block rollout for missing definitions, unexplained severity changes, false-negative regressions or performance-budget failures.
- Promote form/module slices only after their coverage ledger closes.
- Retain a rapid fallback that changes evaluation orchestration, not taxpayer data.
- Never delete historical definitions or occurrences; mark versions superseded.

## 12. Definition of done

This program is complete for a named release only when:

1. The supported tax year, federal forms, fact envelope and filing channel are explicitly published.
2. Every applicable public-authority condition in that envelope is represented in the coverage ledger.
3. Every definition and occurrence is versioned, evidenced, deterministic and tested.
4. Manual, JSON, calculation, review and output workflows produce consistent findings.
5. Every issue is actionable, fail-closed where necessary and accessible.
6. Licensed commercial comparisons have no unexplained material gaps.
7. Independent tax-content and preparer acceptance is recorded for the exact manifest hash.
8. Any MeF completeness claim has separate IRS/provider authorization and ATS evidence.

Until all eight conditions pass, Nexus may say that it has an expanding, fail-closed diagnostic library for its supported research profile. It must not say that it contains every IRS, Drake, ProConnect or CCH diagnostic.
