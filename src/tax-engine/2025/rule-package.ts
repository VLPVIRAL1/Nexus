export interface RuleSource2025 {
  id: string;
  title: string;
  url: string;
  archivedFile: string;
  retrievedOn: "2026-10-06";
  sha256: string;
}

export const ruleSources2025: RuleSource2025[] = [
  { id: "irs-form-1040-2025", title: "2025 Form 1040", url: "https://www.irs.gov/pub/irs-prior/f1040--2025.pdf", archivedFile: "sources/f1040--2025.pdf", retrievedOn: "2026-10-06", sha256: "3d31c226df0d189ced80e039d01cf0f8820c1019681a0f0ca6264de277b7e982" },
  { id: "irs-schedule-1-2025", title: "2025 Schedule 1", url: "https://www.irs.gov/pub/irs-prior/f1040s1--2025.pdf", archivedFile: "sources/f1040s1--2025.pdf", retrievedOn: "2026-10-06", sha256: "8dafec719f6a4716c259a2bdaca546d9bb9e262d1eabef885fe116a7327458fa" },
  { id: "irs-schedule-2-2025", title: "2025 Schedule 2", url: "https://www.irs.gov/pub/irs-prior/f1040s2--2025.pdf", archivedFile: "sources/f1040s2--2025.pdf", retrievedOn: "2026-10-06", sha256: "64d867b683334cfc533993e37ccb0d143449ec29428a78206be2e4de333941e8" },
  { id: "irs-schedule-b-2025", title: "2025 Schedule B", url: "https://www.irs.gov/pub/irs-prior/f1040sb--2025.pdf", archivedFile: "sources/f1040sb--2025.pdf", retrievedOn: "2026-10-06", sha256: "dd1ec3719954532bd219343d81385a2ada3c8e9573fc755a3893f1fbbecc63e2" },
  { id: "irs-schedule-c-2025", title: "2025 Schedule C", url: "https://www.irs.gov/pub/irs-prior/f1040sc--2025.pdf", archivedFile: "sources/f1040sc--2025.pdf", retrievedOn: "2026-10-06", sha256: "ddf401dbe060467d39f90ad2abf645df1de31512821a150dc68a3882bbf19716" },
  { id: "irs-1040-instructions-2025", title: "2025 Instructions for Form 1040", url: "https://www.irs.gov/pub/irs-prior/i1040gi--2025.pdf", archivedFile: "sources/i1040gi--2025.pdf", retrievedOn: "2026-10-06", sha256: "482e9c487c608f1bbeaceef35bc3c0933e8b35443cfff447e4279d590468364a" },
  { id: "irs-schedule-b-instructions-2025", title: "2025 Instructions for Schedule B", url: "https://www.irs.gov/pub/irs-prior/i1040sb--2025.pdf", archivedFile: "sources/i1040sb--2025.pdf", retrievedOn: "2026-10-06", sha256: "b92f31ece57a82ea576ac96507fe5df637dbda7489a80eb28aaab88e7c87b287" },
  { id: "irs-schedule-se-2025", title: "2025 Schedule SE", url: "https://www.irs.gov/pub/irs-prior/f1040sse--2025.pdf", archivedFile: "sources/f1040sse--2025.pdf", retrievedOn: "2026-10-06", sha256: "05bc2b3e1dfca65d8c6fc6d652af4fa3736e953c6575d6e9f82590484677d347" },
  { id: "irs-schedule-se-instructions-2025", title: "2025 Instructions for Schedule SE", url: "https://www.irs.gov/pub/irs-prior/i1040sse--2025.pdf", archivedFile: "sources/i1040sse--2025.pdf", retrievedOn: "2026-10-06", sha256: "ea9e3120706f9d5e21ce1c6cbec256b5e2e2bf02c44759773d9236462cf4d800" },
  { id: "irs-form-8995-2025", title: "2025 Form 8995", url: "https://www.irs.gov/pub/irs-prior/f8995--2025.pdf", archivedFile: "sources/f8995--2025.pdf", retrievedOn: "2026-10-06", sha256: "55380ad230303e1586ce97f0f224265b8337ad18c9204f0fb7325e95a76b5cde" },
  { id: "irs-form-8995-instructions-2025", title: "2025 Instructions for Form 8995", url: "https://www.irs.gov/pub/irs-prior/i8995--2025.pdf", archivedFile: "sources/i8995--2025.pdf", retrievedOn: "2026-10-06", sha256: "875843baead68f6fa9aa7c3f6f27d6c1f37cb971ac334bcf414acdb4c1487684" },
  { id: "irs-form-8995-line-11-correction", title: "Form 8995 line 11 correction (Feb. 13, 2026)", url: "https://www.irs.gov/forms-pubs/corrections-to-the-instructions-on-how-to-calculate-the-taxable-income-before-qbi-deduction-for-form-8995", archivedFile: "sources/qbi-line-11-correction-2026-02-13.html", retrievedOn: "2026-10-06", sha256: "0fd0fd725762c038fc4092ff5a5decf884f0a0fd9475c6d0b12312375cf18e0e" },
  { id: "irs-1099-misc-nec-instructions-2025", title: "2025 Instructions for Forms 1099-MISC and 1099-NEC", url: "https://www.irs.gov/pub/irs-prior/i1099mec--2025.pdf", archivedFile: "sources/i1099mec--2025.pdf", retrievedOn: "2026-10-06", sha256: "372a0f683aa10650889d4ddcbe96b33bc0998ab31fdbf6e36d2262e3f1542dce" },
];

export const rulePackage2025 = {
  id: "us-federal-1040-2025-supported-v1",
  taxYear: 2025,
  version: "0.1.0-research.1",
  effectiveRevision: "2026-02-13-qbi-correction",
  status: "research_unapproved" as const,
  reviewer: null,
  taxTableSha256: "349208c4f25adbdb81cc418c75843364ae15dd36fbe762bc2adf2829a238d10a",
  fixtureIds: ["IRS-TAX-TABLE-SAMPLE-MFJ-25300", "SUPPORTED-SINGLE-WAGE", "SUPPORTED-MFJ-BUSINESS-QD"],
  sources: ruleSources2025,
};

export const constants2025 = {
  standardDeduction: { single: 15750, married_filing_jointly: 31500 },
  scheduleBThreshold: 1500,
  socialSecurityWageBase: 176100,
  qbiSimplifiedThreshold: { single: 197300, married_filing_jointly: 394600 },
  qualifiedDividendZeroRateCeiling: { single: 48350, married_filing_jointly: 96700 },
  qualifiedDividendFifteenRateCeiling: { single: 533400, married_filing_jointly: 600050 },
  additionalMedicareThreshold: { single: 200000, married_filing_jointly: 250000 },
  netInvestmentIncomeThreshold: { single: 200000, married_filing_jointly: 250000 },
} as const;
