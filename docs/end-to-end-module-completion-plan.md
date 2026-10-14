# End-to-end tax module completion plan

**Plan date:** October 14, 2026  
**Scope:** Close every remaining item in the Master Plan through complete input, processing, review and output vertical slices.  
**Release boundary:** A module may produce a controlled `DRAFT — NOT FOR FILING` form when its technical work is complete. Official paper filing and IRS e-file remain separate approval tracks described in `filing-readiness.md`.

## Non-negotiable definition of done

No tax module may be marked complete until all applicable columns below pass. A capture-only field is not a completed feature, and a calculated value that is absent from the form package or workbook is not a completed feature.

1. **Authority and scope** — year-specific official source, revision, checksum, constants, elections, limitations and explicit unsupported boundaries are recorded.
2. **Intake and expected documents** — applicability interview, document suggestions, evidence links and contradiction checks use the shared support evaluator.
3. **Manual input** — every supported scalar, election, repeated row, owner, carryover and evidence reference is editable through an accessible preparer screen.
4. **Canonical JSON** — schema, blank template, example, import preview, commit, correction, rollback and complete/source-only export preserve the same facts and stable IDs.
5. **Persistence** — current state, immutable revision history, optimistic concurrency, provenance, authorization, invalidation and audit events are implemented.
6. **Calculation** — deterministic decimal calculations, filing-status and owner rules, limitations, carryovers, cross-form dependencies and named trace nodes are implemented.
7. **Diagnostics** — missing facts, contradictions and unsupported cases block review/output; no enabled input may be silently ignored.
8. **Form output** — every required federal/state form, schedule, worksheet and supporting statement appears in deterministic package order with complete identifying fields and a required/rendered/missing manifest.
9. **Excel workpaper** — dedicated source, calculation, limitation, carryover, reconciliation, diagnostic and trace rows tie to the calculation snapshot and rendered forms.
10. **Round-trip and tie-out tests** — manual-only, JSON-only, mixed edit, correction, boundary, blocked-case, calculation, PDF and XLSX tests pass against independent expected results.
11. **Operational controls** — stale revisions invalidate calculations and artifacts; recovery, retention, accessibility, performance and security checks cover the new data.
12. **Approval evidence** — qualified tax review and output inspection are recorded before the module can move from research draft to an approved release package.

## Wave 0 — Coverage ledger and enforcement

- Create a machine-readable 2025 coverage ledger with one row for every supported input fact, derived value, form line, worksheet line and carryover.
- Track `manual`, `json`, `persistence`, `calculation`, `trace`, `pdf`, `xlsx`, `unit`, `database`, `browser`, `tax_review` and `output_review` status separately.
- Add CI checks that fail when an enabled fact lacks a calculation consumer or explicit blocker, when a calculated result lacks PDF/XLSX destinations, or when a required form is missing from the package.
- Inventory every current blocker and document-only form. Assign each to implementation, a named later release, or an explicit unsupported boundary. Nothing may disappear silently.
- Add a comprehensive synthetic return plus focused one-module returns. The comprehensive return proves coexistence; focused returns prove boundaries and calculations.

**Exit gate:** The ledger is complete for the current codebase, CI enforces it, and every current input/result is either fully routed or explicitly blocked.

## Wave 1 — High-income additional taxes

### 1A. Additional Medicare Tax — Form 8959

- Capture W-2 Medicare wages/tips and withholding, self-employment Medicare earnings, unreported tips and railroad-compensation applicability.
- Calculate owner/status thresholds, wage and self-employment interaction, 0.9-percent tax and additional Medicare withholding credit.
- Integrate Form 8959 with Schedule 2, Form 1040 tax/payment lines, PDF package, Excel reconciliation and intake support.
- Block RRTA, tip and employer-reporting cases until their required facts are complete.

### 1B. Net Investment Income Tax — Form 8960

- Capture investment-expense allocations, excluded income, passive/nonpassive classifications, annuity/trust/K-1 inputs and disposition adjustments.
- Calculate modified AGI threshold, net investment income, properly allocable deductions and 3.8-percent tax.
- Integrate Form 8960 with Schedule 2, Form 1040, Schedule D/E sources, PDF and Excel.

**Exit gate:** Known threshold cases no longer produce generic blockers; Forms 8959/8960 and all downstream totals tie out.

## Wave 2 — IRA and retirement vertical slices

### 2A. Nondeductible IRA — Form 8606

- Add owner-specific traditional/SEP/SIMPLE IRA basis ledgers, contributions, conversions, distributions, year-end value and outstanding rollover facts.
- Implement pro-rata taxation, Roth conversions, basis carryforward and spouse-separate Forms 8606.
- Reconcile Forms 1099-R and 5498 to Form 8606, Form 1040 and workbook basis schedules.

### 2B. Complex retirement distributions

- Support rollover, QCD, Roth, inherited, disability, early-distribution and annuity/simplified-method treatments.
- Implement applicable Form 5329 exceptions and additional taxes with code/election validation.
- Preserve one calculation and output instance per owner/distribution when the official form requires it.

### 2C. Self-employed retirement plans

- Implement SIMPLE and qualified-plan contribution calculations, elective deferral interactions, catch-ups, compensation limits and owner-specific activity links.
- Feed Schedule 1, plan workpapers and carryforward/diagnostic output.

**Exit gate:** Every enabled 1099-R/5498/retirement-plan fact reaches Form 1040, Form 8606/Form 5329/Schedule 1 as applicable and the basis/contribution workbook.

## Wave 3 — Capital transactions and carryovers

- Add short- and long-term capital-loss carryover ledgers with source-year provenance.
- Support Form 8949 adjustment codes, wash sales, accrued market discount, basis corrections, collectibles, Section 1202 and unrecaptured Section 1250 inputs.
- Implement Schedule D worksheets and preferential-tax interactions, including carryforward creation for the next year.
- Render transaction statements when official Form 8949 capacity is exceeded and include a complete Excel transaction/carryover reconciliation.

**Exit gate:** Imported and manually edited transactions reproduce Form 8949, Schedule D, tax worksheet, Form 1040 and next-year carryovers without unsupported silent adjustments.

## Wave 4 — QBI and business/farm/rental completion

### 4A. Complex QBI — Form 8995-A

- Add trades/business grouping, specified-service classification, W-2 wages, qualified property UBIA, patron reductions, REIT/PTP components and loss carryovers.
- Implement threshold/phase-in rules, aggregation elections and Schedules A–D of Form 8995-A.

### 4B. Schedule C, Forms 4562 and 8829

- Implement business-loss handling, standard/actual vehicle methods, listed-property evidence, home-office simplified/actual methods and carryovers.
- Add asset ledgers for basis, business use, placed-in-service date, method, convention, recovery period, Section 179, special depreciation and disposition.
- Generate calculated Form 4562 and Form 8829 where required; remove dependence on preparer-entered depreciation totals for supported assets.

### 4C. Schedule E Parts II–IV and loss limitations

- Add typed K-1 inputs for partnerships, S corporations, estates/trusts and REMICs.
- Implement rental categories, vacation/self-rental handling, basis, at-risk and passive activity ledgers and carryovers.
- Generate the applicable Schedule E pages and Forms 6198/8582 plus supporting statements and workbook ledgers.

### 4D. Schedule F accrual and farm losses

- Implement accrual income/inventory processing, farm loss limits, carryovers and asset/depreciation integration.
- Generate all required Schedule F, Form 4562 and limitation statements/workpapers.

**Exit gate:** No supported business/rental/farm field is merely stored; every field affects a calculation, a trace/output destination, or a named blocker.

## Wave 5 — Premium Tax Credit exception completion

- Implement below-poverty eligibility exceptions, qualifying MFS domestic-abuse/abandonment relief, alternative marriage-year calculation and shared-policy allocations.
- Add household-member MAGI and coverage-family reconciliation across all policies/months.
- Produce complete Form 8962 lines, Schedule 2/3 and Form 1040 integration plus a month-by-month Excel reconciliation.

**Exit gate:** Current Form 8962 exception blockers are replaced by reviewed workflows and independently checked fixtures.

## Wave 6 — State and local returns

- First obtain an explicit jurisdiction list and release order; “all states and localities” cannot be treated as one module.
- Build a jurisdiction/version registry, federal-to-state mapping layer, resident/part-year/nonresident allocation model, state additions/subtractions, credits, payments, carryovers and diagnostics.
- Deliver each jurisdiction as its own full vertical slice under the same definition of done, including official form packages and state workbooks.
- Begin with one approved pilot jurisdiction, validate the framework, then add jurisdictions individually.

**Exit gate per jurisdiction:** Manual/JSON input, calculation, all required state/local forms, PDF, Excel, tests and independent state-tax approval are complete.

## Wave 7 — Output and workbook closure

- Maintain one required-form graph shared by calculation, PDF, Excel, review and export.
- Give every implemented module a dedicated workbook section with source-to-line, limitation, carryover, override, diagnostic and trace reconciliation.
- Add automated cross-artifact assertions: Form 1040 totals, schedules, supporting forms, PDF manifest and XLSX cached totals must match the same immutable calculation result.
- Add overflow statements, continuation pages, negative/zero/blank rules, page identity validation and deterministic print ordering.
- Prevent output generation when any required form or workpaper section is missing.

**Exit gate:** A calculated return cannot reach review if PDF or workbook coverage is incomplete or inconsistent.

## Wave 8 — Official paper and e-file tracks

### Official paper package

- Archive and checksum the exact official IRS/state PDF revisions.
- Create and independently inspect coordinate maps for every supported field, checkbox, repeated row and continuation statement.
- Validate print scaling, overflow, identifiers, barcodes disabled/enabled status and package order.
- Introduce `official_paper` only after qualified tax, product, output and security approvals are recorded.

### IRS/state e-file

- Complete provider enrollment, identifiers, schemas/business rules, signature authorizations and IRS/state assurance testing.
- Implement immutable submissions, duplicate protection, acknowledgments, rejects, retransmission and operational reconciliation.
- Keep e-file unavailable until the relevant authority approves the exact software/version.

**Exit gate:** External approvals and test evidence exist. Source code alone cannot satisfy this gate.

## Wave 9 — CCH and Drake synchronization

- Obtain vendor agreements, approved API/file specifications, sandbox credentials, rate/retention rules and written production authorization.
- Implement outbound and inbound field maps against the coverage ledger, idempotency, conflict handling, immutable sync history and reconciliation reports.
- Prove sandbox round trips for every advertised module and keep unsupported vendor fields visible and blocking.
- Enable production synchronization separately per vendor only after vendor and security approval.

## Wave 10 — Deployment and release closure

This wave closes the seven non-feature action items that remain open in the Master Plan. It does not convert external approvals into engineering checkmarks.

### 10A. Approved Supabase environment

- Apply and verify migrations `0024_return_profiles.sql` through `0031_form_template_registry.sql` against approved project `tlhjzjtflljldvzgrnek` through an authorized network path.
- Record migration names/checksums, schema counts, invalid-index and unvalidated-constraint checks, seed policy, backup/rollback evidence and the exact deployed application revision.
- Re-run live-database integration tests against the migrated project without exposing credentials or production taxpayer data.

### 10B. Production authentication and infrastructure

- Configure approved Supabase Auth URLs and trusted Hostinger ingress; provision synthetic pilot subjects and link only explicitly approved identities.
- Independently verify production cookies, MFA enrollment/challenge, recovery, revocation, firm selection, assignments and server-side authorization.
- Capture production monitoring, managed backup/RPO/RTO, retention expiry, object-storage, malware-scanner, key-management, domain/TLS and worker-supervision evidence.

### 10C. Rule package, accessibility and acceptance

- Complete the independently reviewed 2025 dependency graph and golden fixtures, with every mismatch resolved or explicitly rejected.
- Perform manual screen-reader, keyboard-only, zoom/reflow and representative-preparer sessions; close material findings and obtain independent signatures.
- Execute AC-01 through AC-20 against the release candidate and require all seven Section 124 gates to reference immutable passing evidence.

### 10D. Accountable approvals

- Record product-scope, qualified tax-rule, security-owner, infrastructure-owner and production-data authorization decisions from different authorized reviewers where separation is required.
- Reconcile the federal-credit package and every later module to the approved rule-package revision; an earlier approval cannot silently authorize changed rules.
- Keep deployment, official-paper output, e-file and vendor synchronization disabled until their distinct gates are satisfied.

**Exit gate:** The approved Supabase and Hostinger release candidate passes all technical acceptance checks and every required human/external decision is recorded. Any absent external approval remains visibly blocked rather than being reported as complete.

## Required regression scenarios for every wave

- Manual entry only.
- Canonical JSON import only.
- Import followed by manual correction and recalculation.
- Corrected/void/duplicate source records.
- Minimum, threshold-minus-one, exact-threshold and threshold-plus-one cases.
- Joint and separate owner interactions where applicable.
- Missing evidence and contradictory intake answers.
- Explicit unsupported case that blocks without losing source data.
- PDF required/rendered/missing-form verification.
- XLSX source-to-line and calculation-to-form tie-out.
- Stale revision, re-import, rollback and artifact regeneration.
- Clean-database migration, recovery and full browser workflow.

## Completion reporting

For each implementation checkpoint, update the Master Plan and coverage ledger in the same commit. Report separately:

- technically implemented and tested;
- independently tax-reviewed;
- official-output approved;
- production-authorized;
- external/vendor/IRS blocked.

These statuses must never be collapsed into a single “done” label.
