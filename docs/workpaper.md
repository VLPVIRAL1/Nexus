# Workpaper

The XLSX workpaper is bound to one immutable calculation run and input revision. It includes:

- cover and run identity;
- source index;
- income and withholding with cached total formulas;
- open review points;
- mapping reconciliation;
- required/rendered/missing-form completeness;
- unsupported treatments;
- governed manual-override history;
- authoritative calculation trace and operands;
- raw and unmapped source-field appendices.

The workbook supplements the calculation engine and does not implement tax law. Editing it does not update the application. Source-controlled strings are neutralized before spreadsheet output, money columns use explicit formats, and formula cells include the application-computed cached result. Rich correction-document detail and remaining visual/consumer compatibility evidence are still release work.
