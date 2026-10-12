export type UUID = string;
export type DecimalString = `${number}.${number}`;
export type OwnerRole = "taxpayer" | "spouse" | "joint" | "dependent" | "unknown";
export type Confidence = "high" | "medium" | "low" | "unverified";
export type Disposition = "consumed" | "informational" | "excluded" | "unresolved";
export type ReviewState = "unreviewed" | "verified" | "flagged" | "changed_after_review";

export interface Provenance {
  documentId: UUID;
  page: number | null;
  box: string | null;
  importBatchId: UUID;
  method: "manual" | "json_import" | "external_extraction";
  confidence: Confidence;
  originalValue: string | null;
}

export interface CanonicalField<T> {
  value: T | null;
  rawValue: string | null;
  disposition: Disposition;
  provenance: Provenance | null;
  reviewState: ReviewState;
  correctionId: UUID | null;
}

export interface Address {
  line1: string | null;
  line2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string;
}

export interface SourceDocumentRef {
  id: UUID;
  fileName: string;
  documentType: string;
  taxYear: 2025;
  issuer: string | null;
  recipientRole: OwnerRole;
  storageId: string | null;
  mimeType: string | null;
  checksum: string | null;
  byteLength: number | null;
  pageCount: number | null;
  duplicateFingerprint: string | null;
  disposition: "original" | "corrected" | "superseded" | "duplicate_excluded" | "void";
  supersedesDocumentId: UUID | null;
  scanState: "pending" | "clean" | "quarantined" | "failed" | "external_only";
}

export interface RawSourceField {
  id: UUID;
  label: string;
  code: string | null;
  value: string;
  page: number | null;
  reason: string | null;
}

export interface SourceFormBase {
  id: UUID;
  externalSourceId: string | null;
  sourceDocumentId: UUID;
  formYear: 2025;
  owner: OwnerRole;
  ownerPersonId: UUID | null;
  accountNumber: string | null;
  corrected: boolean;
  void: boolean;
  secondTinNotice: boolean | null;
  fatcaIndicator: boolean | null;
  version: number;
  rawFields: RawSourceField[];
  unmappedSourceFields: RawSourceField[];
}

export interface StateRow {
  id: UUID;
  state: string | null;
  payerStateId: string | null;
  stateIncome: DecimalString | null;
  stateTaxWithheld: DecimalString | null;
}

export interface W2Record extends SourceFormBase {
  formType: "W2";
  employer: { name: string | null; tin: string | null; address: Address; controlNumber: string | null };
  employee: { name: string | null; tin: string | null; address: Address };
  federal: Record<`box${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11}`, DecimalString | null>;
  box12: Array<{ id: UUID; code: string; amount: DecimalString }>;
  box13: { statutoryEmployee: boolean; retirementPlan: boolean; thirdPartySickPay: boolean };
  box14: Array<{ id: UUID; label: string; amount: DecimalString | null; classification: string | null }>;
  stateRows: Array<StateRow & { stateWages: DecimalString | null }>;
  localRows: Array<{ id: UUID; localWages: DecimalString | null; localTaxWithheld: DecimalString | null; localityName: string | null }>;
}

export interface PayerRecipientForm extends SourceFormBase {
  payer: { name: string | null; tin: string | null; phone: string | null; address: Address };
  recipient: { name: string | null; tin: string | null; address: Address };
  stateRows: StateRow[];
}

export interface Form1099NEC extends PayerRecipientForm {
  formType: "1099-NEC";
  boxes: {
    nonemployeeCompensation: DecimalString | null;
    directSales: boolean | null;
    excessGoldenParachutePayments: DecimalString | null;
    federalWithholding: DecimalString | null;
  };
}

export interface Form1099MISC extends PayerRecipientForm {
  formType: "1099-MISC";
  boxes: {
    rents: DecimalString | null; royalties: DecimalString | null; otherIncome: DecimalString | null;
    federalWithholding: DecimalString | null; fishingBoatProceeds: DecimalString | null;
    medicalPayments: DecimalString | null; directSales: boolean | null;
    substitutePayments: DecimalString | null; cropInsuranceProceeds: DecimalString | null;
    attorneyGrossProceeds: DecimalString | null; fishPurchasedForResale: DecimalString | null;
    section409ADeferrals: DecimalString | null;
    nonqualifiedDeferredCompensation: DecimalString | null;
  };
}

export interface Form1099INT extends PayerRecipientForm {
  formType: "1099-INT";
  boxes: {
    interestIncome: DecimalString | null; earlyWithdrawalPenalty: DecimalString | null;
    usSavingsBondInterest: DecimalString | null; federalWithholding: DecimalString | null;
    investmentExpenses: DecimalString | null; foreignTaxPaid: DecimalString | null;
    foreignCountry: string | null; taxExemptInterest: DecimalString | null;
    privateActivityBondInterest: DecimalString | null; marketDiscount: DecimalString | null;
    bondPremium: DecimalString | null; treasuryBondPremium: DecimalString | null;
    taxExemptBondPremium: DecimalString | null; taxExemptBondCusip: string | null;
  };
}

export interface Form1099DIV extends PayerRecipientForm {
  formType: "1099-DIV";
  boxes: {
    ordinaryDividends: DecimalString | null; qualifiedDividends: DecimalString | null;
    capitalGainDistributions: DecimalString | null; unrecaptured1250Gain: DecimalString | null;
    section1202Gain: DecimalString | null; collectiblesGain: DecimalString | null;
    section897OrdinaryDividends: DecimalString | null; section897CapitalGain: DecimalString | null;
    nondividendDistributions: DecimalString | null; federalWithholding: DecimalString | null;
    section199ADividends: DecimalString | null; investmentExpenses: DecimalString | null;
    foreignTaxPaid: DecimalString | null;
    foreignCountry: string | null; cashLiquidationDistributions: DecimalString | null;
    noncashLiquidationDistributions: DecimalString | null; exemptInterestDividends: DecimalString | null;
    privateActivityBondInterestDividends: DecimalString | null;
  };
}

export interface Form1099B extends PayerRecipientForm {
  formType: "1099-B";
  boxes: {
    description: string | null; dateAcquired: string | null; dateSold: string | null;
    proceeds: DecimalString | null; costBasis: DecimalString | null; accruedMarketDiscount: DecimalString | null;
    washSaleLossDisallowed: DecimalString | null; term: "short" | "long" | null;
    collectiblesOrQof: boolean | null; federalWithholding: DecimalString | null;
    noncoveredSecurity: boolean | null; reportedGrossOrNet: string | null; lossNotAllowed: boolean | null;
    profitLossClosedContracts: DecimalString | null; unrealizedPriorYear: DecimalString | null;
    unrealizedCurrentYear: DecimalString | null; aggregateProfitLoss: DecimalString | null;
    basisReportedToIrs: boolean | null; bartering: DecimalString | null; cusip: string | null;
    adjustmentCode: string | null; adjustmentAmount: DecimalString | null;
  };
}

export interface Form1099G extends PayerRecipientForm {
  formType: "1099-G";
  boxes: { unemploymentCompensation: DecimalString | null; stateLocalTaxRefunds: DecimalString | null; refundTaxYear: string | null; federalWithholding: DecimalString | null; rtaaPayments: DecimalString | null; taxableGrants: DecimalString | null; agriculturePayments: DecimalString | null; tradeBusiness: boolean | null; marketGain: DecimalString | null };
}

export interface Form1099K extends PayerRecipientForm {
  formType: "1099-K";
  boxes: { grossPaymentAmount: DecimalString | null; cardNotPresentTransactions: DecimalString | null; merchantCategoryCode: string | null; paymentTransactionCount: string | null; federalWithholding: DecimalString | null; january: DecimalString | null; february: DecimalString | null; march: DecimalString | null; april: DecimalString | null; may: DecimalString | null; june: DecimalString | null; july: DecimalString | null; august: DecimalString | null; september: DecimalString | null; october: DecimalString | null; november: DecimalString | null; december: DecimalString | null };
}

export interface Form1099R extends PayerRecipientForm {
  formType: "1099-R";
  boxes: { grossDistribution: DecimalString | null; taxableAmount: DecimalString | null; taxableAmountNotDetermined: boolean | null; totalDistribution: boolean | null; capitalGain: DecimalString | null; federalWithholding: DecimalString | null; employeeContributions: DecimalString | null; netUnrealizedAppreciation: DecimalString | null; distributionCode: string | null; iraSepSimple: boolean | null; otherAmount: DecimalString | null; otherPercentage: string | null; totalEmployeeContributions: DecimalString | null; totalDistributionPercentage: string | null; allocableIrRothContribution: DecimalString | null; firstYearDesignatedRoth: string | null; dateOfPayment: string | null };
  localRows: Array<{ id: UUID; localDistribution: DecimalString | null; localTaxWithheld: DecimalString | null; localityName: string | null }>;
}

export interface Form1099SA extends PayerRecipientForm {
  formType: "1099-SA";
  boxes: { grossDistribution: DecimalString | null; earningsOnExcessContributions: DecimalString | null; distributionCode: string | null; fairMarketValueAtDeath: DecimalString | null; accountType: "HSA" | "Archer MSA" | "Medicare Advantage MSA" | null; qualifiedMedicalExpenses: DecimalString | null };
}

export type SourceForm = W2Record | Form1099NEC | Form1099MISC | Form1099INT | Form1099DIV | Form1099B | Form1099G | Form1099K | Form1099R | Form1099SA;

export interface IntakeAnswer {
  id: UUID;
  questionId: string;
  answer: "yes" | "no" | "unknown";
  respondentId: UUID;
  evidence: string | null;
  answeredAt: string;
  revision: number;
}

export interface Activity {
  id: UUID;
  type: "schedule_c" | "schedule_e" | "schedule_f" | "schedule_1_other";
  name: string;
  owner: OwnerRole;
  implementationStatus: "supported" | "mapping_only";
  active: boolean;
  additionalReceipts?: DecimalString;
  receiptNote?: string | null;
  formData?: Record<string, unknown>;
  version?: number;
}

export interface SourceMapping {
  id: UUID;
  sourceRecordId: UUID;
  sourceField: string;
  sourceAmount: DecimalString;
  targetType: Activity["type"] | "excluded";
  targetActivityId: UUID | null;
  allocationMethod: "amount" | "percentage";
  allocatedAmount: DecimalString;
  percentage: DecimalString | null;
  reason: string | null;
  status: "suggested" | "accepted" | "reviewed";
  version: number;
}

export interface CanonicalTaxReturnData {
  schemaVersion: "1.0.0";
  taxYear: 2025;
  returnType: "1040";
  firmId: UUID;
  clientId: UUID;
  taxYearId: UUID;
  revision: number;
  filingProfile?: { status: "single" | "married_filing_jointly" | "married_filing_separately" | "head_of_household" | "qualifying_surviving_spouse"; eligibilityConfirmed: boolean };
  scheduleA?: Record<string, unknown>;
  taxpayer: Record<string, unknown>;
  spouse: Record<string, unknown> | null;
  dependents: Array<Record<string, unknown>>;
  intakeAnswers: IntakeAnswer[];
  sourceDocuments: SourceDocumentRef[];
  sourceForms: SourceForm[];
  activities: Activity[];
  mappings: SourceMapping[];
  metadata: Record<string, unknown>;
}
