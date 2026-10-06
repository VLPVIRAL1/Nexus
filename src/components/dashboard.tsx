import { AlertCircle, ArrowRight, CheckCircle2, Clock3, FileWarning, Users } from "lucide-react";
import Link from "next/link";
import { clients } from "@/domain/demo-data";
import { StatusPill } from "./status";

const metrics = [
  { label: "Active clients", value: "184", detail: "+12 this month", icon: Users, tone: "blue" },
  { label: "In preparation", value: "37", detail: "9 updated today", icon: Clock3, tone: "navy" },
  { label: "Open points", value: "26", detail: "6 assigned to you", icon: FileWarning, tone: "amber" },
  { label: "Ready for review", value: "8", detail: "3 due this week", icon: CheckCircle2, tone: "green" },
  { label: "Blocking errors", value: "5", detail: "Across 4 returns", icon: AlertCircle, tone: "red" },
];

export function Dashboard() {
  return (
    <>
      <div className="page-header">
        <div><p className="eyebrow">Tuesday, October 6</p><h1>Preparation dashboard</h1><p>2025 individual returns across your firm workspace.</p></div>
        <div className="header-actions"><button className="button secondary">Import client JSON</button><Link className="button primary" href="/clients">New client</Link></div>
      </div>
      <section className="metrics-strip" aria-label="Preparation summary">
        {metrics.map(({ label, value, detail, icon: Icon, tone }) => (
          <article className="metric" key={label}>
            <span className={`metric-icon ${tone}`}><Icon size={17} /></span>
            <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
          </article>
        ))}
      </section>
      <section className="panel work-queue">
        <div className="panel-heading">
          <div><h2>Work queue</h2><p>Returns requiring preparation or review action</p></div>
          <div className="queue-filters"><button className="filter active">All returns <span>21</span></button><button className="filter">My work <span>11</span></button><button className="filter">Needs attention <span>5</span></button></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Client</th><th>Tax year</th><th>Status</th><th>Preparer</th><th>Reviewer</th><th className="num">Open points</th><th className="num">Blockers</th><th>Last updated</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td><Link className="client-link" href={`/clients/${client.id === "sample" ? "sample" : "sample"}/years/2025`}><span className="initials">{client.taxpayer.split(" ").map((n) => n[0]).join("")}</span><span><strong>{client.taxpayer}{client.spouse ? ` & ${client.spouse.split(" ")[0]}` : ""}</strong><small>{client.code} · {client.maskedTin}</small></span></Link></td>
                  <td><strong>{client.taxYear}</strong><small className="cell-subtext">{client.returnType}</small></td>
                  <td><StatusPill status={client.status} /></td>
                  <td>{client.preparer}</td><td>{client.reviewer}</td>
                  <td className="num"><span className={client.openPoints ? "count warning-count" : "count"}>{client.openPoints}</span></td>
                  <td className="num"><span className={client.blockers ? "count blocker-count" : "count"}>{client.blockers}</span></td>
                  <td>{client.updatedAt}</td><td><ArrowRight size={16} className="row-arrow" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
