import type { IntegrationCapabilities, IntegrationResult, TaxSoftwareAdapter } from "./adapter";

export class PlannedAdapter implements TaxSoftwareAdapter {
  constructor(private readonly vendor: "CCH Axcess" | "Drake Tax") {}
  async getCapabilities(): Promise<IntegrationCapabilities> { return { vendor: this.vendor, supportedTaxYears: [], clientProfileExport: false, returnDataExport: false, returnDataImport: false, returnCreation: false, returnCalculation: false, efileStatus: false }; }
  async validateConnection(): Promise<IntegrationResult> { return unavailable(this.vendor); }
  async exportClientProfile(_clientId: string): Promise<IntegrationResult> { return unavailable(this.vendor); }
  async exportReturnData(_taxYearId: string): Promise<IntegrationResult> { return unavailable(this.vendor); }
  async importReturnData(_taxYearId: string): Promise<IntegrationResult> { return unavailable(this.vendor); }
}
function unavailable(vendor: string): IntegrationResult { return { status: "unavailable", message: `${vendor} is planned architecture only. No supported connection or transfer capability has been verified.` }; }
