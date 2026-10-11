# Filing readiness boundary

Nexus Phase 1 is a professional **draft preparation and review pilot**. Its generated federal PDF is a controlled internal facsimile and every page is marked `DRAFT — NOT FOR FILING`. There is no filing, signature, payment, submission, acceptance or rejection action in the product.

## Paper-return track

The following items must all be completed in a separately approved release before Nexus can produce an official paper-fileable package:

1. Archive the exact official IRS 2025 fillable PDF revision for each supported form and verify its checksum and post-release corrections.
2. Approve a field/coordinate map from the immutable calculation result to every official form field and supporting statement.
3. Add programmatic page, value, overflow, negative/zero/blank, metadata and manifest checks.
4. Complete independent line-by-line tax review and representative printed-output inspection.
5. Record product, qualified tax, output and security approvals in the governed release-closure workspace.
6. Introduce a distinct `official_paper` release mode only after those gates pass. Phase 1's `draft_pilot` mode must continue to reject filing claims.

## IRS Modernized e-File track

E-file is not a PDF-export feature. It requires external organizational and IRS approvals that source code cannot manufacture:

1. Complete IRS e-file provider enrollment and obtain the applicable EFIN/ETIN/software identifiers.
2. Implement the exact tax-year MeF XML schemas, business rules, attachments, signatures/authorizations and transmission security requirements.
3. Complete IRS Assurance Testing System scenarios and receive approval for the exact software/version.
4. Implement immutable submission packages, duplicate-transmission protection, acknowledgments, rejects, resubmissions and operational reconciliation.
5. Complete security, privacy, incident response, retention, monitoring and production-data authorization.
6. Release only after named owners record the required evidence and approvals.

Until those conditions are met, all filing capability remains deliberately unavailable and the production readiness gate requires `NEXUS_RELEASE_MODE=draft_pilot`.
