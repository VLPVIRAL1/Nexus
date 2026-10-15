import manifest from "@/diagnostics/diagnostic-manifest-2025.json";
import type pg from "pg";

export type DiagnosticManifestDefinition = {
  code: string;
  taxYear: number;
  jurisdiction: string;
  filingChannel: string;
  diagnosticClass: string;
  defaultSeverity: string;
  evaluationStage: string;
  supportState: string;
  authorityReviewStatus: string;
  owner: string;
  disposition: string;
  sourceLocations: string[];
  messageTemplate: string;
  resolutionTemplate: string;
  definitionHash: string;
};

export const diagnosticManifest2025 = manifest as typeof manifest & { definitions: DiagnosticManifestDefinition[] };

export async function syncDiagnosticManifest(client: pg.Client | pg.PoolClient) {
  const definitions = diagnosticManifest2025.definitions;
  await client.query(
    `INSERT INTO diagnostic_definitions(
       code,definition_version,tax_year,jurisdiction,filing_channel,diagnostic_class,default_severity,
       evaluation_stage,support_state,predicate_id,message_template,resolution_template,
       authority_review_status,owner,source_metadata,definition_hash
     )
     SELECT item->>'code',1,(item->>'taxYear')::integer,item->>'jurisdiction',item->>'filingChannel',
       item->>'diagnosticClass',item->>'defaultSeverity',item->>'evaluationStage',item->>'supportState',
       'legacy:'||(item->>'code'),item->>'messageTemplate',item->>'resolutionTemplate',
       item->>'authorityReviewStatus',item->>'owner',
       jsonb_build_object('sourceLocations',item->'sourceLocations','disposition',item->>'disposition','manifestHash',$2::text),
       item->>'definitionHash'
     FROM jsonb_array_elements($1::jsonb) item
     ON CONFLICT (code,definition_version,tax_year,jurisdiction,filing_channel) DO NOTHING`,
    [JSON.stringify(definitions), diagnosticManifest2025.manifestHash],
  );
  await client.query(
    `INSERT INTO diagnostic_conditions(condition_key,definition_id,supported_state,ui_destination)
     SELECT '2025:'||dd.code||':legacy-trigger',dd.id,
       CASE WHEN dd.support_state='deferred' THEN 'deferred' ELSE 'blocked' END,
       COALESCE(dd.topic_id,dd.canonical_paths[1],dd.source_metadata->'sourceLocations'->>0)
     FROM diagnostic_definitions dd
     WHERE dd.tax_year=2025 AND dd.jurisdiction='federal' AND dd.filing_channel='preparation'
     ON CONFLICT (condition_key) DO NOTHING`,
  );
  await client.query(
    `INSERT INTO diagnostic_manifest_releases(
       tax_year,jurisdiction,filing_channel,manifest_version,manifest_hash,release_status,definition_count
     ) VALUES(2025,'federal','preparation',$1,$2,'research_unapproved',$3)
     ON CONFLICT (manifest_hash) DO NOTHING`,
    [diagnosticManifest2025.schemaVersion, diagnosticManifest2025.manifestHash, definitions.length],
  );
}
