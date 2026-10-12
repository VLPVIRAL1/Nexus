import type { CanonicalTaxReturnData } from "../../src/domain/canonical";
import { createDefaultActivityForm2025 } from "../../src/domain/activity-forms-2025";

export const canonicalReturnFixture: CanonicalTaxReturnData = {
  schemaVersion: "1.0.0", taxYear: 2025, returnType: "1040", firmId: "firm-1", clientId: "client-1", taxYearId: "year-1", revision: 28,
  taxpayer: { legalName: "Synthetic Taxpayer" }, spouse: null, dependents: [], intakeAnswers: [],
  sourceDocuments: [{ id: "doc-1", fileName: "synthetic-w2.pdf", documentType: "W2", taxYear: 2025, issuer: "Synthetic Employer", recipientRole: "taxpayer", storageId: "storage-1", mimeType: "application/pdf", checksum: "abc", byteLength: 1200, pageCount: 1, duplicateFingerprint: "fingerprint", disposition: "original", supersedesDocumentId: null, scanState: "clean" }],
  sourceForms: [],
  activities: [{ id: "30000000-0000-4000-8000-000000000001", type: "schedule_c", name: "Synthetic Consulting", owner: "taxpayer", implementationStatus: "supported", additionalReceipts: "0.00", receiptNote: null, formData: createDefaultActivityForm2025("schedule_c"), version: 1, active: true }],
  mappings: [{ id: "40000000-0000-4000-8000-000000000001", sourceRecordId: "50000000-0000-4000-8000-000000000001", sourceField: "box1", sourceAmount: "1000.00", targetType: "schedule_c", targetActivityId: "30000000-0000-4000-8000-000000000001", allocationMethod: "amount", allocatedAmount: "1000.00", percentage: null, reason: null, status: "accepted", version: 1 }],
  metadata: { synthetic: true },
};
