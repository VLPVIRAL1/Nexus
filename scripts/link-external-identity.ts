import pg from "pg";

const argumentsByName = new Map(process.argv.slice(2).map((argument) => {
  const [name, ...rest] = argument.replace(/^--/, "").split("=");
  return [name, rest.join("=")];
}));
const provider = argumentsByName.get("provider") ?? "supabase";
const subject = argumentsByName.get("subject")?.trim();
const userEmail = argumentsByName.get("user-email")?.trim().toLowerCase();
const firmId = argumentsByName.get("firm-id")?.trim() || null;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
if (!/^[a-z0-9_-]{2,40}$/.test(provider)) throw new Error("--provider is invalid.");
if (!subject || subject.length > 512) throw new Error("--subject is required and must be at most 512 characters.");
if (!userEmail) throw new Error("--user-email is required.");

const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("BEGIN");
  const users = await client.query<{ id: string }>("SELECT id FROM users WHERE lower(email)=lower($1) FOR UPDATE", [userEmail]);
  if (users.rowCount !== 1) throw new Error("Exactly one local user must match --user-email.");
  const userId = users.rows[0].id;
  const memberships = await client.query<{ firm_id: string }>("SELECT firm_id FROM memberships WHERE user_id=$1 AND ($2::uuid IS NULL OR firm_id=$2::uuid)", [userId, firmId]);
  if (!memberships.rowCount) throw new Error("The local user is not a member of the requested firm scope.");
  await client.query("INSERT INTO external_identities(provider_code,provider_subject,user_id,linked_email) VALUES($1,$2,$3,$4)", [provider, subject, userId, userEmail]);
  await client.query("COMMIT");
  process.stdout.write(`Linked ${provider} identity to local user ${userId} across ${memberships.rowCount} eligible firm membership(s).\n`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
