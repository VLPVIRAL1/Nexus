import { AlertCircle, AlertTriangle, CheckCircle2, CircleDot } from "lucide-react";
import type { PreparationStatus, Severity } from "@/domain/types";

export function StatusPill({ status }: { status: PreparationStatus }) {
  const tone = status === "Ready for Review" || status === "Reviewed Draft" ? "success" : status === "Changes Requested" ? "danger" : status === "Documents Pending" ? "warning" : "info";
  return <span className={`status-pill ${tone}`}><span />{status}</span>;
}

export function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "blocking") return <AlertCircle className="severity blocking" size={17} aria-label="Blocking" />;
  if (severity === "warning") return <AlertTriangle className="severity warning" size={17} aria-label="Warning" />;
  if (severity === "verified") return <CheckCircle2 className="severity verified" size={17} aria-label="Verified" />;
  return <CircleDot className="severity info" size={17} aria-label="Information" />;
}
