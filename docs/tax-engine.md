# Tax engine

The 2025 research engine is pure, deterministic, year-versioned, decimal-based, and independent from UI and PDF rendering. It implements the narrow Single/MFJ profile through supported portions of Schedule B, Schedule C, Schedule SE, Schedules 1 and 2, simplified Form 8995, the qualified-dividend worksheet, and Form 1040. Withholding follows the active-source payment path and Schedule SE aggregates by owner before applying each person's Social Security wage interaction.

`src/tax-engine/2025/rule-package.ts` pins immutable IRS URLs, retrieval dates, archived content hashes, the February 2026 Form 8995 correction, and fixture identifiers. Runtime calculations use the committed 2,062-band IRS tax table below $100,000 and the published computation worksheet at and above $100,000. They never fetch mutable tax data. Trace steps record operands, form lines, worksheet choice, rounding, rule ID, and result. Dependency traversal detects cycles and returns explicit blockers for incomplete or unsupported paths.

The package status is `research_unapproved`. Calculation results are draft research previews and carry a review warning. Activation for Reviewed Draft requires an independent qualified tax-professional review, named reviewer, independently checked fixtures, and a new immutable approved package version.
