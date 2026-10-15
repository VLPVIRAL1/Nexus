"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { boundedNumberInput, formatCurrencyInput, maskProtectedIdentifier, safeDraftStorageKey, sanitizeCurrencyInput } from "@/domain/workbench-field-format";

interface BaseFieldProps { label: string; hint?: string; error?: string; required?: boolean; id?: string }

export function WorkbenchMoneyField({ label, hint, error, required, id, value, onChange, allowNegative = false, disabled = false }: BaseFieldProps & { value: string; onChange: (value: string) => void; allowNegative?: boolean; disabled?: boolean }) {
  const generated = useId(); const inputId = id ?? generated; const describedBy = describedIds(inputId, hint, error);
  return <label className={`workbench-field ${error ? "has-error" : ""}`} htmlFor={inputId}><span>{label}{required ? <em>Required</em> : null}</span><span className="workbench-money-control"><b aria-hidden="true">$</b><input id={inputId} inputMode="decimal" disabled={disabled} required={required} aria-invalid={Boolean(error)} aria-describedby={describedBy} value={value} onChange={(event) => onChange(sanitizeCurrencyInput(event.target.value, allowNegative))} onBlur={() => onChange(formatCurrencyInput(value, allowNegative))}/></span><FieldHelp id={inputId} hint={hint} error={error}/></label>;
}

export function WorkbenchNumberField({ label, hint, error, required, id, value, onChange, minimum = 0, maximum = Number.MAX_SAFE_INTEGER, unit }: BaseFieldProps & { value: number | null; onChange: (value: number | null) => void; minimum?: number; maximum?: number; unit?: string }) {
  const generated = useId(); const inputId = id ?? generated; const describedBy = describedIds(inputId, hint, error);
  return <label className={`workbench-field ${error ? "has-error" : ""}`} htmlFor={inputId}><span>{label}{required ? <em>Required</em> : null}</span><span className="workbench-number-control"><input id={inputId} type="number" min={minimum} max={maximum} required={required} aria-invalid={Boolean(error)} aria-describedby={describedBy} value={value ?? ""} onChange={(event) => onChange(boundedNumberInput(event.target.value, minimum, maximum))}/>{unit ? <b>{unit}</b> : null}</span><FieldHelp id={inputId} hint={hint} error={error}/></label>;
}

export function WorkbenchTriStateField({ label, hint, error, required, id, value, onChange }: BaseFieldProps & { value: boolean | null; onChange: (value: boolean | null) => void }) {
  const generated = useId(); const inputId = id ?? generated; const describedBy = describedIds(inputId, hint, error);
  return <label className={`workbench-field ${error ? "has-error" : ""}`} htmlFor={inputId}><span>{label}{required ? <em>Required</em> : null}</span><select id={inputId} required={required} aria-invalid={Boolean(error)} aria-describedby={describedBy} value={value == null ? "unknown" : value ? "yes" : "no"} onChange={(event) => onChange(event.target.value === "unknown" ? null : event.target.value === "yes")}><option value="unknown">Needs review</option><option value="yes">Yes</option><option value="no">No</option></select><FieldHelp id={inputId} hint={hint} error={error}/></label>;
}

export function WorkbenchDateField({ label, hint, error, required, id, value, onChange, minimum, maximum }: BaseFieldProps & { value: string; onChange: (value: string) => void; minimum?: string; maximum?: string }) {
  const generated = useId(); const inputId = id ?? generated; const describedBy = describedIds(inputId, hint, error);
  return <label className={`workbench-field ${error ? "has-error" : ""}`} htmlFor={inputId}><span>{label}{required ? <em>Required</em> : null}</span><input id={inputId} type="date" min={minimum} max={maximum} required={required} aria-invalid={Boolean(error)} aria-describedby={describedBy} value={value} onChange={(event) => onChange(event.target.value)}/><FieldHelp id={inputId} hint={hint} error={error}/></label>;
}

export function WorkbenchIdentifierField({ label, hint, error, required, id, value, onChange, canReveal = false }: BaseFieldProps & { value: string; onChange: (value: string) => void; canReveal?: boolean }) {
  const generated = useId(); const inputId = id ?? generated; const describedBy = describedIds(inputId, hint, error); const [revealed, setRevealed] = useState(false);
  return <label className={`workbench-field ${error ? "has-error" : ""}`} htmlFor={inputId}><span>{label}{required ? <em>Required</em> : null}</span><span className="workbench-identifier-control"><input id={inputId} autoComplete="off" required={required} readOnly={!canReveal || !revealed} aria-invalid={Boolean(error)} aria-describedby={describedBy} value={canReveal && revealed ? value : maskProtectedIdentifier(value)} onChange={(event) => onChange(event.target.value)}/>{canReveal ? <button type="button" aria-label={revealed ? `Hide ${label}` : `Reveal ${label}`} onClick={() => setRevealed((current) => !current)}>{revealed ? <EyeOff size={14}/> : <Eye size={14}/>}</button> : null}</span><FieldHelp id={inputId} hint={hint ?? (!canReveal ? "Protected value; reveal permission is required to edit." : undefined)} error={error}/></label>;
}

export function SafeSessionDraftField({ scope, field, label, value, onChange, hint }: { scope: string; field: string; label: string; value: string; onChange: (value: string) => void; hint?: string }) {
  const key = safeDraftStorageKey(scope, field);
  useEffect(() => { const recovered = window.sessionStorage.getItem(key); if (recovered && !value) onChange(recovered); }, [key]);
  useEffect(() => { if (value) window.sessionStorage.setItem(key, value); else window.sessionStorage.removeItem(key); }, [key, value]);
  return <label className="workbench-field"><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)}/><small>{hint ?? "This non-sensitive draft is retained only for this browser tab. Never use it for TINs, account numbers, tax amounts, or source data."}</small></label>;
}

function describedIds(id: string, hint?: string, error?: string) { return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined; }
function FieldHelp({ id, hint, error }: { id: string; hint?: string; error?: string }) { return <>{hint ? <small id={`${id}-hint`}>{hint}</small> : null}{error ? <small className="workbench-field-error" id={`${id}-error`} role="alert">{error}</small> : null}</>; }
