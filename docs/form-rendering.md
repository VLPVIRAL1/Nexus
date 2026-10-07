# Form rendering

The calculation engine produces authoritative form data objects. `form-data-2025.ts` converts those objects into a year-specific rendering plan, and `tax-form-renderer.ts` renders the plan without performing tax arithmetic.

The current renderer is a controlled internal preview, not an official IRS form. It renders Form 1040, the supported portions of Schedules 1, 2, B, C and SE, simplified Form 8995, and the qualified-dividend computation worksheet when required. Every rendered page says `CONTROLLED INTERNAL PREVIEW — NOT AN OFFICIAL IRS FORM` and carries `DRAFT — NOT FOR FILING` in both a watermark and footer.

The package begins with a run/revision/version cover and required/rendered/missing-form manifest. Missing required forms remain visible and make the package incomplete. Official IRS-template field/coordinate maps remain a separate, unapproved future adapter.
