import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpus, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import pg from "pg";
import template from "../examples/2025/blank-taxpayer-template.json";
import { previewImport } from "../src/services/import-service";
import { calculateFederalReturn2025, type CalculationInput2025 } from "../src/tax-engine/2025";

const sourceConnection = process.env.DATABASE_URL;
if (!sourceConnection) throw new Error("DATABASE_URL is required.");
if (process.env.APP_ENV === "production") throw new Error("The performance exercise cannot target production.");
const sourceUrl = new URL(sourceConnection);
if (!new Set(["127.0.0.1", "localhost"]).has(sourceUrl.hostname) || sourceUrl.pathname !== "/nexus_tax") throw new Error("The performance exercise is restricted to the local nexus_tax development database.");
const databaseName = `nexus_performance_${Date.now()}_${process.pid}`;
if (!/^nexus_performance_\d+_\d+$/.test(databaseName)) throw new Error("Performance database name was not safely resolved.");
const benchmarkUrl = new URL(sourceUrl); benchmarkUrl.pathname = `/${databaseName}`;
const adminUrl = new URL(sourceUrl); adminUrl.pathname = "/postgres";
const firmId = randomUUID(); const userId = randomUUID();
const admin = new pg.Client({ connectionString: adminUrl.toString() });
let clients: pg.Client[] = [];

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  execFileSync("npm", ["run", "db:migrate"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: benchmarkUrl.toString() }, stdio: "ignore" });
  const setup = new pg.Client({ connectionString: benchmarkUrl.toString() });
  await setup.connect();
  await setup.query("INSERT INTO firms(id,name) VALUES($1,'Synthetic Performance Firm')", [firmId]);
  await setup.query("INSERT INTO users(id,email,display_name) VALUES($1,$2,'Synthetic Performance Admin')", [userId, `${userId}@example.invalid`]);
  await setup.query("INSERT INTO memberships(firm_id,user_id,role) VALUES($1,$2,'admin')", [firmId, userId]);
  await setup.query(`INSERT INTO clients(id,firm_id,client_code,display_name,updated_at)
    SELECT gen_random_uuid(),$1,'P'||lpad(value::text,5,'0'),'Synthetic Performance Client '||lpad(value::text,5,'0'),now()-(value||' seconds')::interval
    FROM generate_series(1,10000) value`, [firmId]);
  await setup.query("INSERT INTO tax_years(client_id,tax_year,preparation_status,updated_at) SELECT id,2025,'in_preparation',updated_at FROM clients WHERE firm_id=$1", [firmId]);
  await setup.query("ANALYZE clients; ANALYZE tax_years;");
  const target = await setup.query<{ id: string }>("SELECT id FROM clients WHERE firm_id=$1 ORDER BY client_code LIMIT 1", [firmId]);
  const targetClientId = target.rows[0].id;
  await setup.end();

  clients = await Promise.all(Array.from({ length: 25 }, async () => { const client = new pg.Client({ connectionString: benchmarkUrl.toString() }); await client.connect(); return client; }));
  const listSql = `SELECT c.id,c.client_code,c.display_name,ty.tax_year,ty.preparation_status,
      MAX(u.display_name) FILTER (WHERE ca.kind='preparer') AS preparer,MAX(u.display_name) FILTER (WHERE ca.kind='reviewer') AS reviewer,
      COUNT(DISTINCT rp.id) FILTER (WHERE rp.review_status IN ('open','waiting'))::text AS open_points,
      COUNT(DISTINCT vi.id) FILTER (WHERE vi.resolved_at IS NULL AND vi.severity='blocking')::text AS blockers,ty.updated_at
    FROM clients c JOIN tax_years ty ON ty.client_id=c.id LEFT JOIN client_assignments ca ON ca.client_id=c.id LEFT JOIN users u ON u.id=ca.user_id
    LEFT JOIN review_points rp ON rp.tax_year_id=ty.id LEFT JOIN validation_issues vi ON vi.tax_year_id=ty.id
    WHERE c.firm_id=$1 AND c.archived_at IS NULL AND ($2::boolean OR EXISTS (SELECT 1 FROM client_assignments scope_ca WHERE scope_ca.client_id=c.id AND scope_ca.user_id=$3))
      AND ($4::text IS NULL OR lower(c.client_code) LIKE lower($4)||'%' OR lower(c.display_name) LIKE lower($4)||'%')
    GROUP BY c.id,ty.id ORDER BY ty.updated_at DESC LIMIT $5`;
  const openSql = `SELECT c.id,c.client_code,c.display_name,c.version,ty.id tax_year_id,ty.tax_year,ty.revision,ty.preparation_status,ty.calculation_status,ty.updated_at
    FROM clients c JOIN tax_years ty ON ty.client_id=c.id WHERE c.id=$1 AND c.firm_id=$2 AND c.archived_at IS NULL`;
  for (const client of clients) await client.query(listSql, [firmId, true, userId, null, 100]);
  const typicalList = await concurrentMeasurements(clients, 4, (client) => client.query(listSql, [firmId, true, userId, null, 100]));
  const clientSearch = await concurrentMeasurements(clients, 4, (client) => client.query(listSql, [firmId, true, userId, "P009", 100]));
  const openReturn = await concurrentMeasurements(clients, 4, (client) => client.query(openSql, [targetClientId, firmId]));

  const calculationInput = supportedInputWithWages(100);
  const calculation = measurements(50, () => { calculateFederalReturn2025(calculationInput); });
  const importPayload = structuredClone(template) as any;
  const documentId = randomUUID();
  importPayload.source_documents = [{ id: documentId, file_name: "synthetic-performance.pdf" }];
  importPayload.forms.w2 = Array.from({ length: 1000 }, (_, index) => ({ id: randomUUID(), external_source_id: `performance-w2-${index}`, source_document_id: documentId, form_year: 2025, recipient_role: "taxpayer", corrected: false, void: false, raw_fields: [], unmapped_source_fields: [], version: 1, box1: "100.00" }));
  const importBytes = new TextEncoder().encode(JSON.stringify(importPayload));
  const importPreview = measurements(10, () => { previewImport(importBytes, {}, 1); });

  const metrics = {
    typicalClientListP95Ms: p95(typicalList), clientSearchP95Ms: p95(clientSearch), openReturnP95Ms: p95(openReturn),
    calculation100RecordsP95Ms: p95(calculation), importPreview1000RecordsP95Ms: p95(importPreview),
  };
  const targets = { typicalClientListP95Ms: 1000, clientSearchP95Ms: 1000, openReturnP95Ms: 2000, calculation100RecordsP95Ms: 2000, importPreview1000RecordsP95Ms: 10000 };
  const failures = Object.entries(metrics).filter(([name, value]) => value > targets[name as keyof typeof targets]).map(([name]) => name);
  process.stdout.write(`${JSON.stringify({ status: failures.length ? "failed" : "passed", dataset: { clients: 10000, concurrentStaff: 25, sourceRecords: 100, importRecords: 1000 }, environment: { node: process.version, cpuCount: cpus().length, cpuModel: cpus()[0]?.model, memoryGiB: Number((totalmem() / 1024 ** 3).toFixed(1)), database: "PostgreSQL local container", network: "loopback" }, metrics, targets, failures })}\n`);
  if (failures.length) process.exitCode = 1;
} finally {
  await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`).catch(() => undefined);
  await admin.end().catch(() => undefined);
}

async function concurrentMeasurements(pool: pg.Client[], rounds: number, work: (client: pg.Client) => Promise<unknown>) {
  const values: number[] = [];
  for (let round = 0; round < rounds; round += 1) await Promise.all(pool.map(async (client) => { const start = performance.now(); await work(client); values.push(performance.now() - start); }));
  return values;
}
function measurements(count: number, work: () => void) { const values: number[] = []; for (let index = 0; index < count; index += 1) { const start = performance.now(); work(); values.push(performance.now() - start); } return values; }
function p95(values: number[]) { const sorted = [...values].sort((a, b) => a - b); return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)].toFixed(2)); }
function supportedInputWithWages(count: number): CalculationInput2025 { return { calculationId: "performance", inputRevision: 1, filingStatus: "single", eligibility: { fullYearUsResident: true, claimableAsDependent: false, hasDependents: false, taxpayerAge65OrOlder: false, taxpayerBlind: false, spouseAge65OrOlder: false, spouseBlind: false, usesItemizedDeductions: false, allRequiredIntakeAnswered: true, documentsCompleteAttested: true, unsupportedApplicableTopics: [], treatmentScreens: { earnedIncomeCredit: "ruled_out", otherCredits: "ruled_out", alternativeMinimumTax: "ruled_out", netInvestmentIncomeTax: "ruled_out", additionalMedicareTax: "ruled_out", schedule1AAdditionalDeductions: "ruled_out", estimatedOrExtensionPayments: "ruled_out", specialFilingElection: "ruled_out" } }, scheduleBScreening: { foreignAccount: "no", foreignTrust: "no", otherScheduleBTrigger: "no" }, wages: Array.from({ length: count }, (_, index) => ({ id: `w2-${index}`, owner: "taxpayer" as const, wages: "1000.00", federalWithholding: "100.00", socialSecurityWages: "1000.00" })), interest: [], dividends: [], scheduleCActivities: [], businessWithholding: [] }; }
