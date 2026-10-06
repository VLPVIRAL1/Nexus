import type { CanonicalTaxReturnData } from "../../src/domain/canonical";

export const canonicalReturnFixture: CanonicalTaxReturnData = {
  schemaVersion: "1.0.0", taxYear: 2025, returnType: "1040", firmId: "firm-1", clientId: "client-1", taxYearId: "year-1", revision: 28,
  taxpayer: { legalName: "Synthetic Taxpayer" }, spouse: null, dependents: [], intakeAnswers: [],
  sourceDocuments: [{ id: "doc-1", fileName: "synthetic-w2.pdf", documentType: "W2", taxYear: 2025, issuer: "Synthetic Employer", recipientRole: "taxpayer", storageId: "storage-1", mimeType: "application/pdf", checksum: "abc", byteLength: 1200, pageCount: 1, duplicateFingerprint: "fingerprint", disposition: "original", supersedesDocumentId: null, scanState: "clean" }],
  sourceForms: [],
  activities: [{ id: "activity-1", type: "schedule_c", name: "Synthetic Consulting", owner: "taxpayer", implementationStatus: "supported", active: true }],
  mappings: [{ id: "mapping-1", sourceRecordId: "record-1", sourceField: "box1", sourceAmount: "1000.00", targetType: "schedule_c", targetActivityId: "activity-1", allocationMethod: "amount", allocatedAmount: "1000.00", percentage: null, reason: null, status: "accepted", version: 1 }],
  metadata: { synthetic: true },
};
