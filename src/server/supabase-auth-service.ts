import "server-only";
import { isIP } from "node:net";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { IssuedSession } from "./session-service";
import { AuthenticationError, issueSessionFromVerifiedIdentity } from "./session-service";
import { enforceAuthenticationAttemptLimit } from "./auth-attempt-service";
import { databasePool } from "./database";
import { openAuthenticationFlow, sealAuthenticationFlow, type PendingAuthenticationFlow } from "./auth-flow-service";

export interface AuthenticationFactorOption { id: string; label: string }
export type BeginLoginResult =
  | { status: "authenticated"; session: IssuedSession }
  | { status: "mfa_required"; flowCookie: string; factors: AuthenticationFactorOption[]; enrollment: null }
  | { status: "mfa_enrollment_required"; flowCookie: string; factors: AuthenticationFactorOption[]; enrollment: { factorId: string; secret: string; uri: string } };

interface LoginInput { email: string; password: string; firmId?: string | null; networkIdentifier: string; userAgent: string | null }
interface CompleteMfaInput { flowCookie: string; factorId: string; code: string; networkIdentifier: string; userAgent: string | null }

export async function beginSupabasePasswordLogin(input: LoginInput, now = new Date()): Promise<BeginLoginResult> {
  await enforceAuthenticationAttemptLimit({ operation: "login", networkIdentifier: input.networkIdentifier, principalIdentifier: input.email }, now);
  const provider = supabaseProvider();
  const { data, error } = await provider.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error || !data.session || !data.user?.id || !data.user.email) throw new AuthenticationError();

  const assurance = await provider.auth.mfa.getAuthenticatorAssuranceLevel(data.session.access_token);
  if (assurance.error || !assurance.data) throw new AuthenticationError();
  if (assurance.data.currentLevel === "aal2") {
    return { status: "authenticated", session: await issueProvisionedExternalIdentitySession("supabase", data.user.id, input.firmId, recentMfaTime(assurance.data.currentAuthenticationMethods, now), input.userAgent, now) };
  }

  const verified = (data.user.factors ?? []).filter((factor) => factor.factor_type === "totp" && factor.status === "verified");
  let enrollment: { factorId: string; secret: string; uri: string } | null = null;
  let enrollmentFactorId: string | null = null;
  if (!verified.length) {
    const enrolled = await provider.auth.mfa.enroll({ factorType: "totp", friendlyName: "Nexus Tax" });
    if (enrolled.error || !enrolled.data?.totp) throw new AuthenticationError();
    enrollmentFactorId = enrolled.data.id;
    enrollment = { factorId: enrolled.data.id, secret: enrolled.data.totp.secret, uri: enrolled.data.totp.uri };
  }

  const flow: PendingAuthenticationFlow = {
    version: 1,
    provider: "supabase",
    subject: data.user.id,
    email: data.user.email,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    firmId: input.firmId?.trim() || null,
    allowedFactorIds: verified.map(({ id }) => id),
    enrollmentFactorId,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
  };
  const factors = verified.map(({ id, friendly_name: friendlyName }, index) => ({ id, label: friendlyName?.trim() || `Authenticator ${index + 1}` }));
  const flowCookie = sealAuthenticationFlow(flow);
  return enrollment
    ? { status: "mfa_enrollment_required", flowCookie, factors, enrollment }
    : { status: "mfa_required", flowCookie, factors, enrollment: null };
}

export async function completeSupabaseMfa(input: CompleteMfaInput, now = new Date()): Promise<IssuedSession> {
  const flow = openAuthenticationFlow(input.flowCookie, now);
  await enforceAuthenticationAttemptLimit({ operation: "login", networkIdentifier: input.networkIdentifier, principalIdentifier: flow.email }, now);
  if (![...flow.allowedFactorIds, flow.enrollmentFactorId].filter(Boolean).includes(input.factorId)) throw new AuthenticationError();
  const provider = supabaseProvider();
  const restored = await provider.auth.setSession({ access_token: flow.accessToken, refresh_token: flow.refreshToken });
  if (restored.error || !restored.data.session) throw new AuthenticationError();
  const verified = await provider.auth.mfa.challengeAndVerify({ factorId: input.factorId, code: input.code });
  if (verified.error || !verified.data?.access_token || verified.data.user?.id !== flow.subject) throw new AuthenticationError();
  const assurance = await provider.auth.mfa.getAuthenticatorAssuranceLevel(verified.data.access_token);
  if (assurance.error || assurance.data?.currentLevel !== "aal2") throw new AuthenticationError();
  return issueProvisionedExternalIdentitySession(flow.provider, flow.subject, flow.firmId, recentMfaTime(assurance.data.currentAuthenticationMethods, now), input.userAgent, now);
}

export async function requestSupabasePasswordRecovery(email: string, networkIdentifier: string, now = new Date()): Promise<void> {
  await enforceAuthenticationAttemptLimit({ operation: "account_recovery", networkIdentifier, principalIdentifier: email }, now);
  const redirectTo = requiredEnvironment("NEXUS_AUTH_RECOVERY_REDIRECT_URL");
  const { error } = await supabaseProvider().auth.resetPasswordForEmail(email, { redirectTo });
  if (error && process.env.NODE_ENV === "development") process.stderr.write(`Supabase recovery request was not accepted: ${error.code ?? "provider_error"}\n`);
}

export function trustedAuthenticationNetwork(request: Request): string {
  const configuredHeader = process.env.NEXUS_TRUSTED_NETWORK_HEADER?.trim().toLowerCase();
  if (!configuredHeader) {
    if (process.env.APP_ENV === "production") throw new Error("NEXUS_TRUSTED_NETWORK_HEADER is required in production.");
    return "127.0.0.1";
  }
  if (!/^[a-z0-9-]{2,64}$/.test(configuredHeader)) throw new Error("NEXUS_TRUSTED_NETWORK_HEADER is invalid.");
  const raw = request.headers.get(configuredHeader)?.split(",", 1)[0]?.trim();
  if (!raw || !isIP(raw)) throw new AuthenticationError();
  return raw;
}

export async function issueProvisionedExternalIdentitySession(provider: string, subject: string, requestedFirmId: string | null | undefined, mfaVerifiedAt: Date, userAgent: string | null, now = new Date()): Promise<IssuedSession> {
  const defaultFirm = requestedFirmId?.trim() || process.env.NEXUS_AUTH_DEFAULT_FIRM_ID?.trim() || null;
  const result = await databasePool().query<{ user_id: string; firm_id: string }>(
    `SELECT ei.user_id,m.firm_id
     FROM external_identities ei JOIN memberships m ON m.user_id=ei.user_id
     WHERE ei.provider_code=$1 AND ei.provider_subject=$2 AND ($3::uuid IS NULL OR m.firm_id=$3::uuid)
     ORDER BY m.created_at,m.id`,
    [provider, subject, defaultFirm],
  );
  if (result.rowCount !== 1) throw new AuthenticationError();
  const identity = result.rows[0];
  return issueSessionFromVerifiedIdentity({ userId: identity.user_id, firmId: identity.firm_id, mfaVerifiedAt, userAgent }, now);
}

function recentMfaTime(methods: ReadonlyArray<string | { method: string; timestamp: number }> | undefined, now: Date): Date {
  const timestamp = Math.max(0, ...(methods ?? []).flatMap((entry) => typeof entry === "object" && entry.method !== "password" && Number.isFinite(entry.timestamp) ? [entry.timestamp] : []));
  const verifiedAt = new Date(timestamp * 1000);
  if (!timestamp || verifiedAt.getTime() > now.getTime() || now.getTime() - verifiedAt.getTime() > 5 * 60 * 1000) throw new AuthenticationError("A recent MFA verification is required.");
  return verifiedAt;
}

function supabaseProvider(): SupabaseClient {
  return createClient(requiredEnvironment("SUPABASE_URL"), requiredEnvironment("SUPABASE_PUBLISHABLE_KEY"), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Supabase authentication.`);
  return value;
}
