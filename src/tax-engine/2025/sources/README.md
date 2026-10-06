# 2025 federal rule sources

These files are immutable research inputs for `us-federal-1040-2025-supported-v1`.
Their IRS URLs, retrieval date, and SHA-256 hashes are recorded in
`../rule-package.ts`. The calculation runtime reads only committed rules and the
committed tax-table registry; it never fetches an IRS page during calculation.

The package remains `research_unapproved`. A qualified tax professional must
review the sources, constants, rounding order, dependency coverage, and golden
fixtures before the package can be activated for a Reviewed Draft. Approval must
set a named reviewer and create a new immutable package version. It must not
overwrite this research revision.

The February 13, 2026 Form 8995 correction is archived because it changes the
line 11 instructions for taxable income before the QBI deduction. The archived
2025 PDF retrieved on October 6, 2026 already contains the corrected language.

To reproduce `../data/tax-table.json`, run:

```bash
python scripts/generate-2025-tax-table.py \
  src/tax-engine/2025/sources/i1040gi--2025.pdf \
  src/tax-engine/2025/data/tax-table.json
```

The generator checks all 2,062 published bands from $0 through $99,999 for
continuity and fails if the extracted registry has a missing or extra band.
