import pg from "pg";

interface Check { name: string; passed: boolean; detail: string }
const checks: Check[] = [];
const check = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail });
const value = (name: string) => process.env[name]?.trim() ?? "";
const strong = (name: string) => value(name).length >= 32;
const base64Bytes = (name: string) => { try { return Buffer.from(value(name), "base64").byteLength; } catch { return 0; } };
const httpsUrl = (name: string) => { try { return new URL(value(name)).protocol === "https:"; } catch { return false; } };
const productionDatabaseUrl = () => {
  try {
    const parsed = new URL(value("DATABASE_URL"));
    return ["postgresql:", "postgres:"].includes(parsed.protocol) && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch { return false; }
};

check("Production environment", value("APP_ENV") === "production", "APP_ENV must equal production.");
check("Database configuration", productionDatabaseUrl(), "A non-loopback PostgreSQL production URL is required.");
check("Supabase server endpoint", httpsUrl("SUPABASE_URL"), "SUPABASE_URL must use HTTPS.");
check("Supabase publishable key", value("SUPABASE_PUBLISHABLE_KEY").length >= 20, "A Supabase publishable key is required.");
check("Browser Supabase endpoint", value("NEXT_PUBLIC_SUPABASE_URL") === value("SUPABASE_URL") && httpsUrl("NEXT_PUBLIC_SUPABASE_URL"), "Browser and server Supabase URLs must match.");
check("Browser publishable key", value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY").length >= 20 && value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") === value("SUPABASE_PUBLISHABLE_KEY"), "A browser publishable key is required and must match the server key.");
check("Authentication flow encryption", base64Bytes("NEXUS_AUTH_FLOW_KEY") === 32, "NEXUS_AUTH_FLOW_KEY must decode to exactly 32 bytes.");
check("Authentication attempt hashing", strong("AUTH_RATE_LIMIT_SECRET"), "AUTH_RATE_LIMIT_SECRET must contain at least 32 characters.");
check("Trusted network boundary", /^[a-z0-9-]{2,64}$/.test(value("NEXUS_TRUSTED_NETWORK_HEADER")), "Name the proxy-overwritten client-IP header.");
check("Recovery redirect", httpsUrl("NEXUS_AUTH_RECOVERY_REDIRECT_URL"), "Recovery redirect must use HTTPS.");
check("Malware scanner", httpsUrl("NEXUS_MALWARE_SCANNER_URL") && strong("NEXUS_MALWARE_SCANNER_TOKEN"), "Approved scanner HTTPS URL and strong credential are required.");
check("Source encryption key", base64Bytes("NEXUS_SOURCE_ENCRYPTION_KEY") === 32, "Source encryption key must decode to exactly 32 bytes.");
check("Monitoring ownership", value("NEXUS_MONITORING_PROVIDER").length > 1 && value("NEXUS_INCIDENT_OWNER").length > 1, "Monitoring provider and incident owner are required.");
check("Security ownership", value("NEXUS_SECURITY_OWNER").length > 1, "A named security owner is required.");
check("Product ownership", value("NEXUS_PRODUCT_OWNER").length > 1 && value("NEXUS_SCOPE_APPROVAL_REF").length > 1, "Product owner and signed scope reference are required.");
check("Tax-rule ownership", value("NEXUS_TAX_RULE_OWNER").length > 1 && value("NEXUS_TAX_RULE_APPROVAL_REF").length > 1, "Qualified tax owner and approval reference are required.");
check("Retention approval", value("NEXUS_RETENTION_POLICY_REF").length > 1, "Approved retention policy reference is required.");
check("Production-data authorization", value("NEXUS_PRODUCTION_DATA_AUTHORIZATION_REF").length > 1, "Explicit production-data authorization is required.");
const rpo = Number(value("NEXUS_BACKUP_RPO_MINUTES")); const rto = Number(value("NEXUS_BACKUP_RTO_MINUTES"));
check("Backup provider and objectives", value("NEXUS_BACKUP_PROVIDER").length > 1 && rpo > 0 && rpo <= 60 && rto > 0 && rto <= 240 && value("NEXUS_BACKUP_RESTORE_EVIDENCE_REF").length > 1, "Provider, RPO ≤60m, RTO ≤240m and restore evidence are required.");

if (value("DATABASE_URL")) {
  const database = new pg.Client({ connectionString: value("DATABASE_URL"), connectionTimeoutMillis: 8_000 });
  try {
    await database.connect();
    const migrations = await database.query<{ present: boolean }>("SELECT EXISTS(SELECT 1 FROM _migrations WHERE name='0022_external_identities.sql') AS present");
    check("Production schema", migrations.rows[0]?.present === true, "Migration 0022 must be present.");
    const identities = await database.query<{ count: string }>("SELECT count(*)::text AS count FROM external_identities WHERE provider_code='supabase'");
    check("Provisioned identities", Number(identities.rows[0]?.count ?? 0) > 0, "At least one Supabase identity must be explicitly linked.");
  } catch {
    check("Production database connection", false, "Database connection or readiness query failed.");
  } finally {
    await database.end().catch(() => undefined);
  }
}

if (httpsUrl("SUPABASE_URL") && value("SUPABASE_PUBLISHABLE_KEY")) {
  try {
    const response = await fetch(`${value("SUPABASE_URL").replace(/\/$/, "")}/auth/v1/health`, { headers: { apikey: value("SUPABASE_PUBLISHABLE_KEY") }, signal: AbortSignal.timeout(10_000) });
    check("Supabase Auth health", response.ok, "Supabase Auth health endpoint must respond successfully.");
  } catch { check("Supabase Auth health", false, "Supabase Auth health request failed."); }
}

process.stdout.write(`${JSON.stringify({ ready: checks.every(({ passed }) => passed), checks }, null, 2)}\n`);
if (checks.some(({ passed }) => !passed)) process.exitCode = 1;
