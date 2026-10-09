# Output tie-out acceptance protocol

Execute this protocol only after a qualified tax-rule owner has approved the exact synthetic calculation fixture and immutable rule package. Automated output tests remain necessary but do not replace this consumer inspection.

## Evidence identity

Record the Git commit, deployment, synthetic return ID, tax-year revision, calculation-run ID, input/result hashes, engine/rule/form-registry/template versions, artifact IDs and SHA-256 hashes. Record the inspector’s name, role, organization, date and evidence-system reference. Do not commit taxpayer data or artifact bytes.

## Reconciliation

For every supported line and worksheet node, compare the independently approved expected result with the calculation trace, on-screen summary, controlled PDF page, XLSX cached value/formula/source reference and complete canonical JSON value. Verify owner-specific withholding, repeated Schedules C/SE, Schedule B thresholds, qualified-dividend method, simplified Form 8995, rounding, required/rendered/missing-form manifests, governed overrides and unsupported-treatment exclusions. Every difference must be resolved or explicitly block the gate.

## Consumer inspection

Open the generated PDF in two approved viewers and the workbook in the supported spreadsheet application. Confirm page order, labels, line alignment, pagination, no clipping, readable warnings, `DRAFT — NOT FOR FILING` on every controlled page, partial/missing-form disclosure, formula safety and no false filing or live-integration action. Re-download every artifact and confirm its SHA-256 hash is unchanged.

## Acceptance rule

The output gate passes only when every supported value agrees across all representations, all required pages are present, every unsupported result remains visibly blocked, artifact hashes verify, and both the qualified tax-rule owner and product owner sign the exact evidence record. Accepted discrepancies are not permitted for tax values, ownership, required-form selection, integrity, authorization or filing-readiness disclosure.
