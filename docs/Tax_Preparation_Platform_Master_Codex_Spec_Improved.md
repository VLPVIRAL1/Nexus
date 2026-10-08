# Tax Preparation Platform — Master Product, Architecture, UX & Codex Build Specification

## Living implementation status

**Tracking policy:** This checklist is updated in the same commit as the implementation it describes. An item is marked complete only after its required code and proportionate verification pass. A checked item does not imply that its containing milestone or the Phase 1 release is complete. The binding requirements below remain unchanged.

**Last updated:** October 8, 2026
**Overall Phase 1 status:** In progress — foundation, domain controls, persistence, secure-intake guards and an unapproved calculation research package are implemented; not production-ready, filing-ready, or tax-engine certified.

### Completed and verified

- [x] Initialize strict Next.js, React, TypeScript, Tailwind, Vitest, Prisma and PostgreSQL project foundation.
- [x] Add GitHub Actions CI with PostgreSQL service, migration/seed, strict type checks, unit and database integration tests, production build, dependency audit and production-server route smoke tests.
- [x] Implement the shared Drake-inspired design tokens, professional application shell and responsive compact/comfortable density behavior.
- [x] Implement the synthetic dashboard and client work queue with masked identifiers, preparation status, open points and blockers.
- [x] Implement the synthetic W-2 workstation pattern with repeatable records, box-aligned entry, Box 12/14 tables, provenance, source preview state and visible diagnostics.
- [x] Establish the initial versioned canonical JSON Schema, matching Zod validation and blank 2025 template.
- [x] Implement decimal-safe amount utilities and cent-preserving percentage residual allocation.
- [x] Implement allocation reconciliation with full, partial, excluded and over-allocation outcomes.
- [x] Implement required-intake question registry and blocking unknown/unsupported-answer diagnostics.
- [x] Persist evidence-backed intake answer revisions, expected-document dispositions and immutable completeness attestations; add optimistic revision checks, generated blockers, stale calculation/review invalidation, audit events, guarded APIs and a database-backed intake screen.
- [x] Connect expected-document intake evidence to clean same-return source uploads: expose eligible files without source bytes, require received items to have a link or evidence note, reject unsafe/cross-return links, support optimistic editing of existing dispositions, and cover the persisted UI and linked attestation path in browser/database tests.
- [x] Add a versioned 2025 expected-document registry with the five supported source families, common supporting evidence, fact-driven suggestions that do not silently declare files required, explicit custom items, compatible-source validation and stable multi-document keys. Complete the attestation UI with preparer-entered review evidence and a required explanation for legitimately unavailable items.
- [x] Implement guarded Ready for Review / Reviewed Draft decisions, stale-revision checks and review invalidation after relevant edits.
- [x] Implement optimistic-concurrency conflict results containing base, current and proposed values.
- [x] Implement firm/client authorization checks, TIN masking, structured-log redaction and spreadsheet-formula neutralization utilities.
- [x] Implement staged import preview, explicit per-change decisions, stale-preview rejection and exact-replay idempotency service foundations.
- [x] Persist authorized JSON import previews, raw bytes, stable-ID paths, decisions, every replay attempt, pre/post snapshots and commits; materialize all five form families with internal IDs, effective revisions and supersession lineage; add atomic tax-year invalidation, chained audit events and guarded compensating rollback. Empty arrays do not delete records and imported review claims cannot grant authority.
- [x] Add year-specific capture/support registries for W-2, 1099-NEC, 1099-MISC, 1099-INT and 1099-DIV, including repeatable/open-ended fields, 2025 NEC Box 3 treatment status, INT Box 14 tax-exempt-bond CUSIP, DIV Box 6 investment expenses and correctly typed MISC Box 11 fish-purchased-for-resale capture.
- [x] Implement draft PDF cover/package manifest, XLSX source/review/mapping workpaper foundation and complete/source-only/blank JSON export services with hashes and injection-safe strings.
- [x] Implement vendor-neutral tax-software adapter contracts and CCH/Drake planned adapters that advertise no unverified capability.
- [x] Add repeatable PostgreSQL 16 development provisioning, transactional SQL migration tracking, synthetic seed data, append-only audit enforcement, database integration tests and a database-backed work-queue read path with production fallback protection.
- [x] Add server-side development/request identity resolution, MFA-assertion-backed hashed sessions with idle/absolute expiry and revocation, firm membership and client-assignment scoping, same-origin guarded client/year/person APIs, optimistic person versions, tax-year invalidation and chained audit events. Add persisted client creation, client profile, tax-year creation and real client/year workspace routes; add an administrator-only compatible-role assignment matrix/API with chained audit events; and persist per-firm/user/operation fixed-window limits with HTTP 429/`Retry-After` enforcement on source uploads, imports, calculations, artifacts and assignments. Production identity-provider login/callback and account recovery remain open.
- [x] Add provider-ready PostgreSQL authentication-attempt throttling before a session exists: separate login and recovery policies, combined trusted-network and normalized-principal quotas, HMAC-SHA-256-only identifiers, generic retry responses, bounded cleanup and a production-required 32-character secret. The future identity-provider adapter must call the guard before credential exchange or recovery dispatch.
- [x] Implement source-file intake guards for 25 MiB limits, filename sanitization, MIME/signature verification, SHA-256 hashing, quarantine-first storage, scanner approval and explicit promotion through storage/scanner interfaces.
- [x] Archive and hash the official 2025 IRS research sources; generate the exact 2,062-band tax table; implement deterministic supported-profile Schedule B/C/SE, Schedules 1/2, simplified Form 8995, qualified-dividend worksheet and Form 1040 calculation outputs with owner-level wage interaction, dependency traces, cycle detection and explicit unsupported-treatment blockers. The package remains gated as `research_unapproved` pending independent tax review.
- [x] Add project documentation, decision register, traceability matrix, environment setup and development-server instructions.
- [x] Pass strict type checking, production build, current automated tests, route smoke checks and dependency audit for the implemented scope.
- [x] Persist firm-scoped activities and versioned source allocations with server-derived effective amounts, optimistic revisions, immutable supersession history, cent-perfect amount/percentage reconciliation, disclosed residual recipients, Schedule C receipt-basis safeguards, reviewer-only exclusions, unsupported-destination blockers, import-driven invalidation, chained audit events, guarded APIs and a database-backed mapping center.
- [x] Persist assigned human review points separately from machine diagnostics; enforce tax-year revisions, record versions, same-client references, reviewer-only resolution and assigned-reviewer change requests; surface conservative changed-after-review state and redacted append-only hash-chained audit history in a database-backed review screen.
- [x] Add a registered calculation-trace override workflow that derives engine values from a current immutable calculation run, requires reason and evidence, forbids requester self-approval, records independent approve/reject/revert history, exposes downstream impact, versions every decision and forces a blocking new revision/recalculation instead of directly rewriting output lines or clearing unsupported-treatment blockers.
- [x] Assemble effective persisted source records, owner-specific withholding, accepted Schedule C mappings, additional receipts, expenses, current intake/attestation facts and approved registered overrides into hashed immutable 2025 calculation inputs; persist idempotent run snapshots, result hashes, version manifests, engine diagnostics and audit events; render a database-backed current/stale calculation summary while keeping unapproved rules and unresolved dependencies explicitly partial.
- [x] Persist calculation-run-bound draft PDF, XLSX and canonical/source-only/blank JSON artifact bytes with content hashes, version manifests, creator identity and deterministic idempotency keys; verify hashes on authorized download, separately gate complete sensitive JSON, mark historical artifacts stale on any tax-year revision, and expose generation/history/download APIs plus a database-backed outputs screen. Official IRS-template rendering remains open.
- [x] Persist authorized PDF/JPEG/PNG source uploads through size/signature/name validation, quarantine-first AES-256-GCM storage, scan-before-promotion, immutable checksum and scanner metadata, duplicate warnings, tax-year invalidation and chained audit events; provide a database-backed source screen and authenticated hash-verifying no-store/sandboxed download proxy. Add a fail-closed production HTTPS malware-scanner adapter with strict response validation, bounded responses, a 30-second timeout and credential requirements. Production enablement still requires an approved scanner deployment and managed encryption key in the runtime environment.
- [x] Add immutable source-form lineage decisions for corrected, void and duplicate-excluded records with required reasons, optimistic tax-year/record versions, preserved raw and unmapped fields, allocation deactivation, calculation/output invalidation, prototype-safe corrected JSON, chained audit events and a database-backed lineage screen. Require each correction to reconcile to a different clean, form-compatible source document or a persisted manual evidence attestation; retain the evidence choice in immutable lineage and tax-value-free audit metadata.
- [x] Replace the synthetic import wizard for real client years with a database-backed canonical JSON staging screen that uploads to guarded preview APIs, renders every persisted diff, requires explicit use-imported/keep-existing/review-later decisions, blocks stale commits, displays exact attempt and batch history, and exposes compensating rollback only when no later revision depends on the import.
- [x] Connect the pinned 2025 W-2, 1099-NEC, 1099-MISC, 1099-INT and 1099-DIV registries to a database-backed source-entry screen for issuer/employer, recipient/employee, address, account, indicator, ownership, every registered box, checkbox group and repeatable code/open-label/state/local row; label supported/conditional/future treatment, validate typed registry paths server-side, mask protected identifiers without overwriting stored values, preserve unknown raw data, and save edits only as reasoned immutable corrections. Provide typed add/remove row editors for Box 12/14 and state/local rows, checkbox controls for Box 13 and explicit correction-document/manual-attestation reconciliation.
- [x] Add a year-specific tax-form rendering plan and controlled internal PDF renderer for Form 1040, supported Schedules 1/2/B/C/SE, simplified Form 8995 and the qualified-dividend computation worksheet; derive every displayed value from the immutable calculation result, merge pages behind the required/rendered/missing-form cover, and label and watermark every page as an internal `DRAFT — NOT FOR FILING` preview. Expand XLSX workpapers with income/withholding formula tie-outs, required-form completeness, unsupported treatments, governed overrides, calculation provenance and raw/unmapped source-field appendices tied to the same run.
- [x] Add durable PostgreSQL artifact jobs with idempotent enqueue, queued/running/succeeded/failed/stale states, lease-based `SKIP LOCKED` worker claims, access re-checks at execution, bounded automatic backoff, current-revision-only manual retry, revision-driven staleness, chained success/queue audit events, an auto-refreshing job UI and administrator-only tax-value-free queue metrics. Add runbooks for failed outputs/imports, broken templates, calculation defects, suspected exposure and coherent recovery; add a non-production-only isolated dump/restore exercise that verifies migrations, encrypted source blobs, imports, mappings, calculation/output hashes, artifact bytes, jobs, retention policies, legal holds and the audit chain before deleting its resolved temporary database. Production monitoring, managed backup configuration, browser/network performance evidence and infrastructure RPO/RTO exercises remain open.
- [x] Add Playwright coverage for keyboard skip navigation, visible focus and registry repeatable-row operation; run automated WCAG 2 A/AA checks on the dashboard, client list, return workspace and persisted source-entry screen; correct detected compact-text contrast failures; and commit Linux Chromium visual baselines for the dashboard, client list and return workspace. Manual assistive-technology review and representative-preparer acceptance remain open.
- [x] Expand automated WCAG 2 A/AA and Linux Chromium visual-regression coverage to representative intake-blocker, split-mapping, review-blocker, stale-calculation, import-staging and stale-output states. Manual assistive-technology review and representative-preparer acceptance remain open.
- [x] Add administrator-only, optimistic-versioned retention governance without assuming a universal period: configurable policies for source originals, imports, calculation snapshots, generated artifacts, audit history and backups; documented policy basis and end-of-period action; scoped legal holds and reasoned releases; same-origin/rate-limited APIs; tax-value-free chained audit events; a database-backed administration screen; and recovery verification. Firm policy approval and production backup expiry remain production dependencies.
- [x] Add an administrator-only, legal-hold-aware disposal executor for source-original bytes, import payloads, unreferenced calculation snapshots and generated-artifact bytes. Require a current delete policy, a non-expired exact-cutoff preview, unchanged policy version, authorization reference and typed confirmation; serialize hold placement/release with disposal; bound each run to 500 records; skip referenced calculations, current artifacts and active artifact jobs; retain metadata; and write immutable item outcomes, an evidence hash and a chained tax-value-free audit event. Audit-chain deletion remains forbidden and backup expiry remains provider-managed.
- [x] Add a fail-safe local synthetic performance exercise that creates and removes an isolated migrated database, loads 10,000 clients, drives 25 concurrent database sessions, and measures bounded client-list/search, open-return, 100-source-record calculation and 1,000-record import-preview p95 latency. Add client list/search bounds and supporting indexes. The October 7 local loopback run passed all stated server-side targets; production browser/network and maximum-file evidence remain open.
- [x] Connect the global client search to an assigned-client-scoped, rate-limited, private/no-store endpoint with a bounded POST body so search terms never enter the URL; add debouncing, stale-request cancellation, Ctrl/Cmd+K focus, Escape dismissal, accessible combobox results and browser coverage. Correct same-origin validation to compare the browser origin with the public HTTP host when the development server is bound to `0.0.0.0`, with focused allow/deny tests.

### In progress / not complete

- [ ] Complete authentication, MFA/session behavior, firm membership, assignments and server-enforced persistence.
- [x] Complete PostgreSQL migrations, seed data and persisted client/tax-year/person workflows. Verified all 21 migrations, repeatable synthetic seeding, firm-scoped creation and reads, assignment enforcement, optimistic person updates, revision invalidation and audit history through the live PostgreSQL integration suite on October 8, 2026.
- [x] Complete secure source upload, scanning/quarantine, encrypted object storage and authorized source viewing. Unit and live PostgreSQL integration evidence covers file limits and signatures, fail-closed production scanner configuration, quarantine/promotion, AES-256-GCM authenticated encryption, checksum verification, duplicate warnings, firm/assignment authorization and the no-store sandboxed viewing proxy.
- [x] Complete every year-defined field and screen for W-2, 1099-NEC, 1099-MISC, 1099-INT and 1099-DIV. Exact 2025 registry-key regression tests cover all numbered boxes plus repeatable state/local rows, typed checkbox/code/open-label editors, issuer/recipient metadata, unknown raw-field preservation and immutable evidence-backed correction screens.
- [x] Complete safe import UI/API, corrections, void/superseded lineage, duplicate resolution, rollback and history. Evidence covers bounded unsafe-key/schema validation, stable-ID diffs, explicit use-imported/keep-existing/review-later semantics, exact replay, stale-preview rejection, protected manual values, immutable materialization and evidence-backed lineage, non-contributing void/duplicate states, guarded compensating rollback and complete attempt history.
- [x] Complete activity mapping, receipts reconciliation, review points, overrides, audit history and dependency-based invalidation. Evidence covers cent-perfect amount/percentage splits and residual disclosure, unsupported-destination blockers, additional-receipt safeguards, immutable mapping revisions, assigned reviewer separation, changed-after-review state, independently approved/reverted registered overrides, append-only chained audits and consistent calculation/output/job/review invalidation after every relevant revision path.
- [ ] Complete approved, independently verified 2025 rule package and supported calculation dependency graph.
- [x] Complete Forms 1040, Schedules 1/2/B/C/SE, simplified Form 8995, qualified-dividend worksheet, traces and dependency manifests for the supported envelope. Engine and renderer tests verify required-form selection, all supported page families, owner-specific repeated schedules, named line/worksheet trace nodes, cycle-safe dependency order and explicit blocked manifests. Tax-rule activation remains separately gated by the independent approval item above.
- [ ] Complete draft PDF packages, XLSX workpapers and canonical/source-only JSON export with output-integrity checks.
- [ ] Complete job execution, retry/idempotency, observability, performance, recovery and retention controls.
- [ ] Complete remaining manual WCAG/assistive-technology review and representative-preparer acceptance evidence.
- [ ] Pass AC-01 through AC-20 and every Phase 1 release gate in Section 124.
- [ ] Obtain required product scope approval, qualified tax-rule review, security ownership, infrastructure decisions and production-data authorization.

---

**Document purpose:** Master product and implementation specification; this document does not itself authorize deployment, external uploads, integrations, or filing  
**Initial product:** U.S. Individual Income Tax Preparation Platform (Form 1040)  
**Initial tax-year target:** 2025, with year-versioned architecture  
**Initial source-document scope:** Form W-2, Form 1099-NEC, Form 1099-MISC, Form 1099-INT, Form 1099-DIV  
**Long-term vision:** Full tax preparation, calculation, return generation, workpapers, source reconciliation, and integrations with professional tax systems such as CCH Axcess Tax, Drake Tax, and other supported tax platforms.


**Revision:** 2.0 — October 6, 2026  
**Primary design reference:** Drake Tax desktop workflow and compact data presentation  
**Secondary design reference:** ProConnect navigation, input-to-return review, and diagnostics  
**Initial release mode:** Professional preparation and review pilot; all generated returns remain drafts  
**Scope decision:** Preserve the original five source-form families and year-versioned canonical architecture. Full vendor parity, state calculation, live integrations, and filing are future releases.

## How to use this revision

This revision retains the original numbered foundation and strengthens it with binding contracts in Sections 112–128. Requirements describe the application to build, not actions to execute merely because this file is opened. Illustrative amounts, sample JSON, screen codes, and filenames are examples, not tax authority or production schemas.

For Phase 1, the explicit capability matrix, readiness rules, and acceptance gates govern broad phrases such as “all applicable forms,” “complete capture,” and “basic calculation.” Unknown applicability is a blocking state, not evidence of non-applicability. No administrator can waive missing tax-engine support by closing a review note.

The release is deliberately a draft preparation pilot. “Reviewed Draft” means the supported case passed the documented controls; it does not mean filing-ready. Expanding to filing requires a separate product release and acceptance decision. This is a proposed scope resolution of the original document's conflicting draft and filing-ready language.

### Reader guide

| Topic | Sections |
|---|---|
| Product, architecture, delivery | 1–6, 92–107, 110–111 |
| Screens, entry, review, outputs | 7–12, 32, 41–65, 83–85, 108 |
| Source forms, mappings, calculations | 13–40, 80–82, 98–100 |
| Security and future integrations | 66–79, 91, 94–97 |
| Exact Phase 1 coverage and tax dependencies | 112–114 |
| Drake-inspired design and interaction contract | 115–116 |
| Import, provenance, concurrency, review | 117–120 |
| Security, operations, output integrity | 121–123 |
| Acceptance gates, decisions, change summary, references | 124–128 |


---

# 1. EXECUTIVE MANDATE

Build a professional-grade U.S. tax preparation platform.

The application must not be designed as a simple document organizer, spreadsheet replacement, or one-off Form 1040 calculator.

It must be designed as the foundation of a broader tax operating system with the following long-term workflow:

```text
Source Documents
      ↓
AI / ChatGPT Extraction
      ↓
Canonical Tax JSON
      ↓
Validation + Normalization
      ↓
Taxpayer / Tax-Year Database
      ↓
Source-to-Return Mapping
      ↓
Tax Calculation Engine
      ↓
1040 + Supporting Forms / Schedules
      ↓
Review + Reconciliation
      ↓
Reviewer-Ready Workpaper
      ↓
Future Vendor Integration Layer
      ↓
CCH Axcess / Drake / Other Tax Software
      ↓
Future E-file / Delivery / Status Workflow
```

The central design principle is:

> **Our application owns the canonical tax data model.**

Do not make CCH, Drake, an Excel workbook, an IRS PDF, or a vendor-specific screen number the primary database model.

All outside systems must eventually be connected through adapters.

---

# 2. PRODUCT VISION

The platform should ultimately allow a preparer to:

1. Create a client.
2. Create one or more tax years.
3. Download an official ChatGPT-ready JSON template.
4. Upload the JSON template and all source documents into ChatGPT.
5. Have ChatGPT extract all supported source documents into JSON.
6. Import the completed JSON into the application.
7. Preserve every source form and every supported box without loss.
8. Validate the extracted data.
9. Reconcile duplicate or conflicting documents.
10. Associate each amount with the correct taxpayer, spouse, dependent, business, rental, farm, investment activity, or other return destination.
11. Map source documents to specific return activities and schedules.
12. Calculate the federal tax return using deterministic tax code.
13. Generate Form 1040 and all applicable implemented supporting forms/schedules.
14. Generate a reviewer-ready workpaper with source indexing and open points.
15. Maintain a complete audit trail.
16. Export the current canonical tax data back to JSON.
17. In a later phase, send or synchronize applicable information with CCH Axcess Tax, Drake Tax, or another supported professional tax system.
18. Eventually compare:
    - source documents,
    - our calculated return,
    - workpaper,
    - and vendor-tax-software return,
   and identify differences before filing.

This is the long-term product direction. The initial release is intentionally smaller, but the architecture must support this vision.

---

# 3. NON-NEGOTIABLE ARCHITECTURE PRINCIPLES

## 3.1 Canonical tax model

Create an internal canonical tax schema.

Vendor systems are downstream integrations only.

Never store data only as:

```text
Drake Screen W2 field 1
CCH worksheet 5 field 12
```

Instead store:

```text
Canonical:
W2.box_1_wages = 86000

Then adapter maps:
Canonical → CCH
Canonical → Drake
Canonical → PDF
Canonical → Workpaper
```

## 3.2 Lossless source capture

The importer must be capable of preserving every source-document field even when the calculation engine does not yet use that field.

Example:

- W-2 Box 12 uncommon code
- W-2 Box 14 custom state item
- second local wage line
- uncommon 1099-MISC box
- unfamiliar broker/vendor label
- state withholding row
- FATCA indicator
- account number
- corrected/void indicator

The application must never silently discard a source value just because the current tax engine does not use it.

## 3.3 Deterministic tax calculations

ChatGPT may extract facts.

ChatGPT must not be the authoritative calculation engine.

Tax calculations must be deterministic, versioned, unit-tested functions.

## 3.4 Tax-year versioning

Forms, lines, codes, thresholds, deductions, and tax rules change.

Everything tax-related must be versioned by tax year.

## 3.5 Source provenance

Every material value must be traceable to:

- source file;
- source form;
- source record;
- page where available;
- box/line where available;
- extraction method;
- import batch;
- any subsequent manual override.

## 3.6 No silent omission

If a source record contains a tax-relevant field that has no implemented calculation treatment, the system must:

1. retain the field;
2. create a validation/review item;
3. identify the unsupported treatment;
4. prevent the tax return from being marked `Reviewed Draft` if applicability or tax effect is unresolved. Do not assume a small amount is immaterial.

## 3.7 Reviewability over automation

Automation must never remove reviewer visibility.

Every automatic mapping, calculation, duplicate decision, or generated form line must be explainable.

---

# 4. DELIVERY PHASES

## Phase 1 — Professional draft preparation and review pilot

Deliver client/year management; year-specific taxpayer, spouse and dependent profiles; all five source-form families; secure source uploads/viewing; canonical JSON templates, import and export; immutable provenance; safe re-import; correction and duplicate resolution; activity mapping and reconciliation; review points; audit history; deterministic supported federal calculation; traceable Form 1040 preview; required implemented supporting schedules; draft PDF and XLSX workpapers.

There are two explicitly labelled outcomes:

- **Supported draft:** every applicable treatment for the selected case is implemented, tested and rendered, and required factual questions are answered.
- **Partial draft:** data is retained and useful work can continue, but blockers and unknown totals are visible; review approval is disabled.

Section 112 is the binding capability matrix. Section 114 makes limited Schedule 1, Schedule 2, Schedule B and simplified QBI dependencies part of the relevant Phase 1 vertical slices. Broad Schedule C, Schedule SE or 1099 support cannot be claimed merely because boxes can be entered.

All PDFs remain `DRAFT — NOT FOR FILING`, including reviewed drafts. Phase 1 has no transmission, signature collection, acceptance claim, payment initiation, filing-ready status, or production vendor synchronization.

## Phase 2 — Broader individual-return coverage

Expand supported filing profiles and deduction/credit cases, comprehensive Schedules 1/2/3/A/B/C/D/E/F/SE, Form 8949, complex QBI, depreciation, basis, passive and loss limitations, estimated-payment and penalty calculations, retirement, education, healthcare, K-1s, additional information-return families and carryovers. Prioritize from actual pilot blockers.

## Phase 3 — State and local returns

Independent jurisdiction modules with residency, allocation, credits, reciprocity, dependencies, testing and output support. Retaining state boxes in Phase 1 does not constitute state-return support.

## Phase 4 — Professional software integrations

Vendor adapters for Drake Tax, CCH Axcess and others only after supported interfaces and permissions are verified. Canonical data remains vendor-independent.

## Phase 5 — Delivery and filing operations

Separate scope for signature/authorization, filing eligibility, transmission, acknowledgment/reject lifecycle, payment instructions, amendments, extensions, client delivery and legal/operational readiness. Filing status must ultimately be supported by verifiable evidence.

---

# 5. INITIAL TECH STACK

Preferred stack:

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form
- TanStack Table
- TanStack Query where useful

## Backend

- Next.js server architecture or a clearly separated TypeScript service layer
- REST or typed server actions
- background job abstraction for later heavy processing

## Database

- PostgreSQL

## ORM

- Prisma

## Validation

- Zod
- JSON Schema

## Spreadsheet generation

Use a reliable XLSX library capable of:

- formulas;
- tables;
- autofilters;
- number formats;
- freeze panes;
- data validation;
- hyperlinks;
- workbook metadata.

## PDF generation

Create a form-rendering abstraction capable of:

- filling official IRS fillable PDFs where technically suitable;
- or rendering coordinates onto year-specific IRS form templates;
- combining supporting forms into one return package;
- maintaining a mapping from canonical calculation fields to PDF fields/coordinates.

PDF rendering must not become the calculation engine.

---

# 6. USER ROLES

Build authorization to support:

- `Admin`
- `Preparer`
- `Reviewer`
- `ReadOnly`

Future:

- `Manager`
- `ClientPortalUser`
- `IntegrationService`

Permissions should be granular.

Examples:

| Action | Admin | Preparer | Reviewer | ReadOnly |
|---|---:|---:|---:|---:|
| View client | Yes | Yes | Yes | Yes |
| Import JSON | Yes | Yes | Yes | No |
| Modify source data | Yes | Yes | Yes | No |
| Add review points | Yes | Yes | Yes | No |
| Approve review point | Yes | Configurable | Yes | No |
| Reveal SSN | Configurable | Configurable | Configurable | No |
| Mark Reviewed Draft | Only with reviewer permission | No | Yes, subject to guards | No |
| Configure integrations | Yes | No | No | No |

---

# 7. APPLICATION NAVIGATION

Use a professional, information-dense desktop-first UI.

Main left navigation:

```text
Dashboard
Clients
Imports
Review Queue
Workpapers
Integrations
Administration
Settings
```

Do not make the application look like a consumer tax questionnaire.

The target UX is:

> professional tax-preparation software + modern workpaper/review system.

---

# 8. GLOBAL APPLICATION SHELL

## 8.1 Top bar

Show:

- firm/application name;
- global client search;
- tax-year selector when inside a client;
- notifications;
- current user;
- environment badge (`Development`, `Staging`, `Production`).

## 8.2 Left sidebar

Persistent navigation.

Collapsible but visible by default on desktop.

## 8.3 Main workspace

Use maximum practical horizontal space.

Data-entry pages should favor compact tables and side panels.

## 8.4 Global command palette

Required Phase 1 command and screen search:

```text
Open client
Open W-2
Add review point
Go to 1040
Run calculation
Generate workpaper
Export JSON
```

---

# 9. DASHBOARD SCREEN

Route:

```text
/dashboard
```

Show cards:

- Active Clients
- Returns In Preparation
- Open Points
- Ready for Review
- Changes Pending
- Reviewed Draft

Show work queue table:

| Client | Tax Year | Status | Preparer | Reviewer | Open Points | Blocking Errors | Last Updated |
|---|---:|---|---|---|---:|---:|---|

Filters:

- tax year;
- preparer;
- reviewer;
- status;
- return type;
- open-point category.

Clicking client opens client tax-year workspace.

---

# 10. CLIENT LIST SCREEN

Route:

```text
/clients
```

Columns:

- Client Code
- Taxpayer
- Spouse
- Return Type
- Current Year
- Current Status
- Preparer
- Reviewer
- Last Import
- Last Calculation
- Updated

Actions:

- New Client
- Import Client JSON
- Open
- Archive

Search should work by:

- client name;
- spouse;
- masked SSN;
- client code.

Never expose full SSN in the main list.

---

# 11. CLIENT PROFILE SCREEN

Route:

```text
/clients/{clientId}
```

Header:

```text
John Sample & Jane Sample
Client ID: 000123
```

Tabs:

```text
Years
Profile
Contacts
Assignments
Audit
Integrations
```

## Years tab

Show cards/rows:

| Year | Return | Status | Preparer | Reviewer | Open Points | Tax | Refund / Balance |
|---|---|---|---|---|---:|---:|---:|

Button:

`+ Create Tax Year`

A client can have unlimited tax years.

Tax-year data must be isolated.

---

# 12. TAX-YEAR WORKSPACE

Route:

```text
/clients/{clientId}/years/{taxYear}
```

Header should always show:

- client name;
- tax year;
- filing status;
- masked SSN;
- preparer;
- reviewer;
- return status;
- last calculation timestamp.

Workspace left menu:

```text
Overview

General
  Taxpayer Information
  Spouse
  Dependents

Source Data
  Source Documents
  Imports
  Mapping Center

Income
  W-2
  1099-INT
  1099-DIV
  1099-NEC
  1099-MISC

Businesses
  Schedule C

Future Activities
  Schedule E
  Schedule F
  Other / Schedule 1

Payments
  Federal Withholding
  Estimated Payments

Calculation
  Tax Summary
  Form 1040
  Forms & Schedules

Review
  Source Index
  Validation
  Open Points
  Overrides
  Reconciliation

Outputs
  Workpaper
  JSON Export
  Return Package

Integrations
  Tax Software
```

Each item should show count/status badges.

Example:

```text
W-2                 4
1099-INT            7
1099-DIV            3
1099-NEC            2
1099-MISC           2
Validation          5
Open Points         3
```

---

# 13. CANONICAL JSON DESIGN

The JSON is not merely an upload convenience.

It is the portable representation of the tax-year dataset.

Root structure:

```json
{
  "schema_version": "1.0.0",
  "tax_year": 2025,
  "return_type": "1040",
  "_instructions": {},
  "client": {},
  "taxpayer": {},
  "spouse": {},
  "dependents": [],
  "source_documents": [],
  "forms": {
    "w2": [],
    "form_1099_nec": [],
    "form_1099_misc": [],
    "form_1099_int": [],
    "form_1099_div": []
  },
  "activities": {
    "schedule_c": [],
    "schedule_e": [],
    "schedule_f": [],
    "other_income": []
  },
  "mappings": [],
  "payments": {},
  "review_points": [],
  "metadata": {}
}
```

---

# 14. JSON DESIGN RULE: LOSSLESS + NORMALIZED

Every supported source form should have:

1. normalized fields;
2. source information;
3. optional raw fields;
4. extraction confidence;
5. review metadata.

Example:

```json
{
  "record_id": "w2_001",
  "source_document_id": "DOC-001",
  "taxpayer_role": "taxpayer",
  "form_year": 2025,
  "corrected": false,
  "normalized": {
    "box_1_wages": 86000
  },
  "raw_fields": [
    {
      "label": "Box 14",
      "code": "UT SDI",
      "value": 321.10
    }
  ],
  "extraction": {
    "method": "chatgpt",
    "confidence": "high"
  }
}
```

The production schema must be fixed and versioned before implementation. Section 117 defines serialization and merge semantics; these abbreviated examples do not override that contract.

---

# 15. JSON TEMPLATE DOWNLOAD

Button:

`Download ChatGPT JSON Template`

User should receive:

```text
taxpayer-import-template-2025-v1.0.0.json
```

The template must include valid JSON instructions.

Example:

```json
"_instructions": {
  "purpose": "Populate this JSON from all source documents provided by the user.",
  "critical_rules": [
    "Review all source documents before returning the completed JSON.",
    "Do not estimate missing values.",
    "Do not combine separate tax forms.",
    "Create one form record for each source form.",
    "Preserve every visible supported box even if uncommon.",
    "Preserve all W-2 Box 12 code entries.",
    "Preserve all W-2 Box 14 entries.",
    "Preserve every state and local row.",
    "Preserve account numbers where present.",
    "Preserve corrected/void indicators.",
    "Use null when a value cannot be determined.",
    "Create a review point for ambiguous or conflicting information.",
    "Keep source file names exactly as provided.",
    "Do not calculate tax.",
    "Do not modify schema_version."
  ]
}
```

---

# 16. JSON SCHEMA EVOLUTION

Use semantic versioning.

Example:

```text
1.0.0
1.1.0
2.0.0
```

Rules:

- patch = validation or metadata correction;
- minor = backward-compatible optional fields;
- major = breaking structure change.

Importer must identify schema version.

Never silently coerce an incompatible major version.

Create schema migrations where practical.

---

# 17. SOURCE DOCUMENT MODEL

Every document:

```json
{
  "document_id": "DOC-001",
  "file_name": "2025_W2_Google.pdf",
  "document_type": "W2",
  "tax_year": 2025,
  "issuer": "Google LLC",
  "recipient_role": "taxpayer",
  "page_count": 1,
  "document_hash": null
}
```

Required Phase 1 fields (nullable only for a clearly identified external source reference):

- storage ID;
- MIME type;
- checksum;
- upload source;
- document date;
- duplicate fingerprint;
- superseded document;
- corrected form relationship.

---

# 18. FIELD-LEVEL PROVENANCE

Material fields should support provenance:

```json
{
  "value": 86000,
  "source": {
    "document_id": "DOC-001",
    "page": 1,
    "box": "1"
  },
  "confidence": "high"
}
```

Database can normalize provenance separately.

UI should let the reviewer click a value and see:

```text
Source: 2025_W2_Google.pdf
Page: 1
Box: 1
Imported: 10/06/2026
Import Batch: IMP-00042
Original Value: $86,000
Current Value: $86,000
```

---

# 19. W-2: COMPLETE CAPTURE REQUIREMENTS

Do not implement a simplified W-2.

Capture all identifying information and all federal/state/local boxes.

At minimum model:

## Header / identification

- corrected indicator where applicable;
- employer name;
- employer EIN;
- employer address line 1;
- employer address line 2;
- city;
- state/province;
- ZIP/postal code;
- country;
- control number;
- employee name;
- employee SSN/TIN;
- employee address;
- taxpayer/spouse ownership.

## Federal boxes

- Box 1 wages, tips, other compensation;
- Box 2 federal income tax withheld;
- Box 3 Social Security wages;
- Box 4 Social Security tax withheld;
- Box 5 Medicare wages and tips;
- Box 6 Medicare tax withheld;
- Box 7 Social Security tips;
- Box 8 allocated tips;
- Box 9 if a year-specific form ever uses/reserves it;
- Box 10 dependent care benefits;
- Box 11 nonqualified plans;
- Box 12 entries;
- Box 13 statutory employee;
- Box 13 retirement plan;
- Box 13 third-party sick pay;
- Box 14 entries.

## Box 12 architecture

Box 12 must be an array:

```json
"box_12": [
  {
    "entry_id": "w2_001_b12_01",
    "code": "D",
    "amount": 12000
  },
  {
    "entry_id": "w2_001_b12_02",
    "code": "DD",
    "amount": 8500
  }
]
```

Do not hard-code only common Box 12 codes.

Create a tax-year-specific registry:

```text
tax-rules/2025/w2-box12-codes.ts
```

The registry should contain all IRS-valid codes for that tax-year version.

Validation should identify:

- valid known code;
- valid format but unsupported/new code;
- invalid code.

If an unknown/new code is imported, preserve it and flag it.

Never drop it.

## Box 14 architecture

Box 14 is open-ended.

Use:

```json
"box_14": [
  {
    "label": "UT SDI",
    "amount": 300.00,
    "classification": null
  }
]
```

Do not require a fixed enumeration.

A later mapping layer may classify Box 14 entries.

## State information

Use an array because multiple state rows are possible:

```json
"state_rows": [
  {
    "state": "UT",
    "employer_state_id": "123456",
    "state_wages": 86000,
    "state_income_tax": 3700
  }
]
```

## Local information

Use an array:

```json
"local_rows": [
  {
    "local_wages": 86000,
    "local_income_tax": 500,
    "locality_name": "Example City"
  }
]
```

The source model must be capable of preserving duplicate, repeated, or multi-jurisdiction lines.

---

# 20. FORM 1099-NEC: COMPLETE CAPTURE REQUIREMENTS

Capture all fields for the tax-year version of the form.

Architecture must not assume that the box layout never changes.

Model:

- payer name;
- payer TIN;
- payer address;
- payer phone where present;
- recipient name;
- recipient TIN;
- recipient address;
- account number;
- FATCA or year-specific indicators if applicable;
- corrected/void status;
- second TIN notice indicator where applicable;
- all federal boxes;
- all state rows;
- ownership;
- source document.

For the 2025 revised 1099-NEC, support the tax-year-specific boxes rather than using a hard-coded historical layout.

Store form field definitions in:

```text
form-registry/2025/1099-nec.json
```

A field registry should describe:

```json
{
  "field_key": "box_1_nonemployee_compensation",
  "display_label": "Box 1 — Nonemployee Compensation",
  "data_type": "money",
  "calculation_support": "conditional"
}
```

---

# 21. FORM 1099-MISC: COMPLETE CAPTURE REQUIREMENTS

Support every box and indicator defined for the selected tax-year form version.

Typical normalized concepts include:

- rents;
- royalties;
- other income;
- federal withholding;
- fishing boat proceeds;
- medical and health care payments;
- direct-sales indicator;
- substitute payments;
- crop insurance proceeds;
- gross proceeds paid to an attorney;
- year-specific fish/resale field if applicable;
- section 409A deferrals;
- FATCA filing indicator;
- excess golden parachute payments where applicable by year;
- nonqualified deferred compensation;
- state withholding;
- state/payer state number;
- state income;
- account number;
- second TIN notice;
- corrected status.

Do not depend on this list remaining static.

Use the tax-year form registry as the source of box definitions.

---

# 22. FORM 1099-INT: COMPLETE CAPTURE REQUIREMENTS

Preserve all boxes and metadata for the applicable year.

Normalized concepts should include:

- interest income;
- early withdrawal penalty;
- interest on U.S. Savings Bonds and Treasury obligations;
- federal withholding;
- investment expenses if present for applicable version;
- foreign tax paid;
- foreign country/possession;
- tax-exempt interest;
- specified private activity bond interest;
- market discount;
- bond premium;
- bond premium on Treasury obligations;
- bond premium on tax-exempt bonds;
- tax-exempt and tax-credit bond information where applicable by year;
- state;
- state identification number;
- state tax withheld;
- account number;
- FATCA indicator;
- corrected status.

Support multiple state rows if the form/version permits.

---

# 23. FORM 1099-DIV: COMPLETE CAPTURE REQUIREMENTS

Preserve all boxes and metadata.

Normalized concepts include:

- ordinary dividends;
- qualified dividends;
- total capital gain distributions;
- unrecaptured Section 1250 gain;
- Section 1202 gain;
- collectibles gain;
- Section 897 ordinary dividends where applicable;
- Section 897 capital gain where applicable;
- nondividend distributions;
- federal withholding;
- Section 199A dividends;
- investment expenses if applicable by year;
- foreign tax paid;
- foreign country/possession;
- cash liquidation distributions;
- noncash liquidation distributions;
- exempt-interest dividends;
- specified private activity bond interest dividends;
- state withholding;
- state identification;
- state income;
- FATCA indicator;
- account number;
- corrected status.

Again: use a year-specific registry.

---

# 24. UNIVERSAL SOURCE-FORM ESCAPE HATCH

Even complete schemas evolve.

Every source form must allow unrecognized source fields:

```json
"unmapped_source_fields": [
  {
    "label": "Unknown source label",
    "value": "123.45",
    "page": 2,
    "reason": "Field not present in schema registry"
  }
]
```

Unknown fields generate a review warning.

This prevents data loss when the IRS changes a form before our application schema is updated.

---

# 25. MULTIPLE FORMS

All source forms are arrays.

Never use:

```json
"w2": {}
```

Use:

```json
"w2": []
```

The system must support:

- 1 W-2;
- 20 W-2s;
- 50 1099-INTs;
- multiple identical payers;
- multiple corrected versions;
- taxpayer and spouse forms;
- joint investment forms.

Record identity must be UUID-based, not array-position-based.

---

# 26. SOURCE OWNERSHIP

Each source record needs:

```text
taxpayer
spouse
joint
dependent
unknown
```

Example:

```json
"recipient": {
  "role": "spouse",
  "person_id": "person_spouse_001"
}
```

If ownership cannot be determined, use `unknown`.

Create a review point.

Do not guess.

---

# 27. ACTIVITY MODEL

The platform needs an activity layer between source documents and tax schedules.

Examples:

```text
Consulting Business
Rental Property — 31 W 31st
Farm — Example Farm
Royalty Activity
Other Income Activity
```

Each activity has a stable ID.

Example:

```json
{
  "activity_id": "ACT-C-001",
  "activity_type": "schedule_c",
  "name": "John Sample Consulting",
  "owner": "taxpayer"
}
```

---

# 28. 1099 MAPPING ENGINE

This is a core architectural feature.

1099-NEC and 1099-MISC records must not be permanently tied to one default schedule.

They must be mapped.

Supported future mapping targets include:

```text
Schedule C
Schedule E
Schedule F
Schedule 1 / Other Income
Other Future Target
Ignore / Non-taxable with documented reason
```

The mapping engine must support:

- one source → one activity;
- one source → multiple activities;
- partial amount allocation;
- percentage allocation;
- box-level allocation;
- manual mapping;
- rule-suggested mapping;
- reviewer approval.

---

# 29. MANY-TO-MANY MAPPING

Do not model:

```text
1099-NEC.schedule_c_id
```

as the only option.

Create a mapping table.

Example:

```json
{
  "mapping_id": "MAP-001",
  "source_form_type": "1099-NEC",
  "source_record_id": "nec_001",
  "source_field": "box_1_nonemployee_compensation",
  "source_amount": 100000,
  "target_type": "schedule_c",
  "target_activity_id": "ACT-C-001",
  "allocation_method": "amount",
  "allocated_amount": 75000
}
```

Second mapping:

```json
{
  "mapping_id": "MAP-002",
  "source_form_type": "1099-NEC",
  "source_record_id": "nec_001",
  "source_field": "box_1_nonemployee_compensation",
  "source_amount": 100000,
  "target_type": "schedule_c",
  "target_activity_id": "ACT-C-002",
  "allocation_method": "amount",
  "allocated_amount": 25000
}
```

Reconciliation:

```text
Source amount     $100,000
Mapped            $100,000
Unmapped          $0
Difference        $0
```

---

# 30. MAPPING STATUS

Every mappable source field should show:

```text
Unmapped
Partially Mapped
Fully Mapped
Not Applicable
Needs Review
```

The mapping engine must identify tax-relevant amounts that remain unmapped.

Every unresolved tax-relevant unmapped amount blocks `Reviewed Draft`; no dollar threshold automatically clears a missing treatment.

---

# 31. MAPPING SUGGESTION ENGINE

The application may suggest—but not blindly force—destinations.

Examples:

- 1099-NEC nonemployee compensation → commonly Schedule C;
- 1099-MISC rents → commonly Schedule E, but may be Schedule C in some facts;
- 1099-MISC royalties → Schedule E or Schedule C depending facts;
- 1099-MISC crop insurance → potentially Schedule F;
- 1099-MISC other income → may flow to Schedule 1 or business schedules depending facts.

UI must say:

```text
Suggested destination
Needs preparer confirmation
```

Never present a suggestion as a legal conclusion without the appropriate rule conditions.

---

# 32. MAPPING CENTER SCREEN

Route:

```text
/clients/{clientId}/years/{year}/mapping
```

Layout:

## Left panel — Unmapped source amounts

Table:

| Source | Form | Box | Amount | Suggested Target | Status |
|---|---|---|---:|---|---|

## Center — Mapping editor

Show:

- source document;
- source box;
- source amount;
- owner;
- tax character;
- destination selector;
- activity selector;
- allocation amount;
- allocation percentage;
- notes.

## Right panel — Reconciliation

```text
Source Amount         $100,000
Allocated             $75,000
Remaining             $25,000

Status: Partially Mapped
```

Button:

`+ Add Allocation`

A graphical flow representation can be added later.

---

# 33. SCHEDULE C ACTIVITY MODEL

Even if complete Schedule C functionality is staged, build its model correctly.

Fields should eventually include:

- business name;
- owner;
- business code;
- EIN;
- business address;
- accounting method;
- materially participated;
- started/acquired;
- gross receipts;
- returns/allowances;
- cost of goods sold;
- expenses by Schedule C category;
- vehicle;
- home office;
- other expenses;
- depreciation link;
- net profit/loss;
- SE treatment;
- QBI treatment.

Initial MVP may implement:

- activity identity;
- mapped 1099 income;
- manually entered additional gross receipts;
- only the supported expense categories defined in Section 112;
- net profit subject to the supported-case restrictions;
- Schedule SE dependency;
- deductible part of SE tax under the year-specific rules;
- simplified QBI dependency or an explicit unsupported-case blocker (Sections 112–114).

---

# 34. SCHEDULE E / F / SCHEDULE 1 PLACEHOLDERS

Because mappings need to exist before the forms are fully developed, create future activity records now.

Example:

```json
{
  "activity_type": "schedule_e",
  "implementation_status": "mapping_only"
}
```

If a tax-relevant source amount maps to an unimplemented calculation target:

- retain mapping;
- show `Calculation Not Yet Supported`;
- create blocking validation;
- do not claim the return is complete;
- do not omit the income.

This is essential.

---

# 35. TAX CALCULATION ENGINE

Create a pure, deterministic engine.

Suggested structure:

```text
src/tax-engine/
  common/
  2025/
    constants/
    forms/
    calculations/
    dependencies/
    validators/
    line-map/
  2026/
```

Functions should not depend on UI state.

Example:

```typescript
calculateW2Income()
calculateInterestIncome()
calculateDividendIncome()
calculateScheduleC()
calculateSelfEmploymentTax()
calculateTotalIncome()
calculateAdjustments()
calculateAGI()
calculateStandardDeduction()
calculateTaxableIncome()
calculateOrdinaryIncomeTax()
calculateQualifiedDividendCapitalGainTax()
calculateAdditionalTaxes()
calculateTotalTax()
calculatePayments()
calculateRefundOrBalanceDue()
```

---

# 36. TAX ENGINE INPUT / OUTPUT

Input:

```typescript
CanonicalTaxReturnData
```

Output:

```typescript
TaxCalculationResult
```

Example line result:

```json
{
  "form": "1040",
  "line": "1a",
  "key": "wages",
  "description": "Total amount from Form(s) W-2, box 1",
  "amount": 126000,
  "source_records": [
    "w2_001",
    "w2_002"
  ],
  "calculation_id": "CALC-1040-1A"
}
```

Every calculated line should know:

- formula;
- dependencies;
- source records;
- manual adjustments;
- rounding;
- final amount.

---

# 37. TAX RULE REGISTRY

Never scatter constants across the application.

Example:

```text
tax-rules/2025/
  filing-status.ts
  standard-deduction.ts
  tax-brackets.ts
  social-security.ts
  self-employment.ts
  qualified-dividends.ts
  form-dependencies.ts
  rounding.ts
```

Each tax year gets its own rule package.

Where rules are unchanged, reuse common components explicitly.

---

# 38. TAX RETURN COMPLETENESS STATUS

Use separate state dimensions defined in Section 85. Calculation success is not proof of factual completeness, reviewer approval or filing capability.

A complete supported draft requires: completed intake; no unresolved ownership, correction, mapping or source-verification blockers; all applicable treatments implemented; current successful calculation; all required outputs available; and no blocking diagnostic. “Calculation complete” refers only to that evaluated fact set.

Partial calculations show known subtotals and explicit unknown/incomplete values. Do not show a green final refund or amount owed when omitted items can change it. Zero is a computed value, not a substitute for missing support.

No Phase 1 screen offers Ready to File or Filed as an internal status.

---

# 39. FORM DEPENDENCY GRAPH

Create a form dependency graph.

Examples:

```text
1099-NEC
  ↓
Schedule C
  ↓
Schedule 1
  ↓
Form 1040

Schedule C
  ↓
Schedule SE
  ↓
Schedule 2 / 1040 as applicable
```

Other future examples:

```text
1099-B → Form 8949 → Schedule D → Form 1040
Rental → Schedule E → Schedule 1 → Form 1040
Farm → Schedule F → Schedule 1 → Form 1040
```

The engine should decide which forms are required based on facts and implemented tax rules.

---

# 40. FORM REGISTRY

Create a year-versioned form registry.

Example:

```text
form-registry/
  2025/
    1040.json
    schedule-1.json
    schedule-c.json
    schedule-se.json
    w2.json
    1099-nec.json
    1099-misc.json
    1099-int.json
    1099-div.json
```

Each form definition can include:

```json
{
  "form": "1040",
  "tax_year": 2025,
  "revision": "2025",
  "fields": [],
  "line_definitions": [],
  "pdf_mapping": {},
  "dependencies": []
}
```

---

# 41. FORM 1040 INTERNAL PREVIEW

Build an internal 1040 screen.

It should resemble the logical structure of Form 1040, not necessarily the exact IRS visual layout.

Sections:

```text
Filing Information
Dependents

Income
  Wages
  Interest
  Dividends
  Business / Other Income
  Total Income

Adjustments
Adjusted Gross Income

Deductions
Taxable Income

Tax and Credits
Additional Taxes
Total Tax

Payments
Withholding
Estimated Payments

Refund / Amount Owed
```

Every amount is clickable.

Clicking opens a calculation drawer:

```text
Form 1040 — Line 1a
Total Wages: $126,000

Sources:
Google W-2          $86,000
Microsoft W-2       $40,000
---------------------------
Total              $126,000
```

---

# 42. OFFICIAL FORM GENERATION

The application must be architected to produce a filled return package.

There are two layers:

## Layer A — Calculation / Form data model

This is authoritative.

## Layer B — PDF rendering

This is presentation.

Do not calculate values directly inside the PDF code.

Workflow:

```text
Canonical Tax Data
   ↓
Tax Calculation
   ↓
Form Data Objects
   ↓
Form Dependency Resolver
   ↓
Year-Specific IRS Form Renderer
   ↓
Filled PDF Forms
   ↓
Merged Return Package
```

---

# 43. PDF FORM RENDERER

Create an interface:

```typescript
interface TaxFormRenderer {
  render(formData: FormData, taxYear: number): Promise<Buffer>
}
```

Possible implementation methods:

1. Fill AcroForm fields in official IRS fillable PDFs.
2. Overlay values using year-specific coordinates.
3. Use a controlled internal PDF representation if official form mechanics make direct fill difficult.

Keep mapping separate:

```text
pdf-maps/2025/1040.json
```

---

# 44. RETURN PACKAGE

Output example:

```text
2025_John_Sample_Federal_Draft_Return.pdf
```

Package must include a manifest of every required form and its generation status, followed by the implemented rendered forms. Missing required forms make the package explicitly incomplete.

Example:

```text
Form 1040
Schedule 1
Schedule 2
Schedule C
Schedule SE
Form 8995 when applicable and supported
```

If a required schedule has not been implemented:

- clearly mark return package incomplete;
- do not generate a misleading “complete” return.

---

# 45. FORM GENERATION STATUS

Artifact status is `Queued`, `Generating`, `Succeeded`, `Failed`, or `Stale`; completeness is `Partial` or `Complete supported draft`. Review status is separate.

Every Phase 1 PDF page carries `DRAFT — NOT FOR FILING`. A cover identifies unsupported treatments and missing required forms. A reviewed draft retains the watermark. Internal facsimiles must be labelled as internal previews, never official filing documents.

Each artifact records its input revision, calculation run, engine version, form/template versions, creator, generation time and content hash. A subsequent relevant change marks the artifact stale without rewriting the historical file.

---

# 46. SOURCE DATA ENTRY SCREEN DESIGN

All source-form screens should use the same design system.

Example route:

```text
/.../income/w2
```

Layout:

## Left list

```text
W-2 #1  Google LLC           $86,000
W-2 #2  Microsoft Corp       $40,000
W-2 #3  ABC LLC              $15,000
```

Badges:

- TP
- SP
- Joint
- Warning
- Corrected
- Overridden

Buttons:

```text
+ Add
Import
Duplicate
Delete
```

## Main detail panel

Sections:

```text
Source
Recipient
Payer / Employer
Federal Boxes
Codes / Additional Information
State
Local
Mapping
Review
Audit
```

Use compact field grids.

## Right contextual panel

Show:

- source filename;
- secure source viewer, page selector, and explicit missing-file state;
- provenance;
- validation issues;
- mappings;
- review points.

---

# 47. W-2 SCREEN SPECIFICATION

Header:

```text
W-2 #2 — Google LLC
Recipient: Taxpayer
Source: 2025_W2_Google.pdf
Status: Validated
```

Tabs or collapsible sections:

### Employer

- EIN
- Name
- Address

### Employee

- SSN masked
- Name
- Address

### Federal

Compact grid:

| Box | Description | Amount |
|---|---|---:|
| 1 | Wages | $86,000 |
| 2 | Federal WH | $7,200 |
| 3 | SS Wages | ... |

### Box 12

Editable table:

| Code | Amount | Description | Validation |
|---|---:|---|---|

Button:

`+ Add Box 12 Entry`

### Box 13

Three checkboxes.

### Box 14

Editable table:

| Label | Amount | Classification | Review |
|---|---:|---|---|

### State

Repeatable rows.

### Local

Repeatable rows.

### Source / Audit

Read-only provenance history.

---

# 48. 1099-NEC / 1099-MISC SCREEN

Same general structure.

Add a prominent section:

## Return Mapping

Example:

```text
Box 1 Nonemployee Compensation       $100,000

Mapped:
John Consulting — Schedule C          $75,000
Training Business — Schedule C        $25,000

Unmapped                                   $0

[Edit Mapping]
```

For 1099-MISC, mapping can be box-specific.

Example:

```text
Box 1 Rents     → Rental A / Schedule E
Box 3 Other     → Schedule 1 Other Income
```

---

# 49. 1099-INT / DIV SCREEN

Show source form fields plus tax classification.

Example 1099-INT:

```text
Interest                          $5,000
U.S. Treasury Interest            $2,000
Tax-Exempt Interest               $1,000
Private Activity Bond Interest      $500
Foreign Tax                         $100
```

UI should not combine tax-character amounts.

Example 1099-DIV:

```text
Ordinary Dividends               $12,000
Qualified Dividends               $9,000
Capital Gain Distribution         $2,000
Section 199A Dividends              $500
```

Validation should identify impossible/inconsistent relationships where rules permit.

---

# 50. IMPORT WIZARD

Route:

```text
/imports/new
```

Five steps.

## Step 1 — File

Drop zone:

`Upload JSON`

Show:

- filename;
- size;
- schema version detected;
- tax year detected;
- client detected.

## Step 2 — Structural Validation

Check:

- valid JSON;
- supported schema;
- required root objects;
- types;
- record IDs;
- tax year;
- return type.

## Step 3 — Tax Data Validation

Check:

- TIN formats;
- ownership;
- duplicate IDs;
- duplicate source documents;
- form-year mismatch;
- missing payer;
- suspicious values;
- invalid W-2 Box 12 codes;
- state row validity;
- dividend relationships;
- unsupported tax treatments.

## Step 4 — Change Preview

Table:

| Record | Field | Existing | Imported | Decision |
|---|---|---|---|---|

Decisions:

```text
Use Imported
Keep Existing
Review Later
```

Never silently overwrite.

## Step 5 — Commit

Summary:

```text
Records Added       13
Records Updated      2
Warnings             4
Review Points        3
Rejected             0
```

Button:

`Confirm Import`

---

# 51. IMPORT IDEMPOTENCY / DUPLICATE DETECTION

Generate source fingerprints.

Candidate components:

```text
tax year
form type
payer TIN
recipient TIN
account number
major box amounts
source filename
document hash
```

Do not automatically delete suspected duplicates.

Show:

```text
Possible Duplicate
```

The user decides.

Corrected forms should be linkable:

```text
Original Record → Corrected Record
```

---

# 52. IMPORT HISTORY

Screen:

```text
Review → Import History
```

Each import batch:

```text
IMP-00042
October 6, 2026
Imported by: User
Schema: 1.0.0 (illustrative)
File: completed-taxpayer.json
```

Show:

- added records;
- changed records;
- ignored records;
- errors;
- warnings;
- resulting review points.

Allow inspection but not destructive rewrite of history.

---

# 53. SOURCE CORRECTIONS AND MANUAL OVERRIDES

Separate an edit to a captured fact from an override of a calculated result.

**Source correction:** retain imported/raw value, corrected value, field path, source evidence, reason, actor, time and revision. This creates a new effective source revision and invalidates dependent calculations and review checks.

**Calculation override:** Phase 1 permits only explicitly registered override points with typed units, validation, reason, evidence and independent review. Display both engine and override values with downstream effects. Unregistered direct edits to 1040 output lines are prohibited. Overrides cannot make unsupported treatments supported, erase blockers, change protected audit metadata, or bypass allocation constraints.

Provide a visible Revert to calculated/source value action that records a new event. Re-import never silently replaces an active manual correction. Roles and assignment scope are enforced on the server.

---

# 54. VALIDATION ENGINE

Separate validation from tax calculations.

Validation object:

```json
{
  "severity": "warning",
  "code": "DIV_QUALIFIED_GT_ORDINARY",
  "form_type": "1099-DIV",
  "record_id": "div_003",
  "field": "qualified_dividends",
  "message": "Qualified dividends exceed ordinary dividends.",
  "recommended_action": "Verify the source Form 1099-DIV."
}
```

Severity:

```text
Info
Warning
Error
Blocking
```

---

# 55. VALIDATION CATEGORIES

Implement:

## Structural

JSON and schema issues.

## Source consistency

Examples:

- form year mismatch;
- malformed EIN;
- malformed TIN;
- missing owner;
- missing payer.

## Tax logic

Examples:

- qualified dividends > ordinary dividends;
- negative W-2 wages without permitted context;
- federal withholding but missing related income;
- state withholding without state identifier.

## Mapping

Examples:

- unmapped NEC amount;
- partially mapped MISC rents;
- mapping exceeds source amount.

## Calculation support

Example:

```text
$20,000 mapped to Schedule E, but Schedule E calculation is not implemented.
```

This is blocking for draft review approval regardless of whether a partial calculation ran successfully.

---

# 56. OPEN / REVIEW POINT SYSTEM

Categories:

```text
[Confirm]
[FYI]
[Pending]
[Correction]
[Information Required]
```

Fields:

- ID
- category
- subject
- description
- source document
- source record
- related tax form
- related activity
- owner
- status
- assigned user
- created by
- created date
- due date
- resolution
- resolved by
- resolved date.

Statuses:

```text
Open
Waiting
Resolved
Not Applicable
```

---

# 57. REVIEW DASHBOARD

Route:

```text
/.../review
```

Cards:

```text
Source Documents        14
Source Records          18
Blocking Errors          1
Warnings                 5
Unmapped Amounts         2
Open Points              4
Overrides                1
Unsupported Treatments   1
```

Sections:

- Blocking Issues
- Missing Information
- Unmapped Tax Items
- Possible Duplicates
- Manual Overrides
- Import Changes
- Calculation Warnings
- Open Points

---

# 58. SOURCE INDEX

Auto-generate.

Columns:

| Ref | File | Form | Issuer | Recipient | Key Information | Return Destination | Status |
|---|---|---|---|---|---|---|---|

Example:

```text
DOC-001
2025_W2_Google.pdf
W-2
Google LLC
Taxpayer
Wages / withholding
1040 wages
Validated
```

The source index must become both:

1. a screen;
2. a workpaper sheet.

---

# 59. INCOME & WITHHOLDING SUMMARY

Create one consolidated screen/table.

Columns:

- source;
- source filename;
- form;
- owner;
- gross income;
- ordinary tax character;
- qualified amount where applicable;
- federal withholding;
- state;
- state withholding;
- return destination;
- review status.

Totals must be calculated programmatically.

Workpaper export should use formulas where practical.

---

# 60. TAX SUMMARY SCREEN

Route:

```text
/.../calculation/summary
```

Display hierarchical return calculation.

Example:

```text
Income
  Wages                               $126,000
  Taxable Interest                       5,000
  Ordinary Dividends                    12,000
  Schedule C Net Income                 35,000
                                      --------
  Total Income                         178,000

Adjustments
  Deductible Part of SE Tax              2,473

Adjusted Gross Income                  175,527
Standard Deduction                     (xx,xxx)
Taxable Income                         xxx,xxx

Income Tax                              xx,xxx
Self-Employment Tax                     x,xxx
Total Tax                               xx,xxx

Federal Withholding                      7,450
Estimated Payments                           0

Refund / Balance Due                    xx,xxx
```

Each line is clickable for source detail.

---

# 61. CALCULATION TRACE DRAWER

Clicking any calculated line opens:

```text
Taxable Interest
Form 1040 Line XX

Fidelity 1099-INT       $4,000
Chase 1099-INT          $1,000
------------------------------
Total                    $5,000
```

For computed values show formula.

Example:

```text
AGI
Total Income        $178,000
Adjustments          (2,473)
----------------------------
AGI                 $175,527
```

---

# 62. WORKPAPER GENERATION

Generate XLSX.

Initial sheets:

```text
1. Cover & Tax Summary
2. Source Index
3. All Open Review Points
4. Income & Withholding Summary
5. W-2 Detail
6. 1099-INT Detail
7. 1099-DIV Detail
8. 1099-NEC Detail
9. 1099-MISC Detail
10. Mapping Reconciliation
11. Schedule C
12. Tax Calculation
```

Only include relevant sheets where sensible.

---

# 63. WORKPAPER STANDARD

Workpaper must be:

- short;
- simple;
- reviewer-ready;
- filterable;
- source-indexed;
- consistent across clients;
- formula-driven.

Use:

- Excel Tables;
- SUMIF;
- SUMIFS;
- subtotal/reconciliation formulas.

Avoid:

- manual hard-coded totals;
- fragile direct cell-to-cell chains;
- duplicated summary tables;
- unnecessary decorative formatting.

---

# 64. WORKPAPER SOURCE REFERENCES

Each detailed record must include:

- Source Ref
- File Name
- Form
- Owner
- Issuer
- Amount
- Return Mapping
- Review Note

The reviewer should be able to filter the detail and reproduce summary totals.

---

# 65. JSON EXPORT

Buttons:

```text
Export Complete JSON
Export ChatGPT Template
Export Source-Only JSON
```

Round-trip workflow:

```text
Application
  ↓
Canonical JSON
  ↓
ChatGPT + new documents
  ↓
Updated JSON
  ↓
Import Preview
  ↓
Application
```

The importer should be capable of merging updates safely.

---

# 66. APPLICATION API LAYER

Create internal service interfaces.

Examples:

```typescript
ClientService
TaxYearService
SourceDocumentService
ImportService
FormDataService
MappingService
ValidationService
CalculationService
ReviewPointService
WorkpaperService
ReturnPackageService
IntegrationService
AuditService
```

Avoid putting business logic directly into API route handlers.

---

# 67. DATABASE MODEL

At minimum:

```text
User
Role
Client
TaxYear
Person
Dependent
SourceDocument
SourceFormRecord
W2
W2Box12Entry
W2Box14Entry
W2StateRow
W2LocalRow
Form1099NEC
Form1099MISC
Form1099INT
Form1099DIV
StateInformationRow
Activity
SourceMapping
ScheduleC
Payment
ImportBatch
ImportRecordChange
ValidationIssue
ReviewPoint
ManualOverride
CalculationRun
CalculationLine
GeneratedForm
GeneratedReturnPackage
WorkpaperRun
AuditEvent
IntegrationConnection
IntegrationSyncRun
```

Use UUIDs.

---

# 68. AUDIT TRAIL

Record:

- login;
- view of sensitive values where appropriate;
- JSON import;
- manual edit;
- mapping;
- override;
- review-point resolution;
- calculation;
- workpaper generation;
- PDF generation;
- integration export/sync;
- status change.

Audit events should be immutable.

---

# 69. SECURITY

Taxpayer data is highly sensitive.

Implement from the beginning:

- TLS/HTTPS architecture;
- secure authentication;
- authorization;
- least privilege;
- encrypted secrets;
- encryption at rest for production databases, objects, backups, and secrets;
- masked SSNs;
- masked EINs where appropriate;
- secure cookies;
- session expiration;
- CSRF protection;
- input validation;
- rate limiting for sensitive endpoints;
- audit logging;
- safe error messages;
- no taxpayer data in browser console;
- no taxpayer data in analytics;
- no SSNs in URLs;
- no taxpayer data in GitHub;
- no real taxpayer data in test fixtures.

Use synthetic data in development and CI.

---

# 70. SSN / TIN UI

Default:

```text
***-**-1234
```

Reveal only by explicit authorized action.

Log sensitive reveal if required by the security policy.

---

# 71. FUTURE PROFESSIONAL TAX SOFTWARE INTEGRATION — CORE VISION

This is a future phase, but the architecture must be prepared now.

The application should eventually function as:

```text
Canonical Tax Data Platform
        ↓
Vendor Adapter Layer
        ↓
CCH Axcess Tax
Drake Tax
Other Professional Tax Software
```

The purpose is to eliminate repeated manual data entry.

---

# 72. INTEGRATION PRINCIPLE

Never design canonical fields around one vendor.

Create:

```typescript
interface TaxSoftwareAdapter {
  getCapabilities(): Promise<IntegrationCapabilities>;
  validateConnection(): Promise<ConnectionResult>;
  exportClientProfile(...): Promise<IntegrationResult>;
  exportReturnData(...): Promise<IntegrationResult>;
  importReturnData(...): Promise<IntegrationResult>;
  createReturn?(...): Promise<IntegrationResult>;
  calculateReturn?(...): Promise<IntegrationResult>;
  getEfileStatus?(...): Promise<IntegrationResult>;
}
```

Implement vendor adapters separately.

---

# 73. CCH AXCESS FUTURE ADAPTER

Create placeholder architecture:

```text
integrations/
  cch-axcess/
    adapter.ts
    capability-map.ts
    field-map/
      2025/
      2026/
```

Future investigation only: confirm current vendor documentation, contractual access, licensing, and each supported operation before designing or enabling the adapter. No API or transfer capability is assumed available.

When implementing:

- use officially supported APIs/utilities;
- authenticate through supported mechanisms;
- store credentials securely;
- version field maps by tax year;
- support capability discovery;
- do not scrape UI;
- do not write directly to proprietary databases.

Possible future flow:

```text
Canonical W-2
    ↓
CCH Field Mapper
    ↓
CCH Tax API / Supported Transfer Method
    ↓
CCH Return
```

Then:

```text
CCH Return Data
    ↓
CCH Adapter
    ↓
Canonical Comparison Model
    ↓
Internal vs CCH Reconciliation
```

---

# 74. DRAKE TAX FUTURE ADAPTER

Create:

```text
integrations/
  drake/
    adapter.ts
    capability-map.ts
    field-map/
      2025/
      2026/
```

Do not assume Drake exposes the same APIs as CCH.

Treat supported integration methods as capabilities.

Examples may include:

- supported spreadsheet imports;
- supported client-file exchange;
- supported vendor-specific import tools;
- future API or automation capability if officially available.

Never reverse-engineer proprietary data formats where vendor terms or technical safety do not permit it.

---

# 75. INTEGRATION CAPABILITY MATRIX

Build a screen/data model:

| Capability | Internal | CCH | Drake |
|---|---:|---:|---:|
| Client Profile Export | Yes | Future | Future |
| W-2 Export | Yes | Future | Future |
| 1099 Export | Yes | Future | Future |
| Return Creation | Internal | Future | Future |
| Return Calculation | Yes | Future | Future |
| Return Data Import | Yes | Future | Future |
| E-file Status | Future | Future | Future |

The actual capability should come from the adapter.

Do not show a feature as available merely because the canonical model supports it.

---

# 76. FUTURE TAX SOFTWARE SCREEN

Route:

```text
/.../integrations/tax-software
```

Cards:

```text
Internal Tax Engine
Status: Active

CCH Axcess
Status: Planned
[View planned capabilities]

Drake Tax
Status: Planned
```

When an adapter exists, show:

- connection status;
- supported tax year;
- supported forms;
- last sync;
- export;
- import;
- compare.

---

# 77. FUTURE SYNC PREVIEW

Never push data blindly.

Before export to vendor:

| Canonical Field | Current Vendor | Proposed | Action |
|---|---:|---:|---|

Actions:

```text
Export
Keep Vendor
Skip
Review
```

Maintain sync batch history.

---

# 78. FUTURE RETURN RECONCILIATION

One of the long-term major features:

Compare:

```text
Source Documents
Internal Calculation
CCH / Drake Calculation
Workpaper
```

Example:

| Item | Source/Internal | Vendor Return | Difference |
|---|---:|---:|---:|
| Wages | 126,000 | 126,000 | 0 |
| Interest | 5,000 | 4,500 | 500 |
| Federal WH | 7,450 | 7,450 | 0 |

Differences create review points.

---

# 79. FUTURE E-FILE

Do not build any filing transmission or filing-ready workflow in MVP. All output is draft-only.

Potential future e-file should only use:

- authorized IRS Modernized e-File processes;
- or officially supported professional tax software/vendor workflows.

Keep e-file separate from tax calculation.

---

# 80. FORM / TAX RULE RESEARCH REQUIREMENT

For every tax year, developers must verify field layouts and tax rules from authoritative sources.

Do not copy last year's schema forward without review.

Maintain:

```text
docs/tax-year-update/2025.md
docs/tax-year-update/2026.md
```

Each file should document:

- form changes;
- line changes;
- code changes;
- threshold changes;
- calculation changes;
- PDF changes;
- integration mapping changes.

---

# 81. ADMIN — FORM REGISTRY SCREEN

Future internal admin tool.

Allows authorized technical/admin users to inspect:

- supported form;
- tax year;
- version;
- field definitions;
- validation;
- calculation support;
- PDF mapping support;
- vendor mapping support.

Status example:

| Field | Capture | Calculate | PDF | CCH | Drake |
|---|---|---|---|---|---|
| W-2 Box 1 | Yes | Yes | Yes | Future | Future |
| W-2 Box 12 DD | Yes | N/A | N/A | Future | Future |
| MISC Box 1 | Yes | Mapping | Future | Future | Future |

---

# 82. SUPPORT STATUS MODEL

Each field must declare these capabilities; `conditional` requires an explicit eligibility predicate, blockers and test references:

```text
capture: supported
validation: supported
calculation: supported | conditional | partial | not_applicable | future
pdf_output: supported | future
integration: vendor-specific
```

This is better than pretending all captured fields are fully calculated.

---

# 83. KEYBOARD-FRIENDLY TAX ENTRY

Professional preparers need speed.

Support:

- Tab navigation;
- Enter save/move;
- keyboard shortcuts;
- add new record shortcut;
- next/previous source form;
- quick open by form;
- numeric entry without mouse.

Do not sacrifice accessibility.

---

# 84. DATA DISPLAY RULES

Amounts:

```text
$86,000
($2,500)
```

TINs masked.

Source IDs visible but unobtrusive.

Warnings use icons plus text, not color alone.

Tables need:

- filter;
- sort;
- column chooser;
- export where appropriate.

---

# 85. AUTHORITATIVE STATUS MODEL

Do not use a single dropdown for import jobs, tax completeness, review, and filing.

| Dimension | States | Authority |
|---|---|---|
| Preparation | Not Started; Documents Pending; In Preparation; Ready for Review; Changes Requested; Reviewed Draft; Archived | Explicit guarded transitions |
| Data validation | Not Run; Incomplete; Validated | Derived from current revision |
| Calculation | Not Run; Queued; Running; Partial; Complete; Failed; Stale | Calculation service |
| Review points | Open; Waiting; Resolved; Not Applicable | Reviewer workflow; findings remain auditable |
| Import job | Uploaded; Validating; Preview Ready; Committing; Committed; Failed; Cancelled | Import service |
| Artifact | Queued; Generating; Succeeded; Failed; Stale | Output service |
| Filing | Not Available in Phase 1 | No editable filing status |

Transition rules:

1. A preparer can request review only after the completeness gate in Section 38 passes for the current revision.
2. A reviewer can request changes with an assigned review point.
3. Reviewed Draft requires reviewer authorization, all required sign-offs and the same still-current revision. Admin role alone does not grant reviewer qualification or bypass checks.
4. A relevant edit to an approved return moves it to Changes Requested, invalidates affected sign-offs and marks dependent outputs stale.
5. Archive makes the workspace read-only. Authorized restore is audited. Archive is not deletion or amendment.
6. Return status writes are transactional and version-checked; direct API calls cannot bypass guards.

The primary status is accompanied by calculation freshness, blocker count and review status. Historical filed/amended records, if added later, must be separately evidenced external records.

---

# 86. DEMO DATA

Seed one synthetic client:

```text
John & Jane Sample
Tax Year 2025
```

Use fake identifiers only.

Include:

- 2 W-2s;
- multiple Box 12 codes;
- multiple Box 14 entries;
- 2 state rows across W-2 examples;
- 3 1099-INTs;
- 2 1099-DIVs;
- 2 1099-NECs;
- 2 1099-MISCs;
- at least one split mapping;
- one low-confidence field;
- one missing field;
- one duplicate candidate;
- one manual override;
- several review points.

---

# 87. AUTOMATED TESTS — IMPORT

Test:

1. blank JSON template;
2. valid completed JSON;
3. invalid syntax;
4. wrong schema version;
5. wrong tax year;
6. multiple W-2s;
7. uncommon W-2 Box 12 code;
8. multiple W-2 Box 14 entries;
9. multiple state rows;
10. multiple local rows;
11. corrected source;
12. unknown source field;
13. duplicate JSON import;
14. changed re-import;
15. taxpayer/spouse ownership.

---

# 88. AUTOMATED TESTS — MAPPING

Test:

1. NEC fully mapped to one Schedule C;
2. NEC split between two Schedule C activities;
3. MISC rents mapped to Schedule E placeholder;
4. MISC other income mapped to Schedule 1 placeholder;
5. over-allocation;
6. partial mapping;
7. unmapped material income;
8. mapping to unsupported calculation target;
9. mapping deletion;
10. mapping audit history.

---

# 89. AUTOMATED TESTS — CALCULATION

Use authoritative expected-value fixtures for supported rules.

Test:

- wages;
- interest;
- dividends;
- qualified dividend handling;
- Schedule C income;
- Schedule C expenses;
- self-employment tax;
- adjustment for deductible SE tax;
- AGI;
- standard deduction;
- taxable income;
- ordinary tax;
- dividend/capital-gain tax interaction where implemented;
- withholding;
- refund;
- balance due.

Use high-precision arithmetic / controlled rounding.

---

# 90. AUTOMATED TESTS — FORM GENERATION

Test:

- required form dependency detection;
- 1040 rendering;
- Schedule C rendering;
- Schedule SE rendering;
- draft watermark;
- missing required unsupported schedule;
- page merge order;
- correct tax year template;
- no taxpayer data leaks into logs.

---

# 91. AUTOMATED TESTS — SECURITY

Test:

- unauthorized client access;
- role restrictions;
- SSN masking;
- session expiration;
- audit logging;
- unsafe file name;
- malformed JSON payload;
- XSS input;
- SQL-injection-like input through ORM validation;
- sensitive error redaction.

---

# 92. REPOSITORY STRUCTURE

Suggested:

```text
README.md

docs/
  product-vision.md
  architecture.md
  canonical-tax-model.md
  json-import.md
  mapping-engine.md
  tax-engine.md
  form-rendering.md
  workpaper.md
  security.md
  integrations.md
  roadmap.md
  tax-year-update/
    2025.md

schemas/
  2025/
    taxpayer-import-v1.schema.json

examples/
  2025/
    blank-taxpayer-template.json
    completed-sample.json

src/
  app/
  components/
  services/
  domain/
  validation/
  imports/
  mappings/
  tax-engine/
  form-registry/
  pdf/
  workpapers/
  integrations/
    cch-axcess/
    drake/
  audit/

tests/
  unit/
  integration/
  e2e/
  fixtures/
```

---

# 93. DOMAIN MODULES

Organize by domain rather than only technical layer.

Example:

```text
domain/
  clients/
  tax-years/
  people/
  source-documents/
  source-forms/
  activities/
  mappings/
  calculations/
  review/
  outputs/
  integrations/
```

---

# 94. ERROR HANDLING

User-facing errors should explain:

- what failed;
- which record;
- whether data was saved;
- how to resolve it.

Example:

```text
Import blocked:
W-2 record w2_004 contains Box 12 code "ZZZ", which is not recognized for tax year 2025.

The value has been preserved.
Review the source document before continuing.
```

Never respond with only:

```text
Something went wrong.
```

when actionable information is available.

---

# 95. OBSERVABILITY

Log technical events without leaking tax data.

Safe:

```text
Import batch IMP-42 validation failed with 3 errors.
```

Unsafe:

```text
SSN 123-45-6789 Box 1 wages 86000...
```

Build redaction utilities.

---

# 96. PERFORMANCE

Design for at least:

- thousands of clients;
- multiple tax years;
- hundreds of source records in a complex 1040;
- large workpapers;
- repeated calculation runs.

Calculation should be fast enough for interactive use.

Use caching only when correctness and invalidation are clear.

---

# 97. DATA INTEGRITY

Use database transactions for:

- import commit;
- mapping allocation changes;
- calculation publication;
- status transitions where appropriate.

Never leave a partial import as if it succeeded.

---

# 98. CALCULATION RUNS

Every calculation creates a run:

```text
CALC-000123
Tax Year 2025
Engine Version 2025.1.3
Timestamp
Input Hash
```

Store results or reproducible calculation snapshots.

This enables future regression analysis.

---

# 99. TAX ENGINE VERSIONING

Track:

```text
tax_year
engine_version
rule_version
form_registry_version
```

Generated return should record these versions.

---

# 100. RETURN REPRODUCIBILITY

Given:

- same canonical input;
- same tax-year rules;
- same engine version;

the calculation output must be deterministic.

This is required for auditability.

---

# 101. DEFINITION OF DONE — MVP

Phase 1 is complete only when the end-to-end gates in Section 124 pass. It must demonstrate both a supported reviewed draft and a partial draft that correctly refuses approval.

A preparer must be able to create a client/year, complete intake, attach source files, download/import the canonical template, preserve all five source-form families and unknown fields, verify provenance, resolve duplicates/corrections, allocate income, record supported business facts, review diagnostics, calculate a supported case, navigate every material result back to inputs, produce the required draft forms and workpaper, and export/restore canonical data without loss.

A reviewer must be able to flag and verify values, inspect overrides, request changes, see prior/current values, and approve only the unchanged supported draft. Re-import, concurrent editing, calculation retries, source replacement and rule updates must not leave false approvals.

The release must meet security, recovery, accessibility, performance and visual acceptance gates. Mock integrations and demo calculations do not satisfy production capability requirements. Passing tests is evidence of the stated scope; it is not a claim of full tax-software parity.

---

# 102. PHASE 1 IMPLEMENTATION ORDER

## Milestone 1 — Repository Foundation

- Next.js
- TypeScript
- PostgreSQL
- Prisma
- authentication
- roles
- base layout
- testing framework
- CI

## Milestone 2 — Client / Tax Year

- client list;
- client profile;
- tax years;
- taxpayer/spouse/dependents.

## Milestone 3 — Canonical Schema

- source document model;
- JSON schema;
- Zod schema;
- form registries;
- template download.

## Milestone 4 — Import Engine

- upload;
- validate;
- preview;
- compare;
- commit;
- import history.

## Milestone 5 — Source Forms

- W-2;
- NEC;
- MISC;
- INT;
- DIV;
- all repeatable boxes/rows.

## Milestone 6 — Mapping

- activities;
- mapping table;
- split allocations;
- reconciliation;
- unsupported destination handling.

## Milestone 7 — Review

- source index;
- validation center;
- open points;
- manual overrides;
- duplicate resolution.

## Milestone 8 — Tax Engine

- year rules;
- calculation graph;
- implemented federal calculations;
- calculation traces.

## Milestone 9 — Forms

- internal 1040;
- form dependency resolver;
- draft official-form renderer;
- return package.

## Milestone 10 — Workpaper

- Source Index;
- Open Points;
- Income Summary;
- detailed tabs;
- calculation tab;
- formulas;
- formatting.

## Milestone 11 — Hardening

- security;
- e2e tests;
- performance;
- error handling;
- documentation.

## Milestone 12 — Integration Architecture Only

Do not implement live CCH/Drake sync unless credentials, vendor permissions, and a separate implementation task are provided.

Create:

- adapter interfaces;
- capability model;
- placeholder settings UI;
- documentation;
- sample mock adapter.

---

# 103. WHAT CODEX MUST NOT DO

Do not:

- build the entire application as one giant page;
- use ChatGPT as the tax calculator;
- discard uncommon form boxes;
- hard-code only common W-2 Box 12 codes;
- hard-code Box 14 choices;
- assume one state per W-2;
- assume one W-2 per taxpayer;
- assume 1099-NEC always belongs to one Schedule C;
- assume 1099-MISC Box 1 always has one treatment;
- overwrite prior import data silently;
- use payer name as the record primary key;
- use SSN in URLs;
- log sensitive taxpayer values;
- treat generated PDF as the source of truth;
- tie internal database columns directly to CCH or Drake screen IDs;
- reverse-engineer vendor databases;
- label an incomplete tax return as filing-ready;
- silently ignore unsupported tax items;
- use real taxpayer data in tests.

---

# 104. CODING QUALITY REQUIREMENTS

Use:

- strict TypeScript;
- typed domain objects;
- testable services;
- small pure calculation functions;
- dependency injection where useful;
- database constraints;
- schema validation;
- migration discipline;
- clear error objects;
- clean UI components.

Avoid:

- `any`;
- duplicate tax formulas;
- business logic in presentation components;
- vendor logic in canonical domain code.

---

# 105. DOCUMENTATION REQUIREMENTS

Codex must maintain:

```text
README.md
docs/product-vision.md
docs/architecture.md
docs/canonical-tax-model.md
docs/json-import.md
docs/mapping-engine.md
docs/tax-engine.md
docs/form-rendering.md
docs/workpaper.md
docs/integrations.md
docs/security.md
docs/roadmap.md
```

The documentation must explain how a new developer can:

- add a source form;
- add a source box;
- add a tax year;
- add a calculation rule;
- add a Schedule;
- add a PDF form;
- add a vendor adapter;
- add a vendor field map.

---

# 106. README QUICK START

README must include:

```text
Prerequisites
Environment variables
Database creation
Migrations
Seed data
Run development server
Run tests
Generate JSON template
Import sample JSON
Run tax calculation
Generate workpaper
Generate draft return package
```

---

# 107. CODING APPROACH FOR CODEX

Codex should work milestone by milestone.

For every milestone:

1. inspect existing repository;
2. document assumptions;
3. implement smallest coherent vertical slice;
4. create migrations;
5. create tests;
6. run tests;
7. fix failures;
8. update docs;
9. provide a concise implementation summary.

Do not jump directly to complex tax forms before the canonical data foundation is stable.

---

# 108. INITIAL UI ACCEPTANCE STANDARD

Drake Tax is the primary workflow and data-presentation reference. Favor a compact preparer workspace, quick screen lookup, repeatable records, clear Calculate and View Return modes, persistent client/year context, traceable line review and visible diagnostics. ProConnect is a secondary reference for browser navigation and input-to-form review.

The visual target is a restrained desktop-style tax workstation: blue/navy commands, light gray chrome, white entry areas, thin borders, aligned amounts and compact section headers. The exact tokens in Section 115 are our proposed design, not a claim about Drake's proprietary color values or an exact replica of any vendor version.

Avoid oversized cards, excessive whitespace, decorative charts, hidden totals, hover-only commands and consumer interview screens as the main preparation flow. Keep an accessible comfortable-density option. Section 116 defines measurable task and screenshot acceptance tests; subjective resemblance alone is insufficient.

---

# 109. LONG-TERM NORTH STAR

The product should eventually allow the following workflow:

```text
Client Tax Documents
      ↓
ChatGPT creates canonical JSON
      ↓
Application imports all tax data
      ↓
Application identifies missing / inconsistent information
      ↓
Preparer maps source items to tax activities
      ↓
Application calculates return
      ↓
Application generates 1040 + schedules
      ↓
Application generates workpaper
      ↓
Reviewer reviews source-to-return reconciliation
      ↓
Application exports/synchronizes to professional tax software
      ↓
Application retrieves or imports professional software results
      ↓
Application compares both returns
      ↓
Differences are resolved
      ↓
Final filing workflow
```

The key strategic outcome is:

> **Enter tax data once, preserve the source once, calculate it deterministically, and reuse it everywhere.**

---

# 110. FINAL PRIORITY ORDER

Accuracy, security, no data loss and honest completeness are release gates; none can be traded away for appearance or speed. Within those gates, prioritize in this order:

1. **Accuracy**
2. **No data loss**
3. **Source traceability**
4. **Security and access isolation**
5. **Tax-year correctness**
6. **Reviewability**
7. **Extensibility**
8. **Deterministic calculations**
9. **Integration readiness**
10. **Speed**
11. **Visual polish**

---

# 111. FINAL INSTRUCTION TO CODEX

Treat this specification as the product north star.

Build the MVP narrowly enough to finish and test, but architect every major component so the platform can grow into:

- a full Form 1040 preparation engine;
- a source-to-return reconciliation system;
- a reviewer-ready workpaper platform;
- a filled federal tax form generator;
- a future multi-state engine;
- and an integration layer for CCH Axcess, Drake, and other professional tax software.

Do not fake unsupported functionality.

Where a tax treatment is not yet implemented:

- capture it;
- preserve it;
- map it;
- flag it;
- block draft review approval whenever applicability or tax effect is unresolved;
- and make the implementation status obvious.

The platform's canonical tax data must remain independent from ChatGPT, IRS PDF layout, CCH screen structure, Drake screen structure, and any one vendor.

That independence is what will allow this application to become the central tax-data operating platform over time.

---

# 112. PHASE 1 CAPABILITY CONTRACT

This matrix states required implementation scope, not current implementation status. Each capability must have separate capture, validation, calculation, PDF and test status. A planned capability remains disabled until its evidence passes. Structured capture is required for all five families; unknown boxes and unsupported document types can always be retained as source evidence without claiming normalization.

| Area | Phase 1 calculation boundary | Outside the boundary |
|---|---|---|
| Tax year / return | 2025 federal Form 1040 only | Other years/types retained only in explicitly unsupported workspaces; no reused 2025 rules |
| Filing profile | Single or MFJ, full-year U.S. resident, not claimable as a dependent, no dependents, under 65, not blind, no special filing elections | Other profiles may be captured; block complete calculation until implemented |
| W-2 | Ordinary Box 1 wages and Box 2 federal withholding; validated owner-specific wage facts needed for SE interactions | Special wage/tip treatment, allocated tips, statutory employee, dependent care, excess contributions or other triggered unsupported rules block |
| 1099-INT | Ordinary taxable interest, Treasury interest, tax-exempt reporting, federal withholding; supported Schedule B dependency | Bond premium, market discount, foreign tax, nominee adjustments and other special treatment block unless individually implemented |
| 1099-DIV | Ordinary dividends; qualified-dividend worksheet for verified eligible cases; exempt-interest reporting; withholding | Capital-gain distributions, basis distributions, foreign tax, special gains and other unsupported treatments block; ordinary and qualified amounts must not be double-counted |
| 1099-NEC/MISC | All boxes captured; confirmed eligible business receipts mapped to supported Schedule C activities; federal withholding counted once | Rentals, royalties outside the supported business case, farm, nonbusiness income and special tax character remain mapped but partial |
| Schedule C | Sole-owner cash-basis service activity, nonnegative profit, no inventory, assets, employees, home office, vehicle deduction, carryovers or special elections | Losses, joint ownership, QJV, statutory-employee business treatment, limitations or complex deductions block |
| Business expenses | Explicitly substantiated ordinary advertising, office expenses, supplies, eligible business insurance, qualifying professional fees, business rent, repairs and utilities; category definitions and eligibility validation required | Meals, travel, taxes/licenses, interest, compensation, benefits, depreciation and special categories remain capture-only initially unless separately scoped/tested |
| Schedule SE | Regular supported sole-proprietor case; aggregate by person across activities with that person's wage interaction; deductible portion | Optional methods, exemptions, special professions, foreign coverage and other special cases block |
| QBI | Simplified Form 8995 cases meeting all year-specific eligibility conditions; supported Schedule C and Section 199A dividend inputs with complete facts | Form 8995-A, PTP, cooperatives, carryovers, losses and other unimplemented cases block |
| Deductions | Standard deduction for the supported profile; deductible part of SE tax; simplified QBI | Itemizing, other adjustments and potentially applicable Schedule 1-A deductions block pending implementation |
| Tax and credits | Ordinary tax using the required year-specific method; supported qualified-dividend computation | Potentially applicable EITC even without children, other credits, AMT, NIIT, Additional Medicare Tax and other taxes block unless implemented or ruled out by tested eligibility screens |
| Payments | Federal withholding from active source records once | Estimated payments, extension payments, prior-year credit elect, refundable credits and penalties remain capture-only and block complete draft when applicable |
| Forms | 1040; supported portions of Schedules 1, 2, B, C, SE and Form 8995; required worksheets | Any required unsupported form makes the return partial |
| State/local | Lossless capture and workpaper display | No state/local calculation, filing, allocation or state-refund promise |
| Outputs | Draft return package, reviewer workpaper, complete/source-only JSON | No executable e-file payload or vendor-compatible export claim |

These boundaries are intentionally narrow. A case outside them remains useful for intake and reconciliation. It must never appear to be a fully supported return. Future expansion must update the matrix, eligibility rules, dependencies, fixtures, UI badges and output renderer together.

## Treatment decisions and materiality

Each populated field receives one disposition: consumed by an implemented rule; preserved as informational under a documented rule; explicitly excluded with substantiation; or unresolved/unsupported. Every disposition is versioned and reviewable. Unknown labels, unknown applicability and missing facts block completion until classified. “Not applicable” requires evidence and permission; “the engine does not support this” is never a valid exclusion reason.

Withholding has its own path to payments; splitting business receipts cannot split or duplicate withholding accidentally. Capture capability must not imply calculation coverage. Source fields without a numeric amount can still trigger mandatory forms or treatment.

---

# 113. REQUIRED INTAKE AND COMPLETENESS SCREENING

Five information-return families cannot establish that a complete taxpayer return has been captured. Add a compact professional intake checklist before a return may enter Ready for Review.

Store every answer as `yes`, `no`, or `unknown`, with respondent, evidence, date and revision. Unknown is not false. Importing an empty array does not answer a question. Permit efficient grouped entry without turning the main workspace into a consumer interview.

Required question groups:

- Identity and filing: legal name, DOB, address, residency/citizenship facts, marital status, filing-status eligibility, death, blindness, dependent/claimable status, spouse details and special elections.
- Income inventory: wages, self-employment, interest/dividends, investments/sales, retirement, Social Security, unemployment, rentals, farms, pass-throughs, foreign income, digital assets and other taxable receipts; unsupported documents can be attached and flagged.
- Deductions/credits: itemizing, dependents, education, childcare, retirement/HSA contributions, health coverage/Marketplace information, foreign tax, charitable activity and potential credits, including EITC without children.
- 2025 additions: potential qualified tips, qualified overtime, vehicle-loan interest and senior deduction; supplemental facts may be necessary beyond the five source forms. These are Schedule 1-A screening topics, not automatic entitlements. [2025 IRS instructions](https://www.irs.gov/instructions/i1040gi)
- Business: ownership, method, all receipts including receipts without a 1099, duplicate receipts in books, expenses, inventory/assets, losses, participation, QBI facts and prior carryovers.
- Payments/other: estimated and extension payments, prior-year overpayment applied, carryovers, prior-year return availability, foreign accounts/trusts, identity-protection information, other taxes and unresolved notices affecting preparation.

Create an expected-document checklist independent of received files. “Documents complete” requires a preparer attestation with evidence and explanation of missing/unavailable items. Do not automatically request sensitive facts that serve no Phase 1 purpose, such as bank credentials or an e-file signature PIN.

Each affirmative answer routes to an implemented rule or a blocking unsupported treatment. Negative answers used to rule out a dependency are part of the reproducible calculation snapshot. A later changed answer reopens the relevant checks.

---

# 114. TAX ENGINE DEPENDENCIES AND YEAR GOVERNANCE

## Dependency closure

Implement the whole supported path, not only the visible income line:

| Trigger | Required evaluated path |
|---|---|
| Supported business receipts | Schedule C → Schedule 1 income; owner-level Schedule SE → Schedule 2 tax and Schedule 1 adjustment; QBI eligibility → supported Form 8995 or blocker → 1040 |
| Interest/dividends | Tax-character classification → Schedule B requirement evaluation → appropriate 1040 lines and any qualified-dividend worksheet |
| Special source box or intake fact | Applicability assessment → required additional form/worksheet → implementation check or blocker |
| Withholding | Active source payment ledger → reconciliation → 1040 payments; independent of income allocation |

Schedule B is a conditional dependency in Phase 1, not wholly deferred. Include its non-amount questions; interest totals alone are not sufficient to assess all filing requirements. [IRS Schedule B instructions](https://www.irs.gov/instructions/i1040sb)

Compute regular SE tax using the applicable person-level aggregation and wage-base interactions, not a flat percentage of household business receipts. Spouses' data must remain distinguishable. [IRS Schedule SE instructions](https://www.irs.gov/instructions/i1040sse)

Simplified QBI is a dependency of the supported business slice, not a blanket 20% multiplication. Pin eligibility, adjustments, limitations and worksheet revisions; unsupported QBI facts block the draft. The IRS published a 2026 correction relevant to the 2025 Form 8995 instructions, so revision control must include post-publication corrections. [Form 8995 instructions](https://www.irs.gov/instructions/i8995), [IRS correction listing](https://www.irs.gov/forms-pubs/about-form-8995)

## Rule package contract

Every rule stores tax year, stable ID, version, effective revision, authoritative source URL/document revision, retrieval date, content hash, reviewer and test fixture IDs. Archive the approved public source documents with the rule package. Review changes before activation; do not fetch mutable thresholds during a calculation.

Use the IRS tax table or computation worksheet when prescribed, and the applicable preferential-income worksheet when needed. Merely applying marginal brackets is not an acceptable substitute for the mandated method. Follow documented form-level rounding order. [2025 IRS instructions](https://www.irs.gov/instructions/i1040gi)

Pin 2025 source-form layouts instead of trusting current-year URLs. For example, 2025 instructions moved excess golden parachute payment reporting to Form 1099-NEC Box 3. Preserve and block unsupported treatment rather than mapping this box to ordinary business receipts. [2025 IRS 1099-MISC/NEC instructions](https://www.irs.gov/pub/irs-prior/i1099mec--2025.pdf)

Use decimal arithmetic throughout. Store source cents separately from rounded output dollars. A trace includes operands, tax character, worksheet choice, rounding step, rule version, calculated result and any authorized override. Do not spread parallel formulas across the UI, database, PDF and workbook.

Dependency evaluation must terminate, detect cycles, record unsupported nodes and explain each missing result. Treat unchanged input under a changed rule package as a new calculation. Never replace old snapshots or silently recompute already-reviewed artifacts.

---

# 115. DRAKE-INSPIRED DESIGN SYSTEM AND SCREEN CONTRACT

## Reference hierarchy

Prioritize Drake Tax's professional entry/review workflow. Use ProConnect selectively for browser usability. Official Drake documentation describes input-source navigation, review flags that respond to changed values, and return-level search. These inform our interaction requirements; our component design and naming remain our own. [Drake review and troubleshooting](https://kb.drakesoftware.com/kb/Drake-Tax/17840.htm)

ProConnect documents separate input/review views and navigation from return lines to input. Use that as a secondary browser-workflow reference. [ProConnect input and review](https://accountants.intuit.com/support/en-us/help-article/tax-return/enter-tax-return-data-find-inputs-proconnect-tax/L2be1XcKB_US_en_US)

Do not claim pixel parity from public documentation alone. Validate the proposed design with preparers; exact comparison against a particular installed Drake version requires authorized reference screens. Avoid copied branding, assets and proprietary screen identifiers in the domain model.

## Proposed tokens

| Element | Default requirement |
|---|---|
| Palette | Navy `#17365D` main toolbar; blue `#245A81` actions/selection accents; workspace gray `#F2F4F7`; white entry surface; divider `#CBD2D9`; body text `#1F2937` |
| Status | Red error, amber warning, blue information, green verified; each also has text/icon and accessible contrast |
| Font | Segoe UI with system sans-serif fallback; body 14px; labels 13–14px; headings 16–18px; tabular numerals for financial data |
| Density | Compact rows 30–32px; inputs 32px; comfortable option 38–40px; no text shrinking to fit |
| Spacing | 4px base; 8px within groups; 12–16px between sections; thin borders; 2–4px corner radius |
| Navigation | Approximately 208px left rail; optional 220px source-instance list; resizable contextual pane; dimensions adapt to viewport |
| Interaction targets | At least 24×24 CSS px including hit area; comfortable mode uses larger controls |
| Form numbers | Right aligned and consistently formatted; cents in source entry; rounded dollars only where the output rule requires |
| Motion | Minimal functional transitions; respect reduced-motion preference; no decorative preparation animations |

Colors and dimensions are implementation defaults subject to accessibility verification. Use design tokens once across all screens. Test contrast rather than assuming a named color passes.

## Workspace layout

```text
┌ Firm | Client search | Environment | User ────────────────────────────┐
│ Client name / code | TAX YEAR 2025 | Filing status | Save state       │
│ Preparation status | Calculation revision | Blockers | Reviewer       │
├ Screen search | Add | Save | Calculate | View Return | Workpaper ────┤
│ GENERAL/INCOME │ W-2 instances │ Box-based entry      │ Source/Issues │
│ Forms tree    │ TP / SP        │ Payer + recipient   │ PDF page      │
│ Counts/status │ Payer / amount │ Federal/code rows   │ Provenance    │
│               │ Active item   │ State/local tables  │ Review notes  │
├─────────────────────────────────────────────────────────────────────┤
│ Saved revision | Calculation: Current/Partial/Stale | Help / keys    │
└─────────────────────────────────────────────────────────────────────┘
```

At 1366×768, show the primary navigation and entry area with the source pane switchable to a drawer; do not force four narrow panes. At 1920×1080, support side-by-side source and entry. Preserve panel sizes per user, never tax data in layout preferences. At high zoom or small screens, collapse panels and allow accessible scrolling without losing labels or commands. Mobile supports review; desktop remains the preparation target.

## Required screen patterns

- **Client manager:** dense sortable work queue; saved filters by year/preparer/reviewer/status; masked identifiers; visible blocker and freshness columns. Use a slim totals strip, not a grid of giant cards.
- **Data-entry menu:** grouped screen tree plus searchable name/number/alias; display record counts and completion badges. Aliases such as W2, INT, DIV, NEC, MISC, C and 1040 are navigation metadata only.
- **Source record:** stable payer/recipient header, TP/SP/Joint badge, record position, previous/next controls, box-aligned groups and repeatable code/state/local tables. “Duplicate” creates a new unverified record and warns about double counting.
- **Mapping:** source amount, allocated amount and remaining amount visible together; owner and destination stay visible while editing; unsupported destinations say Mapping Only.
- **Calculation results:** current run ID/time, known totals, missing dependencies, blocker counts and direct actions to the affected inputs. A run that completed technically can still be partial for tax purposes.
- **View Return:** form tree on left, selected form in center, source/trace panel on demand. Jump to the exact input and return to the same form/line/zoom. Display unavailable forms explicitly.
- **Review:** issue table with severity, code, owner, source, amount, assignee and status; filter by blockers; no need to open each row to understand the issue.
- **Workpapers/outputs:** generation history, current/stale badge, version manifest, download and regenerate; distinguish failure from empty output.

## Field presentation

Always display IRS box number and understandable label. Distinguish source values, computed read-only values, corrections and overrides with text/icon treatment. Required, unknown and unsupported states have separate meanings. Show contextual help with the applicable year and authoritative reference when maintained.

Blank means not entered; `0.00` means confirmed zero; a dash means not applicable and has an accessible label. Never use a dash for a failed calculation. Negative numbers use parentheses in display and accept a minus sign during entry. Preserve exact source precision and raw text when normalization occurs.

SSNs, TINs and bank fields follow permission-aware masking in both lists and panes. A screenshot-friendly mask mode covers all sensitive identity fields; export masking is a separate explicit choice.

---

# 116. KEYBOARD, ACCESSIBILITY AND VISUAL ACCEPTANCE

Required behavior:

1. Predictable Tab/Shift+Tab order within grouped entry; logical focus after adding/removing a row; focus returns to the invoking control after a dialog closes.
2. Screen search and primary commands available without mouse. Provide a visible shortcut reference. Select shortcuts after browser/OS conflict testing; do not intercept reserved browser keys globally.
3. Optional Enter-to-next-field applies only in eligible single-line entry fields. Enter must continue to work normally in multiline notes, buttons and autocomplete. Escape never silently discards saved data.
4. Numeric entry supports paste, decimals, negatives and clear validation. Reject ambiguous separators with explanation rather than silently changing the amount.
5. Save before Calculate/View Return with explicit validation feedback. A failed save blocks the action; an old result remains visibly stale.
6. Search finds screens, payer names and authorized current-return amounts without placing sensitive values in URLs, analytics or persistent search logs.
7. Meet WCAG 2.2 AA as a product target: semantic labels, announced errors/save status, visible focus, keyboard-operable tables/panes, contrast, reflow and no color-only meaning. Verify with automated checks and manual assistive-technology testing.

Visual acceptance set: client list, empty return, W-2 with all repeatable rows, INT/DIV with special boxes, mapping split, blocking diagnostics, source/PDF side-by-side, 1040 trace, changed reviewed value, stale export, save conflict and read-only role.

Capture stable synthetic screenshots at 1366×768 and 1920×1080, compact and comfortable density, and 200% zoom. Test reflow at 400% zoom where applicable. No clipped amounts, overlapping labels, hidden errors or inaccessible controls. Allow horizontal scrolling within genuinely wide data tables; do not make the whole application unnecessarily scroll sideways.

Task acceptance: a preparer opens a return, jumps to W-2, enters a second record, adds Box 12/state rows, saves, calculates, opens a diagnostic, fixes its field, traces 1040 wages, verifies the line and generates a workpaper. A reviewer completes the same trace without assistance. Record time, errors and navigation friction for at least three representative preparers; unresolved critical failures block UI acceptance. Vendor resemblance is assessed against the documented workflow goals, not an invented claim of exact equivalence.

---

# 117. CANONICAL DATA AND SAFE IMPORT CONTRACT

## Canonical representation

- Use immutable internal UUIDs scoped to firm/client/return; preserve external source IDs separately. Example IDs such as `w2_001` are not production primary keys.
- Taxpayer profiles are year-specific snapshots. Updating a current address or spouse relationship must not rewrite prior-year return facts.
- USD monetary values serialize as decimal strings (for example `"86000.00"`), with field-specific sign/scale constraints. Dates use ISO calendar dates; timestamps use UTC with local display; TINs and account numbers remain strings with leading zeros.
- Distinguish absent field, explicit null/unknown, confirmed zero and not-applicable disposition. In a merge, absent means no change; null proposes clearing a known field and requires preview acceptance. Empty arrays do not implicitly delete existing records.
- Field paths must use stable child-row IDs, not array positions. State/local association and source order are preserved; rows with the same jurisdiction are not automatically merged.
- Preserve raw import bytes, parsed raw fields, original labels and ordered repeated values alongside normalized facts. Malformed JSON remains a rejected/quarantined batch, not a committed return.
- Canonical export contains source facts, revisions, mappings and provenance; authoritative audit events and approvals are system-owned. Imported “approved,” “filed,” permissions or actor claims cannot grant authority. Preserve such external claims only as untrusted metadata.

Publish JSON Schema and application validation from one maintained contract, with automated equivalence checks. Breaking migration to decimal strings must use a new schema major version when accepting older numeric payloads; never relabel a breaking change as a patch. Abbreviated inherited examples are illustrative until generated from the final schema.

## Import transaction

1. Authorize the destination firm/client/year server-side. Validate size, nesting, record count, encoding, schema, references and year before producing a preview.
2. Stage and display differences against a recorded base revision. Low-confidence extracted facts are unverified regardless of the model's confidence label.
3. Match exact replays by batch hash/idempotency key; retain an import-attempt record and return the original commit result without duplication.
4. Match logical records by scoped external ID and correction lineage; fingerprints only suggest duplicates. Filename alone is never identity.
5. Explicitly resolve adds, changes, deletes, clearing values and conflicts with manual corrections. “Review Later” retains a pending proposal and leaves the effective value unchanged; it does not half-apply a record silently.
6. If the return changed after preview, rebase and show a new diff. Commit accepted changes, audit events, review issues and invalidation markers atomically.
7. A failed or cancelled commit has no partial effective mutation. A retry cannot repeat applied changes. Blob staging is cleaned by a safe reconciliation job because object storage is outside the database transaction.

Source deletion is an audited tombstone with impact preview, not hard deletion. Import rollback is a compensating revision; prevent it from overwriting later dependent edits. An exact export/import round trip into a fresh authorized workspace preserves values, ownership, child rows, raw fields and provenance relationships without importing trust or permissions.

---

# 118. SOURCE LIFECYCLE, EXTRACTION AND OWNERSHIP

Phase 1 includes encrypted source-file storage and a secure PDF/image viewer. External-only references must display `File not attached`; a filename is not proof that the source has been verified. Permit a documented manual attestation for legitimately unavailable originals, subject to reviewer acceptance.

Document identity and form-record identity are separate: one PDF can contain multiple forms and pages; one form can have supplemental pages. Store document checksum, media type, byte length, page count, upload actor/time, scan state, storage version and ordered page references. Preserve original files; transformed previews are derivatives. Optional extraction regions include page coordinate system and rotation so highlighting is reliable.

Support original, corrected, superseded, duplicate-excluded and void dispositions. Confirmation of a correction sets the effective version; do not sum original and corrected amounts. Retain both versions and reason, invalidate related mappings and review marks, and require reallocation when amounts change. A W-2c or other unsupported correction format can be attached but must block automated completeness until its corrected facts are reconciled; do not pretend it is a normal W-2.

Owner selection must resolve to year-specific person records. Joint investment information is included once under the supported return facts, not automatically split 50/50. Dependent income is not automatically included on a parent's return. Unsupported ownership/elections remain blocked.

The extraction workflow is optional and external in Phase 1: provide a clean template and human-reviewed import. No automatic transmission to ChatGPT or another AI service. The firm must configure an approved provider/workspace and permitted data-handling workflow before real documents are shared. Apply applicable disclosure/use requirements through the firm's reviewed policy. Imported document text and `_instructions` are data, never executable instructions, tool requests or permission grants.

Failed extraction, unreadable pages, mismatched year/recipient, missing pages and unverified material fields each create actionable issues. Low-confidence values cannot become verified simply through recalculation.

---

# 119. MAPPING, RECEIPTS AND RECONCILIATION INVARIANTS

For each allocatable source field:

`effective source amount = accepted allocations + explicitly substantiated exclusions + unresolved remainder`

Use decimal amounts as the authority. Percentage allocations produce a deterministic cent residual assigned to a disclosed selected row; never hide a rounding remainder. Validate allocation direction for signed fields; if negative correction treatment is unsupported, block rather than applying a positive-only rule incorrectly.

Reject over-allocation, cross-year references, cross-firm references, inactive sources and incompatible tax characters. An accepted mapping into an unsupported activity is still a calculation blocker. Deleting a destination requires remapping or a visible unresolved remainder. Source amount changes invalidate affected allocations; do not silently rescale approved mappings.

Schedule C gross receipts need a chosen reconciliation basis: (a) source 1099 receipts plus additional receipts explicitly excluding those sources, or (b) total books receipts with source forms reconciled as included evidence. These are mutually exclusive calculation paths for the same receipts. Record adjustments and explain differences; never add a books total to the same 1099 receipts twice. Phase 1 may implement only path (a), but must label the entry accordingly and reject ambiguous totals.

Withholding is reconciled to active source records, not to every allocation row. Joint ownership and payer duplicates cannot multiply payments. Non-taxable exclusions require facts, reason and review; they cannot be used as a substitute for missing engine support.

---

# 120. CONCURRENCY, REVIEW INVALIDATION AND DIAGNOSTICS

Every mutable return has a revision; every record has a version. Use optimistic concurrency checks on writes, imports, mappings, approvals and output publication. Two preparers editing the same field see a conflict with base/current/proposed values; never silent last-write-wins. Presence indicators are useful but are not the integrity mechanism.

Autosave is debounced and server-validated, with `Unsaved`, `Saving`, `Saved`, `Failed` and `Conflict` states. Failed saves retain the current in-memory edit and offer retry; navigation warns before abandoning it. Phase 1 does not promise offline editing or store tax data in browser local storage, service-worker caches or persisted query caches.

Calculation snapshots are immutable. If inputs change during a run, the completed historical run is retained but cannot be published as current. Jobs use idempotency keys, bounded retries, cancellation and a recoverable failure state. Review approval checks revision and permissions in the same transaction.

Field/line review states: Unreviewed, Verified, Flagged, Changed After Review. Record reviewer, time and the reviewed dependency hash. Any relevant source, mapping, rule or override change clears affected verification even if the rounded output remains the same. Preserve unaffected checks only where dependency analysis proves independence; otherwise invalidate conservatively.

Diagnostics require stable code, severity, affected record/field, explanation, resolution action, assignee, creation revision and resolution history. Separate human acknowledgment from machine resolution. Suppression is allowed only for designated non-blocking findings with reason and expiry/recheck policy. Technical failures, missing required facts, unsupported treatments and stale calculations cannot be dismissed into compliance. Re-evaluate after changes and avoid creating duplicate open issues for the same condition.

Drake's documented changed-value review behavior motivates this feature; the dependency-hash and concurrency rules above are our implementation requirements. [Drake review workflow](https://kb.drakesoftware.com/kb/Drake-Tax/17840.htm)

---

# 121. SECURITY AND DATA GOVERNANCE RELEASE CONTRACT

Assume a firm-scoped web application even if the pilot has one firm. Add Firm, Membership and ClientAssignment to the data model. Enforce authorization for every row, object, download, job, search, export and audit view. Never trust a firm ID supplied by the browser or import. Test direct-object access across clients, years and firms.

Require MFA for production staff access, secure session cookies, inactivity/absolute timeouts, revocation, rate limiting and no shared accounts. Reviewer approval is a distinct permission. The production default requires a second person for final draft review; any approved solo-practitioner policy must be explicit, audited and visually labelled self-review rather than independent review.

Use managed encryption keys and separate production secrets. Encrypt databases, source objects, exports and backups; restrict decryption access. Sensitive exports and identifier reveals require explicit actions, authorization and audit. Masking is not a substitute for server-side access control.

Serve source files through authorization-checked access with short-lived URLs or an authenticated proxy. Expired links fail closed. Validate extension, signature and MIME type; quarantine unsafe files and scan before preview. Isolate PDF rendering, disable active content, apply resource limits, sanitize names and block arbitrary remote URL fetching. Default pilot limits: 25 MiB per source file, 10 MiB JSON, 250 pages per document and 1,000 form records per import; make limits configurable and visible before upload.

Prevent injection in HTML, PDF and spreadsheet exports; treat strings beginning with spreadsheet formula characters as text unless they are application-generated formulas. Redact secrets and taxpayer values from logs, traces, URLs, notifications and error monitoring. Do not ship session replay or third-party analytics over tax-entry pages.

Set a documented retention schedule for originals, imports, returns, generated files, audits and backups, with legal hold, authorized deletion and backup expiry. Archive is not erasure. Do not hard-code a universal retention period in this specification. Audit history is append-only with restricted access and tamper detection; protected field changes belong in the secured record history rather than general logs.

Before real taxpayer use, assign a security owner, maintain an information-security plan and vendor inventory, assess provider data-use terms, test incident response, and resolve applicable tax-data disclosure and retention obligations. These are production release requirements; the application alone cannot establish firm compliance. IRS guidance and the FTC Safeguards Rule identify relevant obligations for tax practices. [IRS data protection guidance](https://www.irs.gov/tax-professionals/protect-your-clients-protect-yourself), [FTC Safeguards guidance](https://www.ftc.gov/business-guidance/resources/ftc-safeguards-rule-what-your-business-needs-know)

---

# 122. OPERATIONS, PERFORMANCE AND RECOVERY

Initial measurable engineering targets, to be confirmed on the pilot infrastructure:

| Operation | Acceptance target |
|---|---|
| Client search / typical list | p95 ≤ 1 second server response |
| Save a typical record | p95 ≤ 1 second server response, visible acknowledgment |
| Open a return | Usable primary content within 2 seconds on stated test network |
| Supported calculation, 100 source records | p95 ≤ 2 seconds excluding queue wait |
| Import preview, 1,000 source records | ≤ 10 seconds or background job with progress |
| Typical draft PDF/XLSX generation | ≤ 30 seconds; background status and retry on failure |
| Pilot workload | 10,000 clients, 25 concurrent staff, 100 source records per typical test return; additional maximum-size stress fixture |
| Recovery objective | RPO ≤ 1 hour; RTO ≤ 4 hours, demonstrated through a restore exercise |

Record hardware, browser, network, dataset and concurrency in results. These are targets, not measured claims or external SLAs.

Use separate development/staging/production environments; production never uses synthetic/demo engine fallbacks. Deploy versioned migrations with tested rollback/forward recovery; back up before destructive schema changes. Rule packages and PDF templates deploy as traceable artifacts with feature gates by tax year/capability.

Back up database and object storage with coherent version manifests. Test restoration of a return, its original sources, import history, mappings and exact calculation/output versions. A database-only backup is insufficient.

Monitor job failures, latency, authorization failures, storage/scan failures, stale outputs and rule-package activation without tax values. Provide runbooks for failed imports, broken output templates, calculation defects, suspected data exposure and recovery. A defective rule release can be disabled; identify affected runs/returns and reopen review rather than silently replacing numbers.

---

# 123. OUTPUT INTEGRITY AND REPRODUCIBILITY

All views, PDFs, JSON exports and workpapers derive from a named immutable input revision and calculation run. Store a manifest listing tax year, schema/rule/engine/template versions, required/rendered/missing forms, support status, input hash and generation status.

The workbook supplements the engine; it does not independently implement tax law. Use formulas for source subtotals and reconciliation, and export authoritative engine results with trace references. Editing a downloaded workbook does not update the application. Mark the cover accordingly and show the run ID on key sheets.

Add workbook sheets for unsupported treatments, manual corrections/overrides, required-form completeness and calculation provenance when relevant. All unknown fields must be available in a raw-field/detail appendix or linked canonical export. Reconcile every source amount and federal withholding total to the active records. Preserve textual identifiers and neutralize formula injection. Validate displayed/cached formula results in the selected spreadsheet library/viewer; if recalculation is required, disclose it and do not deliver blank or misleading totals.

PDF checks: correct year/revision; every required implemented page; no clipping or overwritten labels; negative amounts and blank/zero distinction; complete supporting statements; appropriate field length handling; page order; draft watermark; readable fonts; secure metadata. A partial package's cover names missing forms and affected results. Do not hide an ungenerated form simply because no renderer exists.

JSON export modes:

- Complete canonical: includes raw preserved data, provenance and revisions; sensitive export permission required.
- Source-only: facts and source metadata, with an explicit exclusion manifest for application workflow data.
- Blank template: no real client identifiers or return values by default.

Validate outputs programmatically and visually. Compare semantic content/hashes where PDF metadata prevents byte-identical reproduction; deterministic calculation results must remain exactly reproducible.

---

# 124. ACCEPTANCE SCENARIOS AND RELEASE GATES

Every capability row must reference a requirement ID, implementation module, automated test or manual evidence, approved rule version, owner and release status. Keep this traceability matrix in the repository; placeholders or “test later” do not pass.

| ID | Scenario | Required evidence/outcome |
|---|---|---|
| AC-01 | Supported Single wage/interest return | Verified intake; independently checked line values; current calculation; required forms; reviewed draft |
| AC-02 | MFJ with separate taxpayer/spouse W-2s | Correct ownership and withholding; no spouse cross-contamination; reviewable source trace |
| AC-03 | Five-form comprehensive import | Every year-defined box, code, repeated row and unknown label survives import/export with provenance |
| AC-04 | Special/unsupported source fact | Data retained; precise blocker; partial totals; approval disabled; partial-output cover |
| AC-05 | Exact replay and changed re-import | Replay adds nothing; changes require preview; manual corrections protected; accepted change invalidates stale review |
| AC-06 | Corrected, void and duplicate records | One effective treatment; full history; source/mapping/withholding totals do not double-count |
| AC-07 | Split allocation | Cent-perfect allocations; over/under-allocation, unsupported destinations and deleted activities handled correctly |
| AC-08 | Supported service business | Additional receipts not duplicated; owner-level SE; Schedule 1/2; eligible QBI; all required forms and worksheets |
| AC-09 | Preferential dividends and Schedule B | Correct classification and method; qualifying evidence; dependency questions; special unsupported boxes block |
| AC-10 | Tax boundary fixtures | Relevant year thresholds, tax-table bands, rounding edges, zero cases and owner-level wage interactions independently verified |
| AC-11 | Unknown completeness answers | Missing intake, possible credits/deductions and missing source evidence cannot pass as zero/not applicable |
| AC-12 | Two-user edit / stale preview | Conflict shown; no lost update; old calculation cannot become current; approval uses same revision |
| AC-13 | Changed reviewed value | Relevant fact/rule change reopens check even when rounded result is unchanged; historical mark retained |
| AC-14 | Role and firm isolation | API, download, job, search, export and direct-object attempts denied outside assigned scope |
| AC-15 | Malicious/oversized input | Quarantine or clear rejection; no partial mutation, code execution, injection or tax-data log leakage |
| AC-16 | Job failure/retry and recovery | No duplicate commit/artifact; accurate status; recoverable retry; database+object restore meets objectives |
| AC-17 | Output tie-out | Screen, engine, PDF, workpaper and canonical export agree by run; required-form manifest and watermark correct |
| AC-18 | Drake-inspired UI task | Section 116 screenshots and preparer task evidence; keyboard and assistive-technology checks pass |
| AC-19 | Rule/template update | Prior run reproducible; affected returns stale/reopened; unsupported package cannot be activated |
| AC-20 | No filing/integration false claims | No working transmit/configure action for unavailable capability; all Phase 1 returns visibly draft-only |

Use at least two separate demo returns: one entirely within the supported envelope that can reach Reviewed Draft, and one deliberately complex blocked return illustrating all five form families, mapping-only destinations, corrections and unresolved facts. The original mixed synthetic example alone is not proof of a successful supported return.

Tax fixtures must have independent expected results derived from approved year-specific instructions/worksheets and reviewed by a tax professional. Do not generate expected values with the same functions under test. A vendor comparison is supplementary and must use matched elections, tax year and version; investigate rather than blindly copy differences.

Release gates:

1. **Scope gate:** exact schema, intake questions, support matrix and rule sources approved for the pilot.
2. **Data gate:** all capture, provenance, round-trip, mapping and concurrent-write invariants pass.
3. **Calculation gate:** supported vertical slices and all dependent forms pass independent fixtures; unsupported cases block accurately.
4. **UI/review gate:** task flow, density, accessibility, freshness and review invalidation pass.
5. **Output gate:** visual inspection and line/source reconciliation pass for PDF and workbook.
6. **Production-data gate:** access isolation, encryption, MFA, scanning, retention policy, monitoring, recovery and operating ownership verified.

---

# 125. IMPLEMENTATION SEQUENCE AND DECISION REGISTER

Refine Section 102 into demonstrable vertical slices. Security and data integrity apply from the first slice, not only during final hardening.

1. Scope/rule registry, firm access, client/year snapshot, design tokens and compact workspace shell.
2. One W-2 from secure source upload through canonical import, source correction, trace, supported wage calculation, draft 1040 and audit.
3. Remaining four source families, full field-preservation tests, corrections, duplicate reconciliation and safe round-trip.
4. Supported INT/DIV dependency path and Schedule B/qualified-dividend review.
5. Mapping, supported Schedule C, person-level SE, Schedules 1/2 and simplified QBI as one complete business slice.
6. Review workflow, invalidation, immutable outputs, workpaper tie-out and failure recovery.
7. Performance, accessibility, preparer acceptance, security/recovery gates and pilot documentation.
8. Mock vendor adapter contracts and future roadmap only; no live integration credentials or sync needed for Phase 1.

| Decision | Working default in this revision | Resolution needed before |
|---|---|---|
| Initial mode | Draft preparation/review pilot | Scope gate |
| Tax-year and filing profiles | 2025, narrow Single/MFJ envelope in Section 112 | Rule-package approval |
| Drake reference | Drake desktop workflow; our blue/gray design tokens | Visual acceptance; exact vendor screenshots if pixel comparison requested |
| Hosting/identity/storage | Preferred stack retained; managed providers selected by implementation owner | Real taxpayer data |
| Approved external AI workflow | No automatic upload; firm-approved process only | Sharing real source data externally |
| Tax rule owner | Named qualified tax reviewer required | Calculation gate |
| Reviewer separation | Independent reviewer by default | First draft approval |
| Retention/residency/incident process | Firm-specific reviewed policy | Production-data gate |
| Recovery/performance objectives | Targets in Section 122 | Infrastructure acceptance |

Unresolved decisions must have an owner and date in the project register. Synthetic-data development may proceed under these documented defaults; unresolved production dependencies must not be replaced with fake working features.

---

# 126. DEFINITION OF COVERAGE AND CHANGE CONTROL

“Covers all aspects” means the product has explicit, testable treatment for every fact it encounters: supported end-to-end, preserved and blocked, or substantiated as not applicable. It does not mean Phase 1 implements every U.S. tax situation or matches every Drake/ProConnect capability.

Before adding a tax form or feature, update intake, canonical schema, validation, ownership, dependencies, mappings, calculations, review invalidation, UI, PDF, workpaper, export, security implications, fixture coverage and support matrix. A source-entry screen alone is not a completed tax feature.

Remove ambiguous qualifiers such as “basic,” “where applicable,” and “future-friendly” from implementation tickets by naming the supported facts and acceptance test. In this master document those phrases are bounded by Sections 112–124. Any exception must appear as a versioned scope change with affected tests and release notes.

---

# 127. REVISION SUMMARY

| Original loose end | Resolution in this revision |
|---|---|
| Draft output alongside filing-ready/Filed states | One draft-only Phase 1 policy and guarded review states |
| Unbounded “basic” 1040 and Schedule C scope | Explicit supported profile, field treatment and dependency matrix |
| QBI and supporting schedules deferred despite business/investment inputs | Limited dependencies promoted into their supported vertical slices |
| 2025 rules discussed without change-control detail | Revision-pinned authorities, correction tracking and unsupported-case screens |
| Drake/ProConnect mentioned mainly as integrations | Drake-primary workstation design, tokens, screen patterns and user acceptance |
| Source viewer/storage deferred despite provenance promise | Secure uploads, page references, viewer, verification and missing-file semantics |
| Inconsistent status lists and unrestricted overrides | Separate state dimensions, guarded transitions and constrained overrides |
| JSON values/merges and correction identity underspecified | Decimal contract, null/delete semantics, staged versioned import and effective-source lineage |
| “Material” omissions left to interpretation | Unresolved applicability blocks; no automatic dollar-based waiver |
| Concurrency and stale approval absent | Version checks, immutable runs, dependency-based re-review |
| Security list without operational evidence | Firm isolation, MFA, file quarantine, recovery, retention and release gates |
| MVP definition mostly feature checklist | Independent tax fixtures and 20 end-to-end acceptance scenarios |

This is a specification review, not an application audit or tax-engine certification. No repository, implemented screens or calculation outputs were supplied or tested. Exact visual matching still requires implemented UI and preparer acceptance evidence.

---

# 128. AUTHORITATIVE REFERENCE REGISTER

References consulted for this revision on October 6, 2026. Public pages may change; implementation must pin approved year/revision artifacts and verify corrections. Vendor references support workflow choices, not a claim of identical product behavior or integration access.

| Ref | Source | Purpose |
|---|---|---|
| R1 | [Drake Tax product overview](https://www.drakesoftware.com/products/drake-tax/) | Professional preparation and return-view context |
| R2 | [Drake return troubleshooting](https://kb.drakesoftware.com/kb/Drake-Tax/17840.htm) | Input links, review flags, search, field help |
| R3 | [Drake shortcut list](https://kb.drakesoftware.com/KB/Drake-Tax/12130.htm) | Keyboard-oriented workflow reference; browser bindings must be tested independently |
| R4 | [ProConnect input and review](https://accountants.intuit.com/support/en-us/help-article/tax-return/enter-tax-return-data-find-inputs-proconnect-tax/L2be1XcKB_US_en_US) | Secondary input-to-return navigation reference |
| R5 | [IRS 2025 Form 1040 instructions](https://www.irs.gov/instructions/i1040gi) | Year-specific tax methods and Schedule 1-A screening |
| R6 | [IRS 2025 Schedule SE instructions](https://www.irs.gov/instructions/i1040sse) | SE dependency research |
| R7 | [IRS 2025 Schedule B instructions](https://www.irs.gov/instructions/i1040sb) | Conditional supporting-form requirements |
| R8 | [IRS 2025 Form 8995 instructions](https://www.irs.gov/instructions/i8995) and [correction listing](https://www.irs.gov/forms-pubs/about-form-8995) | QBI scope and revision control |
| R9 | [IRS archived 2025 1099-MISC/NEC instructions](https://www.irs.gov/pub/irs-prior/i1099mec--2025.pdf) | Source-form revision example |
| R10 | [IRS Protect your clients](https://www.irs.gov/tax-professionals/protect-your-clients-protect-yourself) | Tax-practice information protection |
| R11 | [FTC Safeguards Rule guidance](https://www.ftc.gov/business-guidance/resources/ftc-safeguards-rule-what-your-business-needs-know) | Security program and service-provider governance context |

The narrow calculation envelope, design tokens, performance targets, data contracts and acceptance scenarios are proposed product requirements from this review. They are not vendor specifications or a substitute for implementation-time tax-rule validation.
