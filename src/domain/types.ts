export type PreparationStatus =
  | "Documents Pending"
  | "In Preparation"
  | "Ready for Review"
  | "Changes Requested"
  | "Reviewed Draft";

export type Severity = "blocking" | "warning" | "info" | "verified";

export interface ClientSummary {
  id: string;
  code: string;
  taxpayer: string;
  spouse?: string;
  maskedTin: string;
  returnType: "1040";
  taxYear: 2025;
  status: PreparationStatus;
  preparer: string;
  reviewer: string;
  openPoints: number;
  blockers: number;
  updatedAt: string;
}

export interface W2Record {
  id: string;
  employer: string;
  owner: "TP" | "SP";
  ein: string;
  wages: string;
  withholding: string;
  ssWages: string;
  ssWithholding: string;
  medicareWages: string;
  medicareWithholding: string;
  status: Severity;
  source: string;
}

export interface Diagnostic {
  code: string;
  severity: Severity;
  title: string;
  detail: string;
  action: string;
}
