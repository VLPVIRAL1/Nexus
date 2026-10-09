"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

interface Factor { id: string; label: string }
interface Enrollment { factorId: string; secret: string; uri: string }

export function AuthenticationForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firmId, setFirmId] = useState("");
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"password" | "mfa">("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitPassword(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, firmId: firmId || null }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error === "rate_limited" ? "Too many attempts. Wait before trying again." : "Sign-in was not accepted.");
      if (body.status === "authenticated") { window.location.assign("/dashboard"); return; }
      const nextFactors = Array.isArray(body.factors) ? body.factors as Factor[] : [];
      const nextEnrollment = body.enrollment as Enrollment | null;
      setFactors(nextFactors); setEnrollment(nextEnrollment); setFactorId(nextEnrollment?.factorId ?? nextFactors[0]?.id ?? ""); setPassword(""); setStep("mfa");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Sign-in was not accepted."); }
    finally { setBusy(false); }
  }

  async function submitMfa(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await fetch("/api/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ factorId, code }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error === "rate_limited" ? "Too many attempts. Wait before trying again." : "The verification code was not accepted.");
      window.location.assign("/dashboard");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The verification code was not accepted."); }
    finally { setBusy(false); }
  }

  return <div className="auth-shell"><section className="auth-card" aria-labelledby="auth-title">
    <div className="auth-brand"><span className="brand-mark">N</span><span><strong>Nexus Tax</strong><small>Professional</small></span></div>
    <div><p className="eyebrow">SECURE WORKSPACE</p><h1 id="auth-title">{step === "password" ? "Sign in" : enrollment ? "Enroll MFA" : "Verify MFA"}</h1><p>{step === "password" ? "Use your firm-managed Supabase identity." : "A current authenticator code is required before tax data can be accessed."}</p></div>
    {step === "password" ? <form className="auth-form" onSubmit={submitPassword}>
      <label><span>Email</span><input type="email" autoComplete="username" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label><span>Password</span><input type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label><span>Firm ID <small>Only required for multi-firm users</small></span><input inputMode="text" autoComplete="off" value={firmId} onChange={(event) => setFirmId(event.target.value)} placeholder="Optional UUID" /></label>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <button className="button primary" disabled={busy}>{busy ? "Signing in…" : "Continue"}</button>
      <Link href="/auth/recovery">Forgot password?</Link>
    </form> : <form className="auth-form" onSubmit={submitMfa}>
      {enrollment ? <div className="auth-enrollment"><strong>Add Nexus Tax to your authenticator</strong><p>Enter this setup key manually, then provide the six-digit code. Do not share or retain the key after enrollment.</p><code>{enrollment.secret}</code><details><summary>Authenticator URI</summary><code>{enrollment.uri}</code></details></div> : factors.length > 1 ? <label><span>Authenticator</span><select value={factorId} onChange={(event) => setFactorId(event.target.value)}>{factors.map((factor) => <option value={factor.id} key={factor.id}>{factor.label}</option>)}</select></label> : null}
      <label><span>Six-digit code</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <button className="button primary" disabled={busy || code.length !== 6 || !factorId}>{busy ? "Verifying…" : "Verify and sign in"}</button>
      <button className="auth-text-button" type="button" onClick={() => { setStep("password"); setCode(""); setError(null); }}>Start again</button>
    </form>}
  </section></div>;
}

export function RecoveryRequestForm() {
  const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false); const [submitted, setSubmitted] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { const response = await fetch("/api/auth/recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }); if (!response.ok) { const body = await response.json(); throw new Error(body.error === "rate_limited" ? "Too many requests. Wait before trying again." : "Recovery is temporarily unavailable."); } setSubmitted(true); } catch (caught) { setError(caught instanceof Error ? caught.message : "Recovery is temporarily unavailable."); } finally { setBusy(false); } }
  return <div className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="brand-mark">N</span><span><strong>Nexus Tax</strong><small>Professional</small></span></div><div><p className="eyebrow">ACCOUNT RECOVERY</p><h1>Reset your password</h1><p>For privacy, the same response is shown whether or not an account exists.</p></div>{submitted ? <div className="auth-success" role="status"><strong>Request accepted</strong><p>If the account is eligible, its owner will receive the provider-managed recovery message.</p><Link href="/login">Return to sign in</Link></div> : <form className="auth-form" onSubmit={submit}><label><span>Email</span><input type="email" autoComplete="username" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} /></label>{error ? <p className="auth-error" role="alert">{error}</p> : null}<button className="button primary" disabled={busy}>{busy ? "Submitting…" : "Send recovery email"}</button><Link href="/login">Return to sign in</Link></form>}</section></div>;
}
