# Drake-Inspired Preparer Workspace — UI/UX Simplification Plan

**Status:** Technical implementation complete; independent human acceptance and default-rollout approval pending
**Created:** October 14, 2026  
**Scope:** Simplify access to every existing federal input, processing, review and output workflow without removing or weakening current functionality  
**Design intent:** Provide the speed, density and predictable navigation professional preparers expect from desktop tax software while retaining the Nexus identity and avoiding a pixel-for-pixel copy of Drake Tax branding, proprietary artwork or trade dress

## 1. Outcome

Replace the current card-to-page experience with a single, understandable **Return Workbench**. A preparer should be able to open a client, find any supported form or topic, enter or edit data, see its source and validation state, calculate the return, resolve diagnostics and inspect draft forms without repeatedly returning to a hub.

This is a presentation and workflow program. It does not replace the canonical data model, tax engine, guarded APIs, optimistic revisions, audit history, calculation traces, output controls or authorization rules already implemented.

## 2. Non-negotiable safeguards

- Preserve every existing route, feature, field, validation rule, API, database record and calculation behavior until the replacement has proven parity.
- Do not delete or rewrite existing tax data during navigation or screen migration.
- Keep manual entry and canonical JSON import equally editable through the same persisted records.
- Continue to distinguish imported, manually entered, calculated, overridden and source-supported values.
- Keep unsupported facts and incomplete interviews visible and blocking; simplicity must never hide a tax limitation.
- Keep all generated filing forms visibly draft-only until the existing approval gates permit otherwise.
- Preserve firm, assignment, role, MFA, same-origin, rate-limit and sensitive-data controls.
- Do not introduce state-return entry in this program; state and local tax calculation remains deferred.
- Use Nexus names, colors and components. Reproduce useful interaction patterns, not another vendor's protected branding or exact visual design.

## 3. Target experience

### 3.1 Return Workbench layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Nexus Tax | Client / Year | Return status | Save state | Calculate | Search │
├──────────────────┬───────────────────────────────────┬───────────────────────┤
│ RETURN TREE      │ ENTRY CANVAS                      │ CONTEXT PANEL         │
│                  │                                   │                       │
│ Client           │ Topic/form title                  │ Diagnostics           │
│ Filing & people  │ Short instructions                │ Source preview        │
│ Income           │ Line-oriented input sections      │ Line calculation      │
│ Adjustments      │ Repeatable tables where needed    │ Notes and provenance  │
│ Deductions       │ Inline validation and help        │                       │
│ Credits          │                                   │                       │
│ Other taxes      │                                   │                       │
│ Payments         │                                   │                       │
│ Review           │                                   │                       │
│ Forms & outputs  │                                   │                       │
├──────────────────┴───────────────────────────────────┴───────────────────────┤
│ Revision | Autosave/unsaved state | Blockers | Warnings | Calculation state │
└──────────────────────────────────────────────────────────────────────────────┘
```

The left tree answers **where am I?**, the center answers **what can I enter?**, and the right panel answers **what supports or blocks this value?** The workbench retains a stable client/year context at all times.

### 3.2 Return tree

The return tree will use plain-language topics with form references as secondary labels:

1. Client and return setup
   - Taxpayer and spouse
   - Filing status
   - Dependents
   - Intake and completeness
2. Income
   - W-2 wages
   - Interest and dividends
   - Capital transactions
   - Retirement distributions
   - Social Security benefits
   - Unemployment and other income
   - Schedule C businesses
   - Schedule E rentals, royalties and K-1s
   - Schedule F farms
3. Adjustments
   - Educator expenses
   - IRA and student-loan deductions
   - HSA / Form 8889
   - Self-employed health insurance and retirement
4. Deductions
   - Standard deduction facts
   - Schedule A itemized deductions
5. Credits
   - Child and other dependent credits
   - EITC / Schedule EIC
   - Child and dependent care / Form 2441
   - Education / Form 8863
   - Premium Tax Credit / Form 8962
6. Other taxes
   - AMT / Form 6251
   - Additional Medicare Tax / Form 8959
   - NIIT / Form 8960
   - Retirement and other supported taxes
7. Payments
   - Withholding
   - Estimated and extension payments
   - Prior-year overpayment and refundable items
8. Sources and reconciliation
   - Source documents
   - Typed source entry
   - Corrections and lineage
   - JSON import
   - Mapping center
9. Review
   - Diagnostics
   - Form 8867 due diligence
   - Assigned review points
   - Governed overrides
   - Calculation trace
10. Forms and outputs
    - Form and schedule preview
    - PDF package
    - Excel workpaper
    - JSON export

Each node will display a text-and-icon state: not started, in progress, complete, warning, blocking or stale. Color alone will never carry meaning.

### 3.3 Fast access

- Add one **Open form or topic** command palette, available from the top bar and `Ctrl/Cmd+K` within a return.
- Search by common term, official form number, source-form name, return line and supported synonym.
- Keep global client search separate from return-form search and clearly label the current search mode.
- Provide keyboard shortcuts for save, calculate, diagnostics, next error, previous error, source preview and forms preview.
- Preserve deep links to every existing screen and add stable workbench links for every tree node.
- Restore the last visited topic for a client/year without bypassing current authorization.
- Provide recent and bookmarked topics for large returns.

## 4. Input interaction standard

Every migrated input will use a small set of consistent controls:

| Data type | Standard interaction |
|---|---|
| Currency | Right-aligned decimal-safe input, formatted on blur, negative-value rules shown inline |
| Count / percentage | Numeric input with explicit unit and valid range |
| Yes / No / Unknown | Three-state control when tax completeness requires an unknown state |
| Date | Keyboard-friendly masked field plus accessible date assistance |
| SSN / EIN / account | Masked by default, permission-controlled reveal, never placed in URLs |
| Filing status / code | Searchable select with a short plain-language explanation |
| Repeated forms | Compact grid with add, duplicate, correct, void and inspect-source actions |
| Long interviews | Short sections with progress and unresolved-answer count, not one oversized page |
| Evidence / notes | Linked source, evidence reference and preparer note kept adjacent to the affected fact |

Additional rules:

- Labels remain visible; placeholders do not substitute for labels.
- Show the tax-year form/line reference as supporting text, not as the only label.
- Mark required, unsupported, calculated, overridden and source-derived states in both text and iconography.
- Keep imported data fully editable through the existing guarded correction flow.
- Show who/what last changed a value and the effective revision on demand.
- Use inline errors for the affected field and a page-level error summary that moves focus to the field.
- Distinguish a blocking error, review warning, informational note and tax-planning suggestion.
- Use expandable help for uncommon concepts; common fields stay compact.
- Keep destructive actions explicit, reasoned and confirmable. Never make delete/void the default row action.

## 5. Navigation and route migration

The new workbench will initially compose the existing persisted components and APIs. Current URLs remain supported while new workbench topic URLs become the preferred navigation.

| Existing surface | Workbench destination |
|---|---|
| `/taxpayer-profile` | Client and return setup → Taxpayer and spouse |
| `/return-profile` | Filing and people; Deductions → Schedule A |
| `/intake` | Client and return setup → Intake and completeness |
| `/sources` | Sources and reconciliation → Source documents |
| `/source-entry` | Income or Sources → Typed source entry |
| `/source-records` | Sources and reconciliation → Corrections and lineage |
| `/imports` | Sources and reconciliation → JSON import |
| `/mapping` | Sources and reconciliation → Mapping center |
| `/activities` | Income → Schedule C, E and F |
| `/credits` | Credits → applicable interview/form |
| `/advanced` | Adjustments, Other taxes, Payments and due diligence |
| `/review` | Review → Diagnostics and review points |
| `/overrides` | Review → Governed overrides |
| `/calculation/summary` | Review → Calculation trace |
| `/outputs` | Forms and outputs |

No legacy screen will be removed until field, action, authorization, validation, history and automated-test parity are documented for its replacement.

## 6. Responsive and accessibility behavior

- Desktop widths use all three panes; preparers may resize or collapse the tree and context panel.
- Tablet widths keep the entry canvas visible and expose tree/context as labeled drawers.
- Small screens support review and limited entry, but the interface must clearly identify grids that are more efficient on a larger screen.
- Meet WCAG 2.2 AA for contrast, names, roles, focus, zoom, reflow and error handling.
- Support complete keyboard navigation with a logical focus order and no keyboard traps.
- Retain skip navigation, visible focus, reduced-motion support and screen-reader status announcements.
- Validate at 200% browser zoom and with representative screen-reader/keyboard sessions.
- Compact and comfortable density settings must retain identical content and controls.

## 7. Implementation phases

### Implementation record — October 15, 2026

| Phase | Technical status | Implemented result |
|---|---|---|
| 0 | Complete | The route/action/field-family parity ledger, classic/workbench task paths, protected data-loading boundaries and automated visual/accessibility baseline are recorded in [`preparer-workbench-parity-ledger.md`](./preparer-workbench-parity-ledger.md). Human timing and confidence measurements remain part of controlled Phase 8 acceptance rather than invented evidence. |
| 1 | Complete | The feature-flagged, authorization-preserving three-pane Return Workbench provides stable route links, browser navigation, remembered topics, resizable panes, mobile drawers and a one-click classic fallback. Navigation has a database test proving it does not mutate revision or calculation identity. |
| 2 | Complete | Form/topic search covers common names, form numbers and synonyms; keyboard save/calculate/context/output, next/previous diagnostic and pane-navigation commands are documented in an accessible shortcut dialog; recent and bookmarked topics are scoped per firm/user. |
| 3 | Complete | Shared currency, bounded-number, date, tri-state, protected-identifier and explicitly non-sensitive session-draft primitives are implemented with formatting/security tests. Existing persisted editors and their optimistic conflict handling remain authoritative during the compatibility period. |
| 4 | Complete | Every current federal persisted editor is composed into the workbench by the route mapping below. Query/anchor deep links select source families, Schedule C/E/F, credit sections and advanced modules while retaining manual/import editing, validation, audit history and invalidation behavior. |
| 5 | Complete | The context panel reads current diagnostics, review points, source metadata/mappings, explicit source previews, calculation trace and audit history. Diagnostic links select a topic and request field focus; when no direct control exists, the live region says that the topic was opened without claiming an exact field jump. |
| 6 | Complete | Calculate, diagnostics and the draft output center are available from every topic. The existing guarded calculation, PDF/XLSX/JSON generation, hashes, current/stale status and draft-only filing controls are unchanged. |
| 7 | Complete | First-use help, searchable form/topic reference, shortcut help, compact/comfortable density, pane sizes, collapse state, bookmarks, recents and classic mode are implemented without storing tax values in browser preferences. |
| 8 | Technical suite complete; external gate pending | Unit/integration, production build, Chromium end-to-end/accessibility/visual, effective-200%-viewport, browser-compatibility and performance evidence is recorded in the parity ledger. The manual screen-reader and representative-preparer sessions and product-owner sign-off must still be recorded through Administration → Release closure before legacy removal or filing-readiness claims. |

### Phase 0 — Inventory and baseline

- Build a field-and-action parity ledger for every existing persisted screen.
- Record current task paths for client creation, manual W-2 entry, JSON import/edit, Schedule C entry, calculation, blocker resolution and output generation.
- Capture baseline task time, click/key count, errors, accessibility results and representative screenshots.
- Identify shared data-loading boundaries so the workbench does not duplicate protected tax data in the browser.

**Exit gate:** Every current field, command, state and route has an owner and a proposed workbench destination; baseline automated tests remain green.

### Phase 1 — Workbench foundation

- Add the return-context header, hierarchical return tree, resizable entry canvas, optional context panel and persistent status bar.
- Add stable topic routing, back/forward behavior, last-topic restoration and responsive pane behavior.
- Add a feature flag and user preference so the current workspace remains available during validation.
- Reuse current server authorization and route guards without broadening access.

**Exit gate:** A user can navigate all existing pages from the workbench shell, direct links and browser history work, and no data is mutated by navigation.

### Phase 2 — Search and keyboard workflow

- Add the form/topic command palette and indexed form/line/synonym catalog.
- Add documented keyboard shortcuts, next/previous diagnostic navigation and focus restoration.
- Add recent/bookmarked topics and an accessible shortcut reference.

**Exit gate:** A keyboard-only user can open any supported topic, move through entry fields, find diagnostics and return to the originating field.

### Phase 3 — Shared entry components

- Implement the standardized currency, count, date, masked identifier, code/select, tri-state, evidence, help and repeatable-grid controls.
- Implement consistent dirty, saving, saved, conflict and stale states using existing optimistic revisions.
- Add safe local draft recovery for interrupted edits; high-impact actions still require explicit confirmation.
- Add provenance and revision detail without exposing sensitive values in logs or URLs.

**Exit gate:** Component tests cover format, validation, accessibility, keyboard behavior, conflicts and protected identifiers; no tax rounding or persistence behavior changes.

### Phase 4 — Core return entry migration

Migrate in risk-controlled slices:

1. Taxpayer, spouse, filing status and dependents.
2. W-2 and common 1099 source entry.
3. Schedule A, adjustments and payments.
4. Schedule C, E and F activities.
5. Credits and due-diligence interviews.
6. Advanced federal modules and less-common source records.

For every slice, retain manual entry, JSON import/edit, source provenance, correction lineage, immutable history and calculation invalidation.

**Exit gate:** The parity ledger is complete for each migrated slice and its old page remains available until browser and human acceptance pass.

### Phase 5 — Context, source and diagnostics panel

- Show field-related diagnostics, source preview, mapped destination, preparer note, supporting evidence and calculation trace in context.
- Make each diagnostic actionable: selecting it opens the exact topic, section and field.
- Provide an all-diagnostics view with filters for blocking, warning, stale, assigned and resolved items.
- Never permit the panel to clear a blocker without satisfying the existing domain rule.

**Exit gate:** Every machine blocker and review point links to an actionable location or explicitly explains why no input can resolve it.

### Phase 6 — Calculation, forms and output center

- Keep calculate available from every workbench topic with clear running, blocked, current and stale states.
- Present the tax summary and line trace without suggesting unapproved rules are filing-ready.
- Link calculated lines to their inputs and draft form pages where supported.
- Consolidate PDF, XLSX and JSON generation/history into one output center with current/stale and internal/client-copy labels.

**Exit gate:** Golden-return values, required forms, package order, workpaper tie-outs and artifact hashes are unchanged by the UI migration.

### Phase 7 — Onboarding, preferences and clarity

- Add a short first-use tour focused on the tree, search, diagnostics, calculate and outputs.
- Add contextual help and a searchable shortcut/form reference.
- Persist density, pane and shortcut preferences per user without mixing preferences across firms.
- Replace technical implementation language in routine screens with preparer-friendly wording while retaining precise detail on demand.

**Exit gate:** New and experienced preparers can complete representative tasks without developer assistance, and all help content matches the implemented interface.

### Phase 8 — Verification and controlled rollout

- Run unit, integration, database, calculation-regression, Playwright, accessibility and visual-regression suites.
- Test Chrome, Edge and Safari-supported behavior at common desktop sizes and 200% zoom.
- Conduct keyboard and screen-reader review plus representative-preparer usability sessions.
- Compare old and new UI results using identical seeded and imported returns.
- Roll out by feature flag, retain rapid fallback and remove legacy navigation only after independent acceptance.

**Exit gate:** All acceptance measures below pass, no calculation/output diff is unexplained, and the product owner signs off on the workbench before it becomes the default.

## 8. Acceptance measures

- 100% of existing fields and actions are represented in the parity ledger and reachable in the workbench.
- 100% of current manual values and imported canonical JSON values round-trip without loss.
- Identical immutable calculation inputs produce identical result hashes before and after the UI migration.
- Identical calculation runs produce the same required-form manifest, PDF calculated values, XLSX tie-outs and JSON exports.
- A preparer can locate any supported form/topic in ten seconds or less during the representative acceptance session.
- A keyboard-only preparer can create/open a return, enter a source form, calculate, resolve a diagnostic and open outputs.
- Every blocker identifies its affected topic and provides either a field jump or a plain-language unsupported-case explanation.
- No navigation or background save creates duplicate records, silently overwrites a newer revision or bypasses review invalidation.
- Automated WCAG 2.2 A/AA checks pass on representative normal, error, conflict, stale, blocked and output states.
- Manual assistive-technology and representative-preparer evidence is completed under the existing acceptance protocol.
- Performance stays within existing budgets; opening a cached workbench topic should feel immediate and must not load source-file bytes unless the user requests a preview.

## 9. Verification matrix

| Layer | Required evidence |
|---|---|
| Component | Input formatting, validation, keyboard behavior, accessible names, dirty/save/conflict states |
| API/integration | Authorization, optimistic revisions, manual/import parity, invalidation and audit history |
| Tax regression | Input and result hashes, trace values, required forms and unsupported blockers |
| Browser | Core workflows, deep links, history, command palette, responsive panes and recovery |
| Accessibility | Automated scan, keyboard-only tasks, zoom/reflow, screen reader and contrast |
| Visual | Stable reference images for normal, error, stale, blocked and output states |
| Human acceptance | New-user and experienced-preparer tasks, findings, evidence and independent reviewer signature |

## 10. Risks and controls

| Risk | Control |
|---|---|
| Professional density overwhelms new users | Comfortable default density, progressive disclosure, plain-language labels and short onboarding |
| Simplification hides unsupported tax treatment | Always-visible blocker count, explicit support status and fail-closed calculation rules |
| Background saving overwrites another revision | Existing optimistic versions, conflict comparison and recoverable local draft |
| Large returns make the tree or grids slow | Lazy topic loading, bounded lists, virtualization only where measured and no eager source-byte loading |
| Route consolidation breaks bookmarks | Preserve old URLs, add redirects only after parity and test browser history/deep links |
| Imported data appears read-only | Use the same persisted editors and correction lineage for imported and manual records |
| A Drake-like goal becomes visual copying | Use interaction principles and familiar tax organization with original Nexus visual design |
| Migration changes tax outcomes | Hash-based golden-return comparison and zero unexplained result/output differences |

## 11. Explicitly outside this UI program

- New state or local tax calculation modules.
- Live CCH or Drake synchronization.
- New tax-rule coverage solely to fill a UI slot.
- IRS filing, MeF, barcode or filing-copy activation.
- Removal of independent tax, security, infrastructure or official-output approval gates.

## 12. Definition of done

This program is complete only when:

1. Every current federal workflow is reachable through the Return Workbench.
2. The parity ledger proves that no field, action, history, validation or permission was lost.
3. Manual entry, JSON import/edit, calculation, review, PDF, XLSX and JSON output work end to end through the new interface.
4. Existing routes remain functional or have tested compatibility redirects.
5. Calculation and output regression evidence shows no unexplained differences.
6. Automated accessibility, keyboard, browser, visual and performance checks pass.
7. Manual assistive-technology and representative-preparer acceptance is independently recorded.
8. The rollout flag has a tested fallback and the product owner approves making the new workbench the default.

The technical implementation is now a controlled rollout candidate. Until the two independent human acceptance conditions in items 7 and 8 pass, the retained persisted editors remain authoritative, the classic fallback remains available and the workbench must not be represented as independently accepted or filing-ready.
