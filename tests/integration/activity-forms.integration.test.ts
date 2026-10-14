import pg from "pg";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AuthorizationContext } from "../../src/services/authorization";
import { createDefaultActivityForm2025 } from "../../src/domain/activity-forms-2025";
import { createClient, createTaxYear } from "../../src/server/client-workflow-service";
import { createActivity, getMappingState } from "../../src/server/mapping-persistence-service";
import { getActivityFormState, saveActivityForm } from "../../src/server/activity-form-service";
import { commitPersistedImport, rollbackPersistedImport, stageCanonicalImport } from "../../src/server/import-persistence-service";
import { runPersistedCalculation } from "../../src/server/calculation-service";
import { createBlankCanonicalTemplate2025 } from "../../src/services/outputs/json-export-service";

const connectionString = process.env.DATABASE_URL;
const suite = connectionString ? describe : describe.skip;
const admin: AuthorizationContext = {
  userId: "20000000-0000-4000-8000-000000000003",
  firmId: "10000000-0000-4000-8000-000000000001",
  role: "admin",
  assignedClientIds: new Set(),
};

async function freshClient(label: string) {
  const client = await createClient(admin, { clientCode: `${label}-${randomUUID().slice(0, 8)}`, displayName: `${label} synthetic return` });
  await createTaxYear(admin, client.id, { year: 2025 });
  return client.id;
}

suite("Schedule C, E, and F persistence", () => {
  it("creates and manually revises all three supported activity forms with immutable history", async () => {
    const clientId = await freshClient("CEF-MANUAL");
    let state = await getActivityFormState(admin, clientId, 2025);
    for (const [type, name] of [["schedule_c", "Consulting"], ["schedule_e", "Rental"], ["schedule_f", "Farm"]] as const) {
      await createActivity(admin, clientId, 2025, state.revision, {
        type, name, ownerRole: "taxpayer", implementationStatus: "supported", receiptBasis: "source_plus_additional_receipts",
        additionalReceipts: "0.00", receiptNote: null,
      });
      state = await getActivityFormState(admin, clientId, 2025);
    }

    for (const activity of state.activities.filter(({ active }) => active)) {
      const formData = structuredClone(activity.formData) as any;
      if (activity.type === "schedule_c") {
        formData.businessName = "Synthetic Consulting";
        formData.income.otherIncome = "125.00";
        formData.expenses.advertising = "25.00";
        formData.vehicle = { ...formData.vehicle, used: true, method: "standard_mileage", placedInServiceDate: "2025-01-02", businessMiles: 1000, evidenceAvailable: true, writtenEvidence: true };
        formData.homeOffice = { ...formData.homeOffice, claimed: true, method: "simplified", officeSquareFeet: 200, homeSquareFeet: 1000, exclusiveRegularUseReviewed: true };
        formData.assets = [{ id: randomUUID(), description: "Synthetic computer", category: "equipment", placedInServiceDate: "2025-02-01", basis: "1000.00", businessUsePercentage: "100.00", method: "macrs_200db", recoveryPeriodYears: 5, section179Election: "0.00", bonusPercentage: "0.00", priorDepreciation: "0.00", listedPropertyEvidenceReviewed: true, disposedIn2025: false, dispositionProceeds: "0.00" }];
        formData.qbiEligible = true;
        formData.selfEmploymentTreatmentConfirmed = true;
      } else if (activity.type === "schedule_e") {
        formData.property.address = "100 Synthetic Street";
        formData.income.rentsReceived = "12000.00";
        formData.expenses.repairs = "1000.00";
        formData.allInvestmentAtRisk = true;
        formData.passiveLossRulesReviewed = true;
        formData.depreciationReviewed = true;
        formData.rentalQbiEligible = false;
        formData.lossLimitations = { reviewed: true, basisLimit: "10000.00", atRiskLimit: "10000.00", passiveLossAllowed: "10000.00", priorPassiveCarryover: "500.00" };
        formData.partnershipsAndSCorporations = [{ id: randomUUID(), name: "Synthetic K-1", ein: "", passive: true, incomeOrLoss: "1000.00", basisAndAtRiskReviewed: true, basisLimit: "10000.00", atRiskLimit: "10000.00", passiveLossAllowed: "10000.00", priorPassiveCarryover: "0.00" }];
      } else {
        formData.principalProduct = "Synthetic grain";
        formData.income.livestockProduceSales = "7000.00";
        formData.expenses.feed = "1000.00";
        formData.qbiEligible = true;
        formData.selfEmploymentTreatmentConfirmed = true;
        formData.cropInsuranceElectionReviewed = true;
        formData.accountingMethod = "accrual";
        formData.accrual.livestockProduceSales = "7000.00";
        formData.accrual.endingInventory = "1500.00";
      }
      const saved = await saveActivityForm(admin, clientId, 2025, activity.id, {
        expectedRevision: state.revision, expectedVersion: activity.version, name: activity.name, ownerRole: activity.ownerRole,
        additionalReceipts: activity.type === "schedule_c" ? "500.00" : "0.00",
        receiptNote: activity.type === "schedule_c" ? "Synthetic cash receipts exclude information returns." : null,
        changeReason: "Integration proof for the complete manual Schedule C/E/F workflow.", formData,
      });
      expect(saved.version).toBe(2);
      state = await getActivityFormState(admin, clientId, 2025);
    }

    expect(state.activities.filter(({ active }) => active)).toHaveLength(3);
    expect(state.activities.every(({ history }) => history.length >= 2)).toBe(true);
    expect((state.activities.find(({ type }) => type === "schedule_c")?.formData as any).businessName).toBe("Synthetic Consulting");
    expect((state.activities.find(({ type }) => type === "schedule_c")?.formData as any).assets).toHaveLength(1);
    expect((state.activities.find(({ type }) => type === "schedule_e")?.formData as any).income.rentsReceived).toBe("12000.00");
    expect((state.activities.find(({ type }) => type === "schedule_e")?.formData as any).partnershipsAndSCorporations).toHaveLength(1);
    expect((state.activities.find(({ type }) => type === "schedule_f")?.formData as any).income.livestockProduceSales).toBe("7000.00");
    expect((state.activities.find(({ type }) => type === "schedule_f")?.formData as any).accountingMethod).toBe("accrual");
  });

  it("materializes a canonical JSON activity import, preserves split mappings, assembles calculation input, and rolls back", async () => {
    const clientId = await freshClient("CEF-IMPORT");
    const payload = structuredClone(createBlankCanonicalTemplate2025()) as any;
    payload.metadata = { integration_fixture: randomUUID() };
    payload.filing_profile = { status: "single", eligibility_confirmed: true };

    const sourceId = randomUUID();
    payload.forms.form_1099_nec = [{
      id: sourceId, external_source_id: `cef-${randomUUID()}`, source_document_id: randomUUID(), form_year: 2025,
      recipient_role: "taxpayer", corrected: false, void: false, raw_fields: [], unmapped_source_fields: [], version: 1,
      payer: { name: "Synthetic payer" }, boxes: { nonemployeeCompensation: "1000.00" },
    }];
    const scheduleCId = randomUUID();
    const scheduleEId = randomUUID();
    const scheduleFId = randomUUID();
    const scheduleC = createDefaultActivityForm2025("schedule_c") as any;
    scheduleC.qbiEligible = true;
    scheduleC.selfEmploymentTreatmentConfirmed = true;
    scheduleC.expenses.advertising = "100.00";
    const scheduleE = createDefaultActivityForm2025("schedule_e") as any;
    scheduleE.income.rentsReceived = "5000.00";
    scheduleE.expenses.repairs = "1000.00";
    scheduleE.allInvestmentAtRisk = true;
    scheduleE.passiveLossRulesReviewed = true;
    scheduleE.depreciationReviewed = true;
    scheduleE.rentalQbiEligible = false;
    const scheduleF = createDefaultActivityForm2025("schedule_f") as any;
    scheduleF.income.livestockProduceSales = "7000.00";
    scheduleF.expenses.feed = "2000.00";
    scheduleF.qbiEligible = true;
    scheduleF.selfEmploymentTreatmentConfirmed = true;
    scheduleF.cropInsuranceElectionReviewed = true;
    payload.activities.schedule_c = [{ id: scheduleCId, name: "Imported consulting", owner_role: "taxpayer", implementation_status: "supported", additional_receipts: "100.00", receipt_note: "Synthetic receipts exclude the mapped 1099-NEC.", active: true, version: 1, form_data: scheduleC }];
    payload.activities.schedule_e = [{ id: scheduleEId, name: "Imported rental", owner_role: "taxpayer", implementation_status: "supported", additional_receipts: "0.00", receipt_note: null, active: true, version: 1, form_data: scheduleE }];
    payload.activities.schedule_f = [{ id: scheduleFId, name: "Imported farm", owner_role: "taxpayer", implementation_status: "supported", additional_receipts: "0.00", receipt_note: null, active: true, version: 1, form_data: scheduleF }];
    payload.mappings = [
      { id: randomUUID(), sourceRecordId: sourceId, sourceField: "boxes.nonemployeeCompensation", sourceAmount: "1000.00", targetType: "schedule_c", targetActivityId: scheduleCId, allocationMethod: "amount", allocatedAmount: "400.00", percentage: null, reason: null, status: "accepted", version: 1 },
      { id: randomUUID(), sourceRecordId: sourceId, sourceField: "boxes.nonemployeeCompensation", sourceAmount: "1000.00", targetType: "schedule_c", targetActivityId: scheduleCId, allocationMethod: "amount", allocatedAmount: "600.00", percentage: null, reason: null, status: "accepted", version: 1 },
    ];

    const raw = new TextEncoder().encode(JSON.stringify(payload));
    const preview = await stageCanonicalImport(admin, clientId, 2025, "schedule-cef.json", raw);
    const committed = await commitPersistedImport(admin, clientId, 2025, preview.batchId, preview.changes.map(({ id }) => ({ changeId: id, decision: "use_imported" })));
    const activityState = await getActivityFormState(admin, clientId, 2025);
    expect(activityState.activities.filter(({ active }) => active).map(({ type }) => type).sort()).toEqual(["schedule_c", "schedule_e", "schedule_f"]);
    expect(activityState.activities.find(({ id }) => id === scheduleCId)).toMatchObject({ mappedReceipts: "1000.00", additionalReceipts: "100.00" });
    const mappingState = await getMappingState(admin, clientId, 2025);
    const importedSource = mappingState.sources.find(({ field, amount }) => field === "boxes.nonemployeeCompensation" && amount === "1000.00");
    expect(importedSource?.mappings).toHaveLength(2);
    expect(importedSource?.reconciliation).toMatchObject({ allocatedAmount: "1000.00", unresolvedAmount: "0.00", status: "fully_mapped" });

    const calculation = await runPersistedCalculation(admin, clientId, 2025, activityState.revision);
    const database = new pg.Client({ connectionString });
    await database.connect();
    const snapshot = await database.query<{ input_snapshot: any }>("SELECT input_snapshot FROM calculation_runs WHERE id=$1", [calculation.id]);
    expect(snapshot.rows[0]?.input_snapshot.scheduleCActivities[0]).toMatchObject({ id: scheduleCId, grossReceipts: "1100.00" });
    expect(snapshot.rows[0]?.input_snapshot.scheduleEActivities[0]).toMatchObject({ id: scheduleEId, rentsReceived: "5000.00" });
    expect(snapshot.rows[0]?.input_snapshot.scheduleFActivities[0]).toMatchObject({ id: scheduleFId, income: { livestockProduceSales: "7000.00" } });
    await database.end();

    await rollbackPersistedImport(admin, clientId, 2025, preview.batchId);
    const rolledBackActivities = await getActivityFormState(admin, clientId, 2025);
    expect(rolledBackActivities.activities.filter(({ active }) => active)).toHaveLength(0);
    const rolledBackMappings = await getMappingState(admin, clientId, 2025);
    expect(rolledBackMappings.sources.flatMap(({ mappings }) => mappings)).toHaveLength(0);
    expect(committed.replayed).toBe(false);
  });
});
