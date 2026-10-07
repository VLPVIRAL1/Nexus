"use client";

import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, Download, FileJson, FileSpreadsheet, FileText, LockKeyhole, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ArtifactType = "return_package_pdf" | "workpaper_xlsx" | "complete_json" | "source_only_json" | "blank_template_json";
interface ArtifactRecord { id:string; type:ArtifactType; status:string; completeness:string; fileName:string|null; mimeType:string|null; contentHash:string|null; stale:boolean; staleAt:string|null; createdAt:string; calculationRunId:string|null }
interface ArtifactJob { id:string;artifactId:string|null;type:ArtifactType;status:"queued"|"running"|"succeeded"|"failed"|"stale";attemptCount:number;maxAttempts:number;errorCode:string|null;errorMessage:string|null;createdAt:string;updatedAt:string }
interface ArtifactState { revision:number; canExportComplete:boolean; artifacts:ArtifactRecord[];jobs:ArtifactJob[] }
const definitions:Array<{type:ArtifactType;title:string;description:string;icon:typeof FileText;sensitive?:boolean}> = [
  { type:"return_package_pdf", title:"Draft return package", description:"Watermarked internal form previews with a run manifest and explicit missing-form disclosure.", icon:FileText },
  { type:"workpaper_xlsx", title:"Workpaper workbook", description:"Source tie-outs, forms, review points, overrides, traces, and raw-field appendices in XLSX.", icon:FileSpreadsheet },
  { type:"source_only_json", title:"Source-only JSON", description:"Portable source documents and normalized source records with an exclusion manifest.", icon:FileJson },
  { type:"blank_template_json", title:"Blank JSON template", description:"Versioned canonical skeleton for supported data interchange.", icon:FileJson },
  { type:"complete_json", title:"Complete canonical JSON", description:"Sensitive full-data export; identifier-reveal permission is required.", icon:LockKeyhole, sensitive:true },
];

export function PersistedOutputs({clientId,year,clientName,initial}:{clientId:string;year:number;clientName:string;initial:ArtifactState}) {
  const router=useRouter();
  const [generating,setGenerating]=useState<ArtifactType|null>(null);
  const [retrying,setRetrying]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const activeJobs=initial.jobs.some(({status})=>status==="queued"||status==="running");
  useEffect(()=>{if(!activeJobs)return;const timer=window.setInterval(()=>router.refresh(),2000);return()=>window.clearInterval(timer);},[activeJobs,router]);
  async function generate(type:ArtifactType){setGenerating(type);setError(null);const response=await fetch(`/api/clients/${clientId}/years/${year}/outputs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expectedRevision:initial.revision,artifactType:type})});const body=await response.json();setGenerating(null);if(!response.ok){setError(body.message??body.error??"Output generation failed.");return;}router.refresh();}
  async function retry(jobId:string){setRetrying(jobId);setError(null);const response=await fetch(`/api/clients/${clientId}/years/${year}/outputs/jobs/${jobId}/retry`,{method:"POST"});const body=await response.json();setRetrying(null);if(!response.ok){setError(body.message??body.error??"Job retry failed.");return;}router.refresh();}
  return <div className="return-page output-page">
    <div className="return-page-top"><Link href={`/clients/${clientId}/years/${year}`}><ArrowLeft size={14}/> {clientName} · {year}</Link><span>Revision {initial.revision}</span><b>{initial.artifacts.filter(({stale})=>!stale).length} current artifacts</b></div>
    <header><div><p>OUTPUTS · CONTENT-ADDRESSED ARTIFACTS</p><h1>Return packages and exports</h1><span>Every successful artifact is pinned to a calculation run, hashed, permission-checked, and automatically marked stale when return data changes.</span></div></header>
    {error?<p className="form-error" role="alert">{error}</p>:null}
    <section className="output-generator-grid">{definitions.map(({type,title,description,icon:Icon,sensitive})=>{const disabled=generating!==null||(sensitive&&!initial.canExportComplete);return <article className="panel output-generator" key={type}><Icon size={20}/><div><h2>{title}</h2><p>{description}</p></div><button className="button primary" disabled={disabled} onClick={()=>generate(type)}>{generating===type?"Queueing…":sensitive&&!initial.canExportComplete?"Permission required":"Queue generation"}</button></article>})}</section>
    <section className="panel output-history"><div className="panel-heading"><div><h2>Generation jobs</h2><p>Durable background jobs use bounded retries. Errors shown here contain operational context only, not taxpayer values.</p></div></div>{initial.jobs.length?<div className="output-table" role="table"><div className="output-row output-table-head" role="row"><span>Requested output</span><span>Updated</span><span>Attempts</span><span>Status</span><span>Action</span></div>{initial.jobs.map(job=><div className="output-row" role="row" key={job.id}><span><b>{job.type.replaceAll("_"," ")}</b><small><code>{job.id.slice(0,12)}</code></small></span><span>{new Date(job.updatedAt).toLocaleString()}<small>{job.errorCode??"No error"}</small></span><span>{job.attemptCount} / {job.maxAttempts}</span><span className={job.status==="failed"||job.status==="stale"?"artifact-stale":"artifact-current"}>{job.status==="queued"||job.status==="running"?<Clock3 size={13}/>:job.status==="succeeded"?<CheckCircle2 size={13}/>:<AlertCircle size={13}/>} {job.status}</span><span>{job.status==="failed"?<button className="button secondary" disabled={retrying!==null} onClick={()=>retry(job.id)}><RotateCcw size={13}/> {retrying===job.id?"Queueing…":"Retry"}</button>:job.errorMessage?<small>{job.errorMessage}</small>:"—"}</span></div>)}</div>:<p className="empty-panel">No generation jobs yet.</p>}</section>
    <section className="panel output-history"><div className="panel-heading"><div><h2>Artifact history</h2><p>Downloads are served from immutable stored bytes and verified against their SHA-256 digest.</p></div></div>{initial.artifacts.length?<div className="output-table" role="table"><div className="output-row output-table-head" role="row"><span>Artifact</span><span>Created</span><span>Run / digest</span><span>Status</span><span>Download</span></div>{initial.artifacts.map(artifact=><div className="output-row" role="row" key={artifact.id}><span><b>{artifact.fileName??artifact.type}</b><small>{artifact.type.replaceAll("_"," ")}</small></span><span>{new Date(artifact.createdAt).toLocaleString()}</span><span><code>{artifact.calculationRunId?.slice(0,10)??"—"}</code><small>{artifact.contentHash?.slice(0,16)??"hash unavailable"}</small></span><span className={artifact.stale?"artifact-stale":"artifact-current"}>{artifact.stale?<><AlertCircle size={13}/> Stale</>:<><CheckCircle2 size={13}/> Current</>}</span><span>{artifact.status==="succeeded"?<a className="button secondary" href={`/api/clients/${clientId}/years/${year}/outputs/${artifact.id}/download`}><Download size={13}/> Download</a>:artifact.status}</span></div>)}</div>:<p className="empty-panel">No persisted artifacts yet. A current calculation run is required before generation.</p>}</section>
  </div>;
}
