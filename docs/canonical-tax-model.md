# Canonical tax model

Canonical records use internal UUIDs. External IDs are evidence, not primary keys. Monetary values serialize as decimal strings with explicit cents. Blank, unknown, confirmed zero, and not applicable are distinct states. Arrays preserve repeated forms and rows, and stable child IDs replace array positions. Every normalized material field will retain source document, page/box, import batch, confidence, and correction lineage.

The 2025 root contract includes editable taxpayer/spouse identity and address profiles, an explicitly reviewed five-status filing profile, stable-ID dependent rows with separate dependent/CTC/ODC determinations, reviewed Schedule A amounts and limitation confirmations, and strict 2025.1 Schedule C/E/F activity forms. Complete export serializes these fields and strict accepted/reviewed allocation rows back into the same schema accepted by import; imports materialize the same identity, source, return-profile and activity records used by manual screens, with immutable activity/source revisions, atomic allocation sets and compensating rollback.

Unknown fields are preserved and produce review diagnostics. Capture support never implies calculation support.
