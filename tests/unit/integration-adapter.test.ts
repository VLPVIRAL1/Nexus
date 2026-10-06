import { describe, expect, it } from "vitest";
import { PlannedAdapter } from "../../src/integrations/planned-adapter";

describe("planned vendor adapters", () => {
  it("never advertises an unverified capability", async () => {
    const adapter = new PlannedAdapter("Drake Tax");
    expect(await adapter.getCapabilities()).toEqual({ vendor: "Drake Tax", supportedTaxYears: [], clientProfileExport: false, returnDataExport: false, returnDataImport: false, returnCreation: false, returnCalculation: false, efileStatus: false });
    expect((await adapter.exportReturnData("year-1")).status).toBe("unavailable");
  });
});
