"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

export function RecoveryConfirmation() {
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [busy, setBusy] = useState(false); const [complete, setComplete] = useState(false); const [error, setError] = useState<string | null>(null);
  const provider = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true } }) : null;
  }, []);
  async function submit(event: FormEvent) { event.preventDefault(); setError(null); if (password.length < 12) { setError("Use at least 12 characters."); return; } if (password !== confirm) { setError("Passwords do not match."); return; } if (!provider) { setError("Recovery provider configuration is unavailable."); return; } setBusy(true); try { const { data } = await provider.auth.getSession(); if (!data.session) throw new Error("The recovery link is invalid or expired."); const { error: updateError } = await provider.auth.updateUser({ password }); if (updateError) throw updateError; await provider.auth.signOut(); setPassword(""); setConfirm(""); setComplete(true); } catch (caught) { setError(caught instanceof Error ? caught.message : "The recovery link is invalid or expired."); } finally { setBusy(false); } }
  return <div className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="brand-mark">N</span><span><strong>Nexus Tax</strong><small>Professional</small></span></div><div><p className="eyebrow">ACCOUNT RECOVERY</p><h1>Choose a new password</h1><p>The provider recovery session must be current and valid.</p></div>{complete ? <div className="auth-success" role="status"><strong>Password updated</strong><p>Your provider session was signed out. Sign in again and complete MFA.</p><Link href="/login">Continue to sign in</Link></div> : <form className="auth-form" onSubmit={submit}><label><span>New password</span><input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label><span>Confirm password</span><input type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>{error ? <p className="auth-error" role="alert">{error}</p> : null}<button className="button primary" disabled={busy}>{busy ? "Updating…" : "Update password"}</button></form>}</section></div>;
}
