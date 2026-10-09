# Manual accessibility and representative-preparer acceptance protocol

Automated checks do not satisfy this protocol. Execute it on a release candidate using synthetic data only. Store the completed, signed evidence in the approved evidence system and commit only its non-sensitive reference, decision and hash.

Record each completed run in **Administration → Release closure → Manual acceptance**. The recorder must provide the evidence-system reference and scenario counts; a different reviewer may sign only a fully passing run. This application record complements, and does not replace, the controlled external evidence.

## Test record

Record the exact Git commit, deployment identifier, date/time, tester name and role, operating system, browser/version, viewport/zoom, keyboard layout, assistive technology/version, display settings and synthetic fixture IDs. Each result must be `pass`, `fail` or `blocked` with observations and an issue/evidence reference; blank rows do not pass.

## Keyboard and reflow

1. From a new page load, reach Skip to main content and every actionable control without a pointer.
2. Open client search with Ctrl/Cmd+K, choose a result, dismiss with Escape and confirm focus restoration.
3. Complete intake, source upload, every source-form editor including repeated rows, import decisions, mapping splits, review-point resolution, calculation review and output generation using the keyboard.
4. Confirm visible focus, logical order, no keyboard trap and announced save/error/conflict status.
5. Repeat primary workflows at 200% zoom and 320 CSS-pixel reflow without lost content or two-dimensional scrolling except genuinely tabular regions.

## Screen reader

Run at least one desktop screen reader/browser pair approved by the accessibility owner. Verify landmarks and headings, navigation names/current state, data-table headers, form labels/instructions, required and invalid state, error summary movement, status announcements, dialogs, combobox results, repeated-row add/remove context, masked identifiers and disabled approval explanations.

## Visual and non-color cues

Verify high-contrast/forced-colors behavior, text spacing, focus visibility, 400% text zoom where applicable, status meaning without color, PDF/workbook labels and that draft/partial/missing-form warnings remain visible and readable.

## Representative preparer tasks

Using one supported synthetic return and one intentionally blocked complex return, have a preparer who did not implement the feature:

1. establish client/year/people and identify current preparation status;
2. complete intake and document evidence;
3. upload and view a clean source, stage the five-family import and resolve changes;
4. correct one record, exclude one duplicate and explain effective lineage;
5. map split business receipts and reconcile the residual;
6. resolve and reopen review points after a changed fact;
7. inspect calculation trace, required forms, unsupported blockers and rule approval state;
8. generate/download PDF, XLSX, source-only and blank JSON and explain their limitations;
9. identify that filing and live vendor sync are unavailable;
10. complete the tasks without facilitator correction, then rate correctness, discoverability, density, terminology and confidence.

## Acceptance rule

All critical tasks must pass with no data loss, unauthorized access, silent omission or filing-readiness misunderstanding. Accessibility failures affecting task completion, missing announcements, keyboard traps, incorrect tax/output interpretation or reliance on facilitator correction block AC-18 and the UI/review gate. The accountable design/product owner records the final decision and any accepted non-blocking limitations.
