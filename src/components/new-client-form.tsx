"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function NewClientForm() {
  const router = useRouter();
  const [clientCode, setClientCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    const response = await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientCode, displayName }) });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) { setError(body.message ?? "Unable to create client."); return; }
    router.push(`/clients/${body.id}`);
    router.refresh();
  }

  return (
    <>
      <div className="page-header"><div><p className="eyebrow">Client management</p><h1>New client</h1><p>Create the firm-scoped client shell before adding an isolated tax year.</p></div><Link className="button secondary" href="/clients"><ArrowLeft size={14} /> Back to clients</Link></div>
      <form className="panel client-form" onSubmit={submit}>
        <label><span>Client code</span><input required maxLength={30} pattern="[A-Za-z0-9_-]+" value={clientCode} onChange={(event) => setClientCode(event.target.value)} autoComplete="off" /></label>
        <label><span>Display name</span><input required maxLength={200} value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="off" /></label>
        <p className="wizard-note">Use a firm identifier and client display name only. Add protected taxpayer identifiers through the authorized person workflow after production encryption is configured.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="header-actions"><button className="button primary" disabled={saving} type="submit">{saving ? "Creating…" : "Create client"}</button><Link className="button secondary" href="/clients">Cancel</Link></div>
      </form>
    </>
  );
}
