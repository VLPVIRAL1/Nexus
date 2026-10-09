# Nexus Tax design system

This file follows the binding product specification. The UI/UX Pro Max search informed accessibility and interaction checks; the specification's Drake-inspired workstation tokens override its generic SaaS recommendation.

## Direction

- Professional desktop tax workstation; dense, fast, restrained, and review-oriented.
- Bundled Inter Variable with Segoe UI and system sans-serif fallbacks; 14px body, 13–14px labels, 16–18px headings.
- Navy `#17365D` command chrome, blue `#245A81` actions, gray `#F2F4F7` workspace, white entry surfaces, divider `#CBD2D9`, body `#1F2937`.
- Compact rows 30–32px and inputs 32px; comfortable mode 38–40px.
- 4px spacing base, thin borders, 2–4px corners, tabular financial numerals.
- Minimal functional motion with `prefers-reduced-motion` support.

## Required patterns

- Persistent firm/client/year/status context.
- Screen search and keyboard-accessible commands.
- Grouped return tree, repeatable record list, box-aligned entry, optional source/issues pane.
- Source, computed, corrected, overridden, unknown, and unsupported values have distinct text/icon treatments.
- Blank, confirmed zero, not applicable, and failed calculation remain visually distinct.
- Errors and warnings always use icon/text as well as color.
- At 1366×768, collapse the source pane before narrowing all four columns. At 1920×1080, show it side by side.

## Acceptance checks

- WCAG 2.2 AA target: visible focus, semantic labels, announced states, keyboard operation, reflow, and contrast.
- No emoji icons, hover-only actions, decorative preparation animation, oversized cards, hidden totals, or consumer questionnaire flow.
- Verify 1366×768, 1920×1080, 200% zoom, reduced motion, compact and comfortable density.
