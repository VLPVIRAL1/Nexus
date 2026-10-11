export type SourceFormSupport = "supported_capture" | "document_only_blocking";

export interface SourceFormCatalogEntry {
  form: string;
  support: SourceFormSupport;
  treatment: string;
}

/**
 * The 2025 import contract is intentionally explicit: the five Phase 1
 * families receive typed, lossless capture. Other common information returns
 * may be stored as encrypted source documents, but must block draft approval
 * until their tax treatment is implemented and independently approved.
 */
export const sourceFormCatalog2025: SourceFormCatalogEntry[] = [
  ["W-2", "supported_capture", "Typed capture and supported-envelope calculation"],
  ["W-2C", "document_only_blocking", "Correction evidence; reconcile to a typed W-2 record"],
  ["1099-NEC", "supported_capture", "Typed capture; calculation depends on accepted mapping"],
  ["1099-MISC", "supported_capture", "Typed capture; unsupported boxes and destinations block approval"],
  ["1099-INT", "supported_capture", "Typed capture; unsupported boxes block approval"],
  ["1099-DIV", "supported_capture", "Typed capture; unsupported boxes block approval"],
  ["1099-A", "document_only_blocking", "Acquisition or abandonment treatment is not implemented"],
  ["1099-B", "document_only_blocking", "Form 8949 and Schedule D treatment is not implemented"],
  ["1099-C", "document_only_blocking", "Cancellation-of-debt treatment is not implemented"],
  ["1099-CAP", "document_only_blocking", "Corporate control/capital structure treatment is not implemented"],
  ["1099-DA", "document_only_blocking", "Digital-asset disposition treatment is not implemented"],
  ["1099-G", "document_only_blocking", "Government-payment treatment is not implemented"],
  ["1099-K", "document_only_blocking", "Payment-card/third-party-network reconciliation is not implemented"],
  ["1099-LS", "document_only_blocking", "Reportable life-insurance sale treatment is not implemented"],
  ["1099-LTC", "document_only_blocking", "Long-term-care benefit treatment is not implemented"],
  ["1099-OID", "document_only_blocking", "Original-issue-discount treatment is not implemented"],
  ["1099-PATR", "document_only_blocking", "Cooperative distribution treatment is not implemented"],
  ["1099-Q", "document_only_blocking", "Qualified education program treatment is not implemented"],
  ["1099-QA", "document_only_blocking", "ABLE account treatment is not implemented"],
  ["1099-R", "document_only_blocking", "Retirement distribution treatment is not implemented"],
  ["1099-S", "document_only_blocking", "Real-estate proceeds treatment is not implemented"],
  ["1099-SA", "document_only_blocking", "HSA/MSA distribution treatment is not implemented"],
].map(([form, support, treatment]) => ({ form, support: support as SourceFormSupport, treatment }));

export const typedSourceForms2025 = sourceFormCatalog2025.filter(({ support }) => support === "supported_capture").map(({ form }) => form);
