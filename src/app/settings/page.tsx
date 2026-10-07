import { Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";

export default function SettingsPage() {
  return <AppShell><div className="page-header"><div><p className="eyebrow">SYSTEM</p><h1>Settings</h1><p>Environment-level identity, encryption, scanning and integrations are configured outside the tax-entry workflow.</p></div></div><section className="panel access-restricted"><Settings size={20}/><div><h2>No self-service production settings</h2><p>This development build intentionally exposes no controls that imply an unconfigured identity provider, scanner, managed key, filing service or vendor integration is active.</p></div></section></AppShell>;
}
