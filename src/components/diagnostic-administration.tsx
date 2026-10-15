"use client";

import { AlertTriangle, CheckCircle2, FileCheck2, LockKeyhole, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

interface Definition { id:string; code:string; version:number; diagnosticClass:string; severity:string; stage:string; supportState:string; authorityStatus:string; owner:string; definitionHash:string; sourceLocations:string[]; authorityCount:number; conditionCount:number; fixtureCompleteCount:number }
interface State { canManage:boolean; scope:{taxYear:number;jurisdiction:string;filingChannel:string}; summary:{definitionCount:number;authorityVerifiedCount:number;authorityGapCount:number;conditionCount:number;fixtureCompleteCount:number;fixtureGapCount:number;occurrenceCount:number;openOccurrenceCount:number}; definitions:Definition[]; externalGates:Array<{key:string;status:string;reason:string;evidenceReference:string|null}>; releases:Array<{version:string;hash:string;status:string;definitionCount:number;createdAt:string}> }

export function DiagnosticAdministration({ initial }: { initial: State }) {
  const [query,setQuery]=useState("");
  const [severity,setSeverity]=useState("all");
  const [stage,setStage]=useState("all");
  const [gapsOnly,setGapsOnly]=useState(false);
  const filtered=useMemo(()=>initial.definitions.filter((item)=>{
    if(query&&!`${item.code} ${item.diagnosticClass} ${item.owner}`.toLowerCase().includes(query.toLowerCase()))return false;
    if(severity!=="all"&&item.severity!==severity)return false;
    if(stage!=="all"&&item.stage!==stage)return false;
    if(gapsOnly&&item.authorityCount>0&&item.fixtureCompleteCount===item.conditionCount)return false;
    return true;
  }),[gapsOnly,initial.definitions,query,severity,stage]);
  const stages=[...new Set(initial.definitions.map(({stage:item})=>item))].sort();
  if(!initial.canManage)return <><div className="page-header"><div><p className="eyebrow">ADMINISTRATION · DIAGNOSTIC GOVERNANCE</p><h1>Federal diagnostic registry</h1><p>Definition evidence and release gates are restricted to firm administrators.</p></div></div><section className="panel access-restricted"><ShieldAlert size={20}/><div><h2>Administrator permission required</h2><p>Your current firm role cannot view diagnostic governance metadata.</p></div></section></>;
  return <div className="diagnostic-admin">
    <div className="page-header"><div><p className="eyebrow">ADMINISTRATION · DIAGNOSTIC GOVERNANCE</p><h1>Federal diagnostic registry</h1><p>{initial.scope.taxYear} {initial.scope.jurisdiction} · {initial.scope.filingChannel}. Definitions and evidence history are append-only.</p></div></div>
    <section className="diagnostic-summary" aria-label="Diagnostic registry summary">
      <Metric icon={<FileCheck2/>} value={initial.summary.definitionCount} label="Versioned definitions"/>
      <Metric icon={<CheckCircle2/>} value={initial.summary.authorityVerifiedCount} label="Authority verified"/>
      <Metric icon={<AlertTriangle/>} value={initial.summary.fixtureGapCount} label="Fixture gaps" warning/>
      <Metric icon={<ShieldAlert/>} value={initial.summary.openOccurrenceCount} label="Open occurrences"/>
    </section>
    <section className="panel diagnostic-gates"><div className="panel-heading"><div><h2>External authorization gates</h2><p>Disabled and pending tracks cannot be represented as complete.</p></div></div><div>{initial.externalGates.map((gate)=><article key={gate.key}><LockKeyhole size={15}/><div><b>{human(gate.key)}</b><small>{gate.reason}</small></div><span className={`closure-status ${gate.status}`}>{human(gate.status)}</span></article>)}</div></section>
    <section className="panel diagnostic-registry"><div className="panel-heading"><div><h2>Definition and condition ledger</h2><p>{filtered.length} of {initial.definitions.length} definitions shown. Authority and trigger/non-trigger fixture gaps remain visible.</p></div></div>
      <div className="diagnostic-filters"><label><Search size={13}/><span className="sr-only">Search diagnostics</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Code, class, or owner"/></label><select aria-label="Severity" value={severity} onChange={(event)=>setSeverity(event.target.value)}><option value="all">All severities</option>{["blocking","error","warning","information"].map((item)=><option key={item}>{item}</option>)}</select><select aria-label="Evaluation stage" value={stage} onChange={(event)=>setStage(event.target.value)}><option value="all">All stages</option>{stages.map((item)=><option key={item}>{item}</option>)}</select><label className="diagnostic-gap-toggle"><input type="checkbox" checked={gapsOnly} onChange={(event)=>setGapsOnly(event.target.checked)}/>Evidence gaps only</label></div>
      <div className="diagnostic-table" role="table" aria-label="Diagnostic definitions"><div className="diagnostic-row heading" role="row"><span>Code</span><span>Class / stage</span><span>Severity</span><span>Evidence</span><span>Owner / version</span></div>{filtered.map((item)=><article className="diagnostic-row" role="row" key={item.id}><div><b>{item.code}</b><small title={item.definitionHash}>hash {item.definitionHash.slice(0,12)}</small></div><div><span>{human(item.diagnosticClass)}</span><small>{human(item.stage)}</small></div><span className={`issue-pill ${item.severity}`}>{human(item.severity)}</span><div><span>{item.authorityCount ? `${item.authorityCount} authority` : "Authority pending"}</span><small>{item.fixtureCompleteCount}/{item.conditionCount} trigger/non-trigger fixtures</small></div><div><span>{item.owner}</span><small>definition v{item.version}</small></div></article>)}</div>
    </section>
    <section className="panel diagnostic-release"><h2>Manifest release</h2>{initial.releases.map((release)=><p key={release.hash}><b>v{release.version}</b> · {human(release.status)} · {release.definitionCount} definitions · <code>{release.hash.slice(0,16)}</code></p>)}</section>
  </div>;
}

function Metric({icon,value,label,warning=false}:{icon:React.ReactNode;value:number;label:string;warning?:boolean}){return <div className={`panel diagnostic-metric ${warning?"warning":""}`}>{icon}<div><strong>{value}</strong><span>{label}</span></div></div>}
function human(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase())}
