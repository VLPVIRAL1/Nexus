import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
if (process.env.APP_ENV === "production") throw new Error("The recovery exercise cannot target production.");
const sourceUrl = new URL(connectionString);
if (!new Set(["127.0.0.1", "localhost"]).has(sourceUrl.hostname) || sourceUrl.pathname !== "/nexus_tax") throw new Error("The recovery exercise is restricted to the local nexus_tax development database.");

const recoveryDatabase = `nexus_recovery_${Date.now()}_${process.pid}`;
if (!/^nexus_recovery_\d+_\d+$/.test(recoveryDatabase)) throw new Error("Recovery database name was not safely resolved.");
const restoredUrl = new URL(sourceUrl);
restoredUrl.pathname = `/${recoveryDatabase}`;
const startedAt = Date.now();
let restoredClient: pg.Client | null = null;

try {
  const dump = docker(["compose", "exec", "-T", "postgres", "pg_dump", "-U", "nexus", "--format=custom", "--no-owner", "--no-privileges", "nexus_tax"]);
  docker(["compose", "exec", "-T", "postgres", "createdb", "-U", "nexus", recoveryDatabase]);
  docker(["compose", "exec", "-T", "postgres", "pg_restore", "-U", "nexus", "--no-owner", "--no-privileges", `--dbname=${recoveryDatabase}`], dump);

  const sourceClient = new pg.Client({ connectionString });
  restoredClient = new pg.Client({ connectionString: restoredUrl.toString() });
  await sourceClient.connect();
  await restoredClient.connect();
  const [source, restored] = await Promise.all([verificationManifest(sourceClient), verificationManifest(restoredClient)]);
  await sourceClient.end();
  if (source.fingerprint !== restored.fingerprint) throw new Error("Restored database fingerprint does not match the source snapshot.");
  if (!restored.auditChainValid) throw new Error("Restored audit-event chain is not internally consistent.");
  if (!restored.artifactHashesValid) throw new Error("A restored artifact byte hash does not match its stored content hash.");
  const elapsedSeconds = Number(((Date.now() - startedAt) / 1_000).toFixed(2));
  process.stdout.write(`${JSON.stringify({ status: "passed", elapsedSeconds, dumpBytes: dump.byteLength, counts: restored.counts, fingerprint: restored.fingerprint })}\n`);
} finally {
  if (restoredClient) await restoredClient.end().catch(() => undefined);
  docker(["compose", "exec", "-T", "postgres", "dropdb", "-U", "nexus", "--if-exists", recoveryDatabase]);
}

function docker(args: string[], input?: Buffer): Buffer {
  return execFileSync("docker", args, { cwd: process.cwd(), input, maxBuffer: 256 * 1024 * 1024, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
}

async function verificationManifest(client: pg.Client) {
  const queries = {
    migrations: "SELECT name,applied_at FROM _migrations ORDER BY name",
    sourceDocuments: "SELECT id,checksum,storage_id,scan_state,storage_version,disposed_at,disposed_by_id,disposal_run_id FROM source_documents ORDER BY id",
    sourceObjects: "SELECT id,object_key,object_state,storage_version,encode(digest(cipher_bytes,'sha256'),'hex') AS cipher_hash FROM source_object_blobs ORDER BY id",
    imports: "SELECT id,tax_year_id,batch_hash,import_status,result_revision,rolled_back_at,disposed_at,disposed_by_id,disposal_run_id,encode(digest(raw_payload,'sha256'),'hex') AS raw_payload_hash,encode(digest(convert_to(previous_snapshot::text,'UTF8'),'sha256'),'hex') AS previous_snapshot_hash,encode(digest(convert_to(committed_snapshot::text,'UTF8'),'sha256'),'hex') AS committed_snapshot_hash FROM import_batches ORDER BY id",
    importAttempts: "SELECT id,tax_year_id,import_batch_id,batch_hash,outcome FROM import_attempts ORDER BY id",
    mappings: "SELECT id,tax_year_id,source_record_id,source_field,source_amount::text,target_type,target_activity_id,allocated_amount::text,mapping_status,effective,version FROM source_mappings ORDER BY id",
    calculations: "SELECT id,tax_year_id,input_revision,input_hash,result_hash,engine_version,rule_version,calculation_status FROM calculation_runs ORDER BY id",
    artifacts: "SELECT id,tax_year_id,calculation_run_id,artifact_type,template_version,artifact_status,content_hash,disposed_at,disposed_by_id,disposal_run_id,encode(digest(artifact_bytes,'sha256'),'hex') AS byte_hash FROM generated_artifacts ORDER BY id",
    jobs: "SELECT id,tax_year_id,calculation_run_id,artifact_id,artifact_type,input_revision,template_version,job_status,attempt_count FROM artifact_jobs ORDER BY id",
    retentionPolicies: "SELECT id,firm_id,data_category,retention_months,disposition_action,version,updated_by_id FROM firm_retention_policies ORDER BY id",
    legalHolds: "SELECT id,firm_id,client_id,tax_year_id,hold_reference,placed_by_id,placed_at,released_by_id,released_at,version FROM legal_holds ORDER BY id",
    retentionDisposalRuns: "SELECT id,firm_id,policy_id,data_category,cutoff_at,policy_version,authorization_reference,candidate_count,disposed_count,held_count,skipped_count,evidence_hash,executed_by_id,executed_at FROM retention_disposal_runs ORDER BY id",
    retentionDisposalItems: "SELECT id,run_id,client_id,tax_year_id,record_type,record_id,outcome,integrity_hash,reason_code FROM retention_disposal_items ORDER BY id",
    audit: "SELECT id,firm_id,previous_hash,event_hash,created_at FROM audit_events ORDER BY firm_id,created_at,id",
  } as const;
  const entries = await Promise.all(Object.entries(queries).map(async ([name, sql]) => [name, (await client.query(sql)).rows] as const));
  const snapshot = Object.fromEntries(entries) as Record<string, Array<Record<string, unknown>>>;
  const auditRows = snapshot.audit ?? [];
  const priorByFirm = new Map<string, string | null>();
  let auditChainValid = true;
  for (const row of auditRows) {
    const firmId = String(row.firm_id);
    const expected = priorByFirm.get(firmId) ?? null;
    if ((row.previous_hash ?? null) !== expected) auditChainValid = false;
    priorByFirm.set(firmId, String(row.event_hash));
  }
  const artifactHashesValid = (snapshot.artifacts ?? []).every((row) => row.artifact_status !== "succeeded" || row.content_hash === row.byte_hash);
  const counts = Object.fromEntries(Object.entries(snapshot).map(([name, rows]) => [name, rows.length]));
  return { counts, auditChainValid, artifactHashesValid, fingerprint: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") };
}
