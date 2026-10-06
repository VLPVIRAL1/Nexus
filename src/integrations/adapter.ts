export interface IntegrationCapabilities {
  vendor: string;
  supportedTaxYears: number[];
  clientProfileExport: boolean;
  returnDataExport: boolean;
  returnDataImport: boolean;
  returnCreation: boolean;
  returnCalculation: boolean;
  efileStatus: boolean;
}
export interface IntegrationResult { status: "succeeded" | "failed" | "unavailable"; message: string; batchId?: string; }
export interface TaxSoftwareAdapter {
  getCapabilities(): Promise<IntegrationCapabilities>;
  validateConnection(): Promise<IntegrationResult>;
  exportClientProfile(clientId: string): Promise<IntegrationResult>;
  exportReturnData(taxYearId: string): Promise<IntegrationResult>;
  importReturnData(taxYearId: string): Promise<IntegrationResult>;
  createReturn?(taxYearId: string): Promise<IntegrationResult>;
  calculateReturn?(taxYearId: string): Promise<IntegrationResult>;
  getEfileStatus?(taxYearId: string): Promise<IntegrationResult>;
}
