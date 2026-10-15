# Preparer Workbench Parity Ledger

**Program:** [`drake-inspired-preparer-workspace-plan.md`](./drake-inspired-preparer-workspace-plan.md)  
**Established:** October 15, 2026  
**Rule:** A workbench link is not parity by itself. The existing persisted component remains the entry canvas until its fields, actions, authorization, validation, history and output effects are proven unchanged.

## 1. Data-loading and security boundary

| Concern | Boundary retained in the workbench |
|---|---|
| Authentication and firm/client assignment | The server layout calls `requestAuthorizationContext` and `getTaxYearWorkspace`; unauthorized client years return not found before the workbench renders. |
| Tax input | Existing server pages still load their current guarded service and render the same persisted editor component. The workbench does not copy tax values into a second client-side model. |
| Mutation | Existing APIs, same-origin checks, role checks, optimistic tax-year revisions, record versions, invalidation and audit events remain authoritative. |
| Diagnostics | The context panel reads the existing authorized review API. It cannot acknowledge or clear a finding. |
| Sources | The context panel initially loads metadata only. Encrypted source bytes are requested only from the existing authorized download endpoint after the preparer selects **View source**. |
| Calculation | The global command opens the existing calculation screen; calculation execution still requires the guarded API and expected revision. |
| Outputs | The global command opens the existing artifact center; draft, client-copy, sensitive-export and filing-disabled controls remain unchanged. |
| Preferences | Density, pane widths, bookmarks, recents, tour state and classic mode are stored under a one-way firm/user scope hash. They contain no tax values or protected identifiers. |
| Safe drafts | Reusable session-draft support is restricted to explicitly marked non-sensitive fields. Existing tax inputs are not silently copied into browser storage. |

## 2. Route and action parity

| Existing route | Persisted component | Workbench destinations | Primary actions retained | Guarded API/service | Parity status |
|---|---|---|---|---|---|
| return root | `PersistedTaxYearWorkspace` | Return overview | JSON template, JSON import, every workflow route | workspace repository | Integrated; classic hub retained |
| `taxpayer-profile` | `PersistedPeople` | Taxpayer and spouse | Add spouse, edit identity/address, save taxpayer/spouse | people role API | Integrated unchanged |
| `return-profile` | `PersistedReturnProfile` | Filing status, dependents, standard deduction, Schedule A | Five statuses, dependency facts, add/remove dependent, itemized deductions, save | return-profile API | Integrated unchanged; stable section anchors added |
| `intake` | `PersistedIntake` | Intake and completeness | Eligibility answers, expected documents, evidence, attestation | intake APIs | Integrated unchanged |
| `sources` | `PersistedSources` | Source documents | Upload/scan, integrity state, authorized view | source APIs | Integrated unchanged; metadata context added |
| `source-entry` | `RegistrySourceEntry` | Income topics and typed source entry | Manual record creation, every registered field, repeatable rows, correction evidence, save correction | source-record APIs | Integrated unchanged; form query opens requested family |
| `source-records` | `PersistedSourceRecords` | Corrections and lineage | Correct, void, duplicate-exclude, evidence and immutable history | source-record APIs | Integrated unchanged |
| `imports` | `PersistedImports` | JSON import | Download templates, stage, decide, commit, history, rollback, manual-edit links | import APIs | Integrated unchanged |
| `mapping` | `PersistedMapping` | Mapping center | Activity creation, allocation, reconciliation, reviewer exclusion | mapping APIs | Integrated unchanged |
| `activities` | `PersistedActivities` | Schedule C, E and F | Create/select/deactivate activity, all schedule inputs, assets, loss ledgers, save reason/history | activity APIs | Integrated unchanged; schedule query opens requested activity type |
| `credits` | `PersistedFederalCredits` | EITC, dependent care, education | Enable interview, repeatable children/providers/students, save | credit API | Integrated unchanged; stable credit anchors added |
| `advanced` | `PersistedAdvancedFederal` | Due diligence, PTC, adjustments, other taxes, payments, package | Section editing, JSON detail, save, immutable Form 8867 certification | advanced APIs | Integrated unchanged; section query opens requested module |
| `review` | `PersistedReview` | Diagnostics and review points | Create/assign/wait/resolve point, request changes, audit history | review APIs | Integrated unchanged; actionable read-only context added |
| `overrides` | `PersistedOverrides` | Governed overrides | Request, independently decide and revert registered override | override APIs | Integrated unchanged |
| `calculation/summary` | `PersistedCalculation` | Calculation and line trace | Calculate current revision, inspect totals/trace/manifest/diagnostics | calculation API | Integrated unchanged; read-only trace context added |
| `outputs` | `PersistedOutputs` | Forms and output center | Generate, monitor, retry and download draft PDF/XLSX/JSON | output APIs | Integrated unchanged |

## 3. Field-family parity

| Field family | Existing implementation retained | Workbench input standard |
|---|---|---|
| Currency and signed tax amounts | Decimal strings and existing domain normalization | Right alignment, decimal keyboard, blur formatting; reusable component never performs tax calculation |
| Counts, months and percentages | Existing schema bounds | Explicit unit plus bounded number control |
| Yes / No / Unknown | Existing nullable-boolean and reviewed-state fields | Three-state control retains unknown as a first-class blocking state |
| Dates | Existing ISO date contracts | Labeled keyboard-operable date control |
| SSN, EIN and account identifiers | Existing masked/reveal permissions | Masked by default; reveal button appears only when permission is present |
| Filing statuses and tax codes | Existing enumerations and year registries | Plain-language select/search with official form references secondary |
| Repeatable records | Existing stable IDs, immutable versions and row APIs | Compact grids retain add/remove/correct/void evidence actions |
| Evidence and notes | Existing source IDs, evidence references and preparer notes | Context panel keeps evidence near the affected workflow without duplicating it |

## 4. Fast-access catalog coverage

The catalog contains 38 searchable topics across client setup, income, adjustments, deductions, credits, other taxes, payments, sources, review and outputs. Search keys include common preparer language and official references including W-2, the supported 1099 families, Schedules A/B/C/D/E/F/SE/EIC/1/2/3, and Forms 2441, 4562, 5329, 6198, 6251, 8582, 8606, 8812, 8829, 8863, 8867, 8889, 8949, 8959, 8960, 8962, 8995 and 8995-A.

## 5. Baseline task paths

| Representative task | Classic path | Workbench path | Acceptance target |
|---|---|---|---|
| Open/create a client and tax year | Clients → client → year | Same global path; workbench starts at the year | No added authorization or mutation |
| Enter a W-2 manually | Return hub → Typed source entry → create/select W-2 | `Ctrl/⌘ K` → W-2 wages → create/select W-2 | Topic found in ≤10 seconds; all registry fields retained |
| Import and edit JSON | Return hub → JSON import → preview/commit → hub → editor | Return tree → JSON import → preview/commit → tree/search → editor | No extra hub round trip; identical import and record versions |
| Enter Schedule C | Return hub → activities → select Schedule C | `Ctrl/⌘ K` → Schedule C businesses | Requested activity type selected; all lines and history retained |
| Resolve a blocker | Return hub → review → interpret path → relevant screen | Context issue → exact topic/field when identifiable | Every issue links to a field/topic or says no direct field exists |
| Calculate | Return hub → calculation → calculate | Global Calculate from any topic | Same guarded calculation API and result hash |
| Generate outputs | Return hub → outputs | Global Forms & outputs from any topic | Same current/stale state, bytes, hashes and filing restrictions |

Task timing and usability ratings require representative human preparers and are recorded through the existing manual-acceptance workspace. Automated tests verify reachability and keyboard mechanics but do not manufacture human evidence.

## 6. Rollout and rollback

- `PREPARER_WORKBENCH_ENABLED=false` disables the server workbench wrapper and restores the classic application shell.
- Each user can choose **Classic page view** without changing another firm/user's preference.
- Existing URLs remain canonical and bookmarkable. The workbench adds query parameters and anchors only to select a module or field.
- No database migration is required.
- Legacy components may be removed only after the manual acceptance gate and product-owner default-rollout approval are recorded.

## 7. Technical verification record

Recorded October 15, 2026 against Node 24.19.0 and PostgreSQL 16 using synthetic data:

| Evidence | Result |
|---|---|
| Type safety | `npm run typecheck` passed. |
| Unit and database integration | 25 files / 174 tests passed against a clean local PostgreSQL database, including navigation read-only identity and all existing calculation/import/output regressions. |
| Production build | Next.js 16.3.8 Turbopack production build passed with all dynamic and static routes generated. |
| Chromium end to end | 47/47 tests passed from a clean migrated/seeded database, including 22 WCAG A/AA route scans, keyboard search, remembered topics, pane controls, source-byte deferral, mobile drawers, effective-200%-viewport behavior and visual baselines. |
| Safari-compatible engine | The four focused workbench workflows passed in Playwright WebKit 26.6. |
| Microsoft Edge | The same four focused workflows passed in Microsoft Edge stable. |
| Visual regression | The new persisted-workbench baseline and all existing baselines passed with animations disabled and the repository's 2% maximum pixel-difference threshold. |
| Performance | Passed the existing 10,000-client/25-concurrent-user exercise: client list p95 379.60 ms, search 42.24 ms, open return 4.22 ms, 100-record calculation 2.83 ms and 1,000-record import preview 36.65 ms. |

Independent screen-reader use, representative-preparer task timing/confidence and product-owner rollout approval are intentionally not marked complete by automated evidence. Record those results through the governed manual-acceptance workspace before changing the Phase 8 checkbox or removing the classic fallback.
