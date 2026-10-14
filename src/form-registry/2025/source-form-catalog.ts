export type SourceFormSupport = "supported_capture" | "document_only_blocking";

export interface SourceFormCatalogEntry {
  form: string;
  support: SourceFormSupport;
  treatment: string;
}

/**
 * The 2025 import contract is intentionally explicit: every registered review
 * family receives typed, lossless capture. Other common information returns
 * may be stored as encrypted source documents, but must block draft approval
 * until their tax treatment is implemented and independently approved.
 */
export const sourceFormCatalog2025: SourceFormCatalogEntry[] = [
  ["W-2", "supported_capture", "Typed capture and supported-envelope calculation"],
  ["W-2C", "document_only_blocking", "Correction evidence; reconcile to a typed W-2 record"],
  ["1095-A", "supported_capture", "Typed marketplace coverage capture; reviewed monthly columns feed Form 8962"],
  ["1098-E", "supported_capture", "Typed student-loan interest capture; linked reviewed facts feed Schedule 1"],
  ["1098-T", "supported_capture", "Typed capture; reviewed tuition facts feed Form 8863 education-credit interviews"],
  ["5498", "supported_capture", "Typed IRA and retirement-plan contribution evidence"],
  ["5498-SA", "supported_capture", "Typed HSA contribution evidence feeding reviewed Form 8889 facts"],
  ["1099-NEC", "supported_capture", "Typed capture; calculation depends on accepted mapping"],
  ["1099-MISC", "supported_capture", "Typed capture; unsupported boxes and destinations block approval"],
  ["1099-INT", "supported_capture", "Typed capture; unsupported boxes block approval"],
  ["1099-DIV", "supported_capture", "Typed capture; unsupported boxes block approval"],
  ["1099-A", "document_only_blocking", "Acquisition or abandonment treatment is not implemented"],
  ["1099-B", "supported_capture", "Typed capture; reviewed adjustments, special-rate classifications and loss carryovers flow through Form 8949, Schedule D and the capital-gain tax worksheet"],
  ["1099-C", "document_only_blocking", "Cancellation-of-debt treatment is not implemented"],
  ["1099-CAP", "document_only_blocking", "Corporate control/capital structure treatment is not implemented"],
  ["1099-DA", "document_only_blocking", "Digital-asset disposition treatment is not implemented"],
  ["1099-G", "supported_capture", "Typed capture; unemployment compensation and withholding are supported; other government payments block"],
  ["1099-K", "supported_capture", "Typed capture; gross payments require complete accepted Schedule C reconciliation"],
  ["1099-LS", "document_only_blocking", "Reportable life-insurance sale treatment is not implemented"],
  ["1099-LTC", "document_only_blocking", "Long-term-care benefit treatment is not implemented"],
  ["1099-OID", "document_only_blocking", "Original-issue-discount treatment is not implemented"],
  ["1099-PATR", "document_only_blocking", "Cooperative distribution treatment is not implemented"],
  ["1099-Q", "document_only_blocking", "Qualified education program treatment is not implemented"],
  ["1099-QA", "document_only_blocking", "ABLE account treatment is not implemented"],
  ["1099-R", "supported_capture", "Typed capture; normal code 7 IRA and pension distributions with determined taxable amounts are supported"],
  ["1099-S", "document_only_blocking", "Real-estate proceeds treatment is not implemented"],
  ["1099-SA", "supported_capture", "Typed capture; fully qualified normal HSA distributions render Form 8889; other distributions block"],
  ["SSA-1099", "supported_capture", "Typed Social Security benefit capture feeding the supported Social Security Benefits Worksheet"],
  ["RRB-1099", "supported_capture", "Typed tier-1 railroad-equivalent benefit capture feeding the supported Social Security Benefits Worksheet"],
].map(([form, support, treatment]) => ({ form, support: support as SourceFormSupport, treatment }));

export const typedSourceForms2025 = sourceFormCatalog2025.filter(({ support }) => support === "supported_capture").map(({ form }) => form);
