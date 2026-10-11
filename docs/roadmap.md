# Roadmap

1. Firm access, client/year snapshot, design tokens, workstation shell.
2. Secure W-2 upload through import, correction, trace, wage calculation, draft 1040, and audit.
3. Remaining source families, lossless round trip, duplicates, and corrections.
4. Supported INT/DIV path, Schedule B, and qualified dividends.
5. Mapping, supported Schedule C, person-level SE, Schedules 1/2, and simplified QBI.
6. Review invalidation, immutable outputs, workpaper tie-out, and recovery.
7. Performance, accessibility, security, recovery, and preparer acceptance gates.
8. Mock vendor adapter contracts only.

## Post-Phase-1 release tracks

- Broader source/calculation coverage is added only as complete vertical slices. The October 11 review release adds 1099-B/G/K/R/SA supported subsets with fail-closed blockers; the 2025 catalog still blocks all other unimplemented information returns rather than silently ignoring them.
- Official paper-fileable output requires approved IRS template mappings and independent line/print inspection; see `filing-readiness.md`.
- IRS Modernized e-File requires provider enrollment, year-specific schemas/business rules, ATS approval and submission/acknowledgment operations. It is not enabled by the Phase 1 codebase.
