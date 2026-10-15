import { describe, expect, it } from "vitest";
import { diagnosticManifest2025 } from "@/diagnostics/manifest";
import { diagnosticFingerprint } from "@/server/diagnostic-lifecycle-service";

describe("diagnostic governance", () => {
  it("publishes a deterministic, unique 2025 baseline with explicit external gates", () => {
    expect(diagnosticManifest2025.definitionCount).toBe(diagnosticManifest2025.definitions.length);
    expect(diagnosticManifest2025.definitions.length).toBeGreaterThanOrEqual(250);
    expect(new Set(diagnosticManifest2025.definitions.map(({ code }) => code)).size).toBe(diagnosticManifest2025.definitions.length);
    expect(new Set(diagnosticManifest2025.definitions.map(({ definitionHash }) => definitionHash)).size).toBe(diagnosticManifest2025.definitions.length);
    expect(diagnosticManifest2025.externalGates.mef).toBe("disabled_pending_authorization");
    expect(diagnosticManifest2025.externalGates.independentTaxApproval).toBe("pending");
    for (const definition of diagnosticManifest2025.definitions) {
      expect(definition.taxYear).toBe(2025);
      expect(definition.jurisdiction).toBe("federal");
      expect(definition.filingChannel).toBe("preparation");
      expect(definition.owner).toBeTruthy();
      expect(definition.sourceLocations.length).toBeGreaterThan(0);
      expect(definition.definitionHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("uses material identity rather than messages or object key order for fingerprints", () => {
    const base = { code: "MAPPING_TARGET_UNSUPPORTED", severity: "blocking" as const, category: "mapping", recordId: "record-1", fieldPath: "boxes.amount", message: "First wording", resolutionAction: "Resolve", operands: { activityId: "activity-1", ordinal: 2 } };
    expect(diagnosticFingerprint(base)).toBe(diagnosticFingerprint({ ...base, message: "Reworded safely", operands: { ordinal: 2, activityId: "activity-1" } }));
    expect(diagnosticFingerprint(base)).not.toBe(diagnosticFingerprint({ ...base, operands: { activityId: "activity-2", ordinal: 2 } }));
  });
});
