"use client";

import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleHelp,
  FileSearch,
  FileText,
  GripVertical,
  Keyboard,
  LayoutPanelLeft,
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings2,
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  findWorkbenchTopics,
  topicHref,
  workbenchGroups,
  workbenchTopicForIssue,
  workbenchTopics,
  type WorkbenchTopic,
  type WorkbenchTopicState,
} from "@/domain/preparer-workbench";
import type { TaxYearWorkspaceRecord } from "@/server/client-repository";
import { AppShell } from "./app-shell";

type ContextTab = "diagnostics" | "sources" | "trace" | "provenance";
type EditState = "current" | "dirty" | "saving";
interface ReviewIssue { id: string; code: string; severity: string; category: string; fieldPath: string | null; message: string; resolutionAction: string; creationRevision: number; definitionVersion?: number; evaluationStage?: string | null; origin?: string; fingerprint?: string; taxYear?: number; authorityStatus?: string; affectedForms?: string[] }
interface ReviewPoint { id: string; subject: string; status: string; assignedName: string | null; changedAfterReview: boolean }
interface ReviewPayload { revision: number; issues: ReviewIssue[]; points: ReviewPoint[]; auditEvents: Array<{ id: string; eventType: string; actorName: string; createdAt: string }> }
interface SourcePayload { revision: number; documents: Array<{ id: string; fileName: string; documentType: string; scanState: string; uploadedAt: string; checksum: string | null }> }
interface MappingPayload { revision: number; activities: Array<{ id: string; name: string; type: string; receiptNote: string | null }>; sources: Array<{ id: string; formType: string; label: string; amount: string; reconciliation: { status: string; unresolvedAmount: string }; mappings: Array<{ id: string; targetType: string; targetActivityId: string | null; allocatedAmount: string; note: string | null }> }> }
interface CalculationPayload { revision: number; calculationStatus: string; latestRun: null | { current: boolean; inputRevision: number; resultHash: string | null; engineVersion: string; ruleVersion: string; result: { trace?: Array<{ nodeId: string; formLine: string; ruleId: string; result: string }> } } }
interface Preferences { density: "compact" | "comfortable"; treeWidth: number; contextWidth: number; contextOpen: boolean; classic: boolean; bookmarks: string[]; recent: string[]; tourSeen: boolean }

const defaultPreferences: Preferences = { density: "comfortable", treeWidth: 244, contextWidth: 316, contextOpen: true, classic: false, bookmarks: [], recent: [], tourSeen: false };

export function PreparerWorkbench({ context, preferenceScope, children }: { context: TaxYearWorkspaceRecord; preferenceScope: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/clients/${context.clientId}/years/${context.year}`;
  const storageKey = `nexus:workbench:v1:${preferenceScope}`;
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [ready, setReady] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [contextOpenMobile, setContextOpenMobile] = useState(false);
  const [contextTab, setContextTab] = useState<ContextTab>("diagnostics");
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [sources, setSources] = useState<SourcePayload | null>(null);
  const [mapping, setMapping] = useState<MappingPayload | null>(null);
  const [calculation, setCalculation] = useState<CalculationPayload | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [editState, setEditState] = useState<EditState>("current");
  const [locationSuffix, setLocationSuffix] = useState("");
  const paletteInput = useRef<HTMLInputElement>(null);
  const previousPath = useRef(pathname);
  const restorationAttempted = useRef(false);
  const issueCursor = useRef(-1);
  const treeRef = useRef<HTMLElement>(null);
  const entryRef = useRef<HTMLElement>(null);
  const contextRef = useRef<HTMLElement>(null);

  const activeTopic = useMemo(() => currentTopic(pathname, base, locationSuffix), [pathname, base, locationSuffix]);
  const paletteResults = useMemo(() => findWorkbenchTopics(paletteQuery).slice(0, 18), [paletteQuery]);
  const blockerCount = review?.issues.filter(({ severity }) => severity === "blocking" || severity === "error").length ?? context.blockerCount;
  const warningCount = review?.issues.filter(({ severity }) => severity === "warning").length ?? context.warningCount;
  const openPointCount = review?.points.filter(({ status }) => status === "open" || status === "waiting").length ?? context.openReviewPointCount;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) as Partial<Preferences> : {};
      setPreferences({ ...defaultPreferences, ...parsed, bookmarks: validTopicIds(parsed.bookmarks), recent: validTopicIds(parsed.recent) });
    } catch { setPreferences(defaultPreferences); }
    setReady(true);
  }, [storageKey]);

  useEffect(() => {
    setLocationSuffix(`${window.location.search}${window.location.hash}`);
  }, [pathname, children]);

  useEffect(() => {
    if (!ready || restorationAttempted.current) return;
    restorationAttempted.current = true;
    if (pathname !== base || new URLSearchParams(window.location.search).get("topic") === "overview") return;
    const lastTopicId = window.sessionStorage.getItem(`${storageKey}:last:${context.clientId}:${context.year}`);
    const lastTopic = workbenchTopics.find(({ id }) => id === lastTopicId && id !== "overview");
    if (lastTopic) router.replace(topicHref(base, lastTopic));
  }, [base, context.clientId, context.year, pathname, ready, router, storageKey]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  }, [preferences, ready, storageKey]);

  useEffect(() => {
    if (!ready || !activeTopic) return;
    setPreferences((current) => ({ ...current, recent: [activeTopic.id, ...current.recent.filter((id) => id !== activeTopic.id)].slice(0, 6) }));
    if (activeTopic.id !== "overview") window.sessionStorage.setItem(`${storageKey}:last:${context.clientId}:${context.year}`, activeTopic.id);
  }, [activeTopic?.id, context.clientId, context.year, ready, storageKey]);

  useEffect(() => {
    if (previousPath.current !== pathname) { setTreeOpen(false); setContextOpenMobile(false); previousPath.current = pathname; }
  }, [pathname]);

  useEffect(() => {
    const fieldPath = new URLSearchParams(window.location.search).get("focus");
    if (!fieldPath) return;
    const timer = window.setTimeout(() => {
      const entry = entryRef.current; if (!entry) return;
      const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(fieldPath) : fieldPath.replace(/[^a-zA-Z0-9_-]/g, "");
      let control = entry.querySelector<HTMLElement>(`[data-field-path="${escaped}"],[name="${escaped}"],[id="${escaped}"],[aria-label="${escaped}"]`);
      if (!control) {
        const target = human(fieldPath.split(".").at(-1) ?? fieldPath).toLowerCase();
        const label = Array.from(entry.querySelectorAll<HTMLLabelElement>("label")).find((item) => item.textContent?.toLowerCase().includes(target));
        control = label?.querySelector<HTMLElement>("input,select,textarea,button") ?? null;
      }
      if (control) { control.scrollIntoView({ block: "center" }); control.focus(); const container = control.closest("label,.panel"); container?.classList.add("workbench-focus-target"); window.setTimeout(() => container?.classList.remove("workbench-focus-target"), 2500); setAnnouncement(`Focused ${human(fieldPath)}.`); }
      else setAnnouncement(`Opened ${activeTopic?.title ?? "the related topic"}; this diagnostic has no direct editable field.`);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [pathname, activeTopic?.title]);

  const loadReview = useCallback(async () => {
    setLoadingContext(true); setContextError(null);
    try {
      const response = await fetch(`/api/clients/${context.clientId}/years/${context.year}/review`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Diagnostics are unavailable.");
      setReview(body);
    } catch (error) { setContextError(error instanceof Error ? error.message : "Diagnostics are unavailable."); }
    finally { setLoadingContext(false); }
  }, [context.clientId, context.year]);

  useEffect(() => { void loadReview(); }, [loadReview, context.revision]);

  useEffect(() => { setEditState("current"); }, [context.revision, pathname]);
  useEffect(() => {
    if (editState !== "dirty") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editState]);

  const loadTab = useCallback(async (tab: ContextTab) => {
    setContextTab(tab); setContextError(null);
    if (tab === "diagnostics" && !review) { await loadReview(); return; }
    if (tab === "sources" && (!sources || !mapping)) {
      setLoadingContext(true);
      try {
        const [sourceResponse, mappingResponse] = await Promise.all([
          fetch(`/api/clients/${context.clientId}/years/${context.year}/sources`, { cache: "no-store" }),
          fetch(`/api/clients/${context.clientId}/years/${context.year}/mapping`, { cache: "no-store" }),
        ]);
        const [sourceBody, mappingBody] = await Promise.all([sourceResponse.json(), mappingResponse.json()]);
        if (!sourceResponse.ok) throw new Error(sourceBody.message ?? "Source metadata is unavailable.");
        if (!mappingResponse.ok) throw new Error(mappingBody.message ?? "Source mapping context is unavailable.");
        setSources(sourceBody); setMapping(mappingBody);
      } catch (error) { setContextError(error instanceof Error ? error.message : "Source metadata is unavailable."); }
      finally { setLoadingContext(false); }
    }
    if (tab === "trace" && !calculation) {
      setLoadingContext(true);
      try {
        const response = await fetch(`/api/clients/${context.clientId}/years/${context.year}/calculation`, { cache: "no-store" });
        const body = await response.json(); if (!response.ok) throw new Error(body.message ?? "Calculation trace is unavailable."); setCalculation(body);
      } catch (error) { setContextError(error instanceof Error ? error.message : "Calculation trace is unavailable."); }
      finally { setLoadingContext(false); }
    }
  }, [calculation, context.clientId, context.year, loadReview, review, sources]);

  const openPalette = useCallback(() => { setPaletteOpen(true); setPaletteQuery(""); window.setTimeout(() => paletteInput.current?.focus(), 0); }, []);
  const go = useCallback((topic: WorkbenchTopic) => { setPaletteOpen(false); router.push(topicHref(base, topic)); }, [base, router]);
  const navigateIssue = useCallback((direction: 1 | -1) => {
    const issues = review?.issues ?? [];
    if (!issues.length) { setAnnouncement("There are no open machine diagnostics to navigate."); return; }
    issueCursor.current = (issueCursor.current + direction + issues.length) % issues.length;
    const issue = issues[issueCursor.current];
    const topic = workbenchTopicForIssue(issue);
    router.push(issue.fieldPath ? withFocus(topicHref(base, topic), issue.fieldPath) : topicHref(base, topic));
    setAnnouncement(`Diagnostic ${issueCursor.current + 1} of ${issues.length}: ${issue.message}`);
  }, [base, review?.issues, router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "k") { event.preventDefault(); openPalette(); }
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        const save = Array.from(document.querySelectorAll<HTMLButtonElement>("button:not([disabled])")).find((button) => /^save\b/i.test(button.textContent?.trim() ?? ""));
        if (save) { save.click(); setEditState("saving"); setAnnouncement("Save command activated."); window.setTimeout(() => setEditState((current) => current === "saving" ? "dirty" : current), 5000); } else setAnnouncement("This screen has no unsaved editable profile.");
      }
      if (modifier && event.key === "Enter") { event.preventDefault(); router.push(`${base}/calculation/summary`); }
      if (event.altKey && event.key.toLowerCase() === "d") { event.preventDefault(); setPreferences((current) => ({ ...current, contextOpen: true })); setContextOpenMobile(true); void loadTab("diagnostics"); }
      if (event.altKey && event.key.toLowerCase() === "n") { event.preventDefault(); navigateIssue(1); }
      if (event.altKey && event.key.toLowerCase() === "p") { event.preventDefault(); navigateIssue(-1); }
      if (event.altKey && event.key.toLowerCase() === "s") { event.preventDefault(); setPreferences((current) => ({ ...current, contextOpen: true })); setContextOpenMobile(true); void loadTab("sources"); }
      if (event.altKey && event.key.toLowerCase() === "f") { event.preventDefault(); router.push(`${base}/outputs`); }
      if (event.key === "F6") {
        event.preventDefault();
        const panes = [treeRef.current, entryRef.current, contextRef.current].filter(Boolean) as HTMLElement[];
        const index = panes.findIndex((pane) => pane.contains(document.activeElement));
        panes[(index + 1) % panes.length]?.focus();
      }
      if (event.key === "Escape") { setPaletteOpen(false); setShortcutsOpen(false); setContextOpenMobile(false); setTreeOpen(false); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [base, loadTab, navigateIssue, openPalette, router]);

  function updatePreferences(patch: Partial<Preferences>) { setPreferences((current) => ({ ...current, ...patch })); }
  function toggleBookmark(topicId: string) { setPreferences((current) => ({ ...current, bookmarks: current.bookmarks.includes(topicId) ? current.bookmarks.filter((id) => id !== topicId) : [...current.bookmarks, topicId] })); }
  function closeTour() { setTourOpen(false); updatePreferences({ tourSeen: true }); }

  if (ready && preferences.classic) {
    return <div className="workbench-classic-mode"><button className="classic-return-button" onClick={() => updatePreferences({ classic: false })}><LayoutPanelLeft size={15}/> Open Return Workbench</button><AppShell>{children}</AppShell></div>;
  }

  return <div className={`preparer-workbench density-${preferences.density} ${preferences.contextOpen ? "" : "context-collapsed"}`} style={{ "--workbench-tree-width": `${preferences.treeWidth}px`, "--workbench-context-width": `${preferences.contextWidth}px` } as React.CSSProperties}>
    <a className="skip-link" href="#workbench-entry">Skip to return entry</a>
    <header className="workbench-header">
      <div className="workbench-identity">
        <Link href="/clients" className="workbench-back" aria-label="Back to client list"><ArrowLeft size={16}/></Link>
        <div><strong>{context.taxpayer ?? context.displayName}{context.spouse ? ` & ${context.spouse}` : ""}</strong><small>Client {context.code} · Form 1040</small></div>
        <span className="workbench-year">{context.year}</span>
      </div>
      <div className="workbench-state" aria-label="Return status">
        <span><small>Preparation</small><b>{context.status}</b></span>
        <span><small>Calculation</small><b className={context.calculationStatus === "complete" ? "state-good" : "state-warning"}>{human(context.calculationStatus)}</b></span>
        <span><small>Revision</small><b>{context.revision}</b></span>
        <span><small>Reviewer</small><b>{context.reviewer ?? "Unassigned"}</b></span>
      </div>
    </header>
    <nav className="workbench-commandbar" aria-label="Return commands">
      <button className="mobile-pane-button" onClick={() => setTreeOpen(true)} aria-label="Open return tree"><Menu size={16}/></button>
      <button className="workbench-search-button" onClick={openPalette}><Search size={15}/><span>Open form or topic</span><kbd>Ctrl K</kbd></button>
      <Link className="command-action primary" href={`${base}/calculation/summary`}><Calculator size={15}/> Calculate <kbd>Ctrl ↵</kbd></Link>
      <Link className="command-action" href={`${base}/review`}><ShieldAlert size={15}/> Diagnostics <span className="command-count">{blockerCount}</span></Link>
      <Link className="command-action" href={`${base}/outputs`}><FileText size={15}/> Forms &amp; outputs</Link>
      <button className="command-action" onClick={() => setShortcutsOpen(true)}><Keyboard size={15}/> Shortcuts</button>
      <button className="command-action" onClick={() => setTourOpen(true)}><CircleHelp size={15}/> Help{!preferences.tourSeen ? <span className="new-help-dot">New</span> : null}</button>
      <button className="command-icon" onClick={() => updatePreferences({ contextOpen: !preferences.contextOpen })} aria-label={preferences.contextOpen ? "Collapse context panel" : "Open context panel"}>{preferences.contextOpen ? <PanelRightClose size={17}/> : <PanelRightOpen size={17}/>}</button>
      <button className="mobile-pane-button context-button" onClick={() => setContextOpenMobile(true)} aria-label="Open return context"><FileSearch size={16}/><span>{blockerCount}</span></button>
    </nav>
    <div className="workbench-body">
      <aside ref={treeRef} tabIndex={-1} className={`workbench-tree ${treeOpen ? "mobile-open" : ""}`} aria-label="Return topics">
        <div className="pane-mobile-heading"><strong>Return topics</strong><button onClick={() => setTreeOpen(false)} aria-label="Close return topics"><X size={16}/></button></div>
        <div className="workbench-tree-scroll">
          {preferences.bookmarks.length ? <TreeSection label="Bookmarked" topics={topicsFor(preferences.bookmarks)} base={base} activeId={activeTopic?.id} stateFor={(topicValue) => topicState(topicValue, context, blockerCount)} bookmarked={preferences.bookmarks} onBookmark={toggleBookmark}/> : null}
          {preferences.recent.length ? <TreeSection label="Recent" topics={topicsFor(preferences.recent).slice(0, 4)} base={base} activeId={activeTopic?.id} stateFor={(topicValue) => topicState(topicValue, context, blockerCount)} bookmarked={preferences.bookmarks} onBookmark={toggleBookmark}/> : null}
          {workbenchGroups.map((group) => <TreeSection key={group} label={group} topics={workbenchTopics.filter((topicValue) => topicValue.group === group)} base={base} activeId={activeTopic?.id} stateFor={(topicValue) => topicState(topicValue, context, blockerCount)} bookmarked={preferences.bookmarks} onBookmark={toggleBookmark}/>)}
        </div>
        <div className="workbench-tree-settings">
          <button onClick={() => updatePreferences({ density: preferences.density === "compact" ? "comfortable" : "compact" })}><Settings2 size={14}/>{preferences.density === "compact" ? "Comfortable density" : "Compact density"}</button>
          <button onClick={() => updatePreferences({ classic: true })}>Classic page view</button>
        </div>
      </aside>
      <PaneResizer label="Resize return tree" value={preferences.treeWidth} min={190} max={340} direction={1} onChange={(treeWidth) => updatePreferences({ treeWidth })}/>
      <main ref={entryRef} tabIndex={-1} className="workbench-entry" id="workbench-entry">
        <div className="workbench-topic-strip"><span><small>{activeTopic?.group ?? "Return"}</small><strong>{activeTopic?.title ?? "Return overview"}</strong></span>{activeTopic ? <button className="topic-bookmark" onClick={() => toggleBookmark(activeTopic.id)} aria-label={preferences.bookmarks.includes(activeTopic.id) ? `Remove ${activeTopic.title} bookmark` : `Bookmark ${activeTopic.title}`}>{preferences.bookmarks.includes(activeTopic.id) ? <BookmarkCheck size={16}/> : <Bookmark size={16}/>}</button> : null}</div>
        <div className="workbench-entry-scroll" onInputCapture={(event) => { const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; const readOnly = "readOnly" in target && target.readOnly; if (target.matches("input,select,textarea") && target.type !== "file" && !readOnly && !target.disabled) setEditState("dirty"); }} onClickCapture={(event) => { const button = (event.target as HTMLElement).closest("button"); if (button && /^save\b/i.test(button.textContent?.trim() ?? "") && !button.disabled) { setEditState("saving"); window.setTimeout(() => setEditState((current) => current === "saving" ? "dirty" : current), 5000); } }}>{children}</div>
      </main>
      {preferences.contextOpen ? <PaneResizer label="Resize context panel" value={preferences.contextWidth} min={260} max={440} direction={-1} onChange={(contextWidth) => updatePreferences({ contextWidth })}/> : null}
      <aside ref={contextRef} tabIndex={-1} className={`workbench-context ${contextOpenMobile ? "mobile-open" : ""}`} aria-label="Return context">
        <div className="pane-mobile-heading"><strong>Return context</strong><button onClick={() => setContextOpenMobile(false)} aria-label="Close return context"><X size={16}/></button></div>
        <div className="workbench-context-tabs" role="tablist" aria-label="Context views">
          <ContextTabButton value="diagnostics" current={contextTab} onSelect={loadTab}>Issues <span>{blockerCount + warningCount}</span></ContextTabButton>
          <ContextTabButton value="sources" current={contextTab} onSelect={loadTab}>Sources</ContextTabButton>
          <ContextTabButton value="trace" current={contextTab} onSelect={loadTab}>Trace</ContextTabButton>
          <ContextTabButton value="provenance" current={contextTab} onSelect={loadTab}>History</ContextTabButton>
        </div>
        <div className="workbench-context-content">
          {loadingContext ? <p className="context-loading" role="status">Loading current return context…</p> : null}
          {contextError ? <p className="context-error" role="alert">{contextError}</p> : null}
          {contextTab === "diagnostics" ? <DiagnosticsContext issues={review?.issues ?? []} points={review?.points ?? []} base={base}/> : null}
          {contextTab === "sources" ? <SourcesContext sources={sources} mapping={mapping} base={base} clientId={context.clientId} year={context.year}/> : null}
          {contextTab === "trace" ? <TraceContext calculation={calculation} base={base}/> : null}
          {contextTab === "provenance" ? <ProvenanceContext review={review} context={context}/> : null}
        </div>
      </aside>
      {(treeOpen || contextOpenMobile) ? <button className="workbench-mobile-backdrop" aria-label="Close open panel" onClick={() => { setTreeOpen(false); setContextOpenMobile(false); }}/> : null}
    </div>
    <footer className="workbench-footer">
      <span className={`edit-state-${editState}`}>{editState === "current" ? <CheckCircle2 size={13}/> : editState === "saving" ? <Circle size={12}/> : <AlertCircle size={13}/>} {editState === "current" ? `Current revision ${context.revision}` : editState === "saving" ? "Save requested…" : "Unsaved changes"}</span>
      <span>Blockers <b className={blockerCount ? "footer-blocking" : ""}>{blockerCount}</b></span>
      <span>Warnings <b>{warningCount}</b></span>
      <span>Review points <b>{openPointCount}</b></span>
      <span>Calculation <b>{human(context.calculationStatus)}</b></span>
      <span className="footer-draft">DRAFT — NOT FOR FILING</span>
    </footer>
    <span className="sr-only" aria-live="polite">{announcement}</span>
    {paletteOpen ? <CommandPalette query={paletteQuery} setQuery={setPaletteQuery} results={paletteResults} inputRef={paletteInput} close={() => setPaletteOpen(false)} go={go}/> : null}
    {shortcutsOpen ? <ShortcutDialog close={() => setShortcutsOpen(false)}/> : null}
    {tourOpen ? <TourDialog close={closeTour}/> : null}
  </div>;
}

function TreeSection({ label, topics, base, activeId, stateFor, bookmarked, onBookmark }: { label: string; topics: WorkbenchTopic[]; base: string; activeId?: string; stateFor: (topic: WorkbenchTopic) => WorkbenchTopicState; bookmarked: string[]; onBookmark: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  if (!topics.length) return null;
  return <section className="workbench-tree-section"><button className="workbench-tree-heading" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span>{label}</span>{open ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}</button>{open ? <div>{topics.map((topicValue) => { const state = stateFor(topicValue); return <div className={`workbench-topic-row ${topicValue.id === activeId ? "active" : ""}`} key={topicValue.id}><Link href={topicHref(base, topicValue)} aria-current={topicValue.id === activeId ? "page" : undefined}><TopicStateIcon state={state}/><span><b>{topicValue.title}</b>{topicValue.formRefs.length ? <small>{topicValue.formRefs.join(" · ")}</small> : null}</span><em className={`topic-state ${state}`}>{human(state)}</em></Link><button className="row-bookmark" onClick={() => onBookmark(topicValue.id)} aria-label={bookmarked.includes(topicValue.id) ? `Remove ${topicValue.title} bookmark` : `Bookmark ${topicValue.title}`}>{bookmarked.includes(topicValue.id) ? <BookmarkCheck size={12}/> : <Bookmark size={12}/>}</button></div>; })}</div> : null}</section>;
}

function TopicStateIcon({ state }: { state: WorkbenchTopicState }) {
  if (state === "blocking") return <AlertCircle className="topic-icon blocking" size={13}/>;
  if (state === "warning" || state === "stale") return <AlertCircle className="topic-icon warning" size={13}/>;
  if (state === "complete") return <CheckCircle2 className="topic-icon complete" size={13}/>;
  return <Circle className="topic-icon neutral" size={11}/>;
}

function ContextTabButton({ value, current, onSelect, children }: { value: ContextTab; current: ContextTab; onSelect: (value: ContextTab) => void; children: ReactNode }) { return <button role="tab" aria-selected={current === value} className={current === value ? "active" : ""} onClick={() => void onSelect(value)}>{children}</button>; }

function DiagnosticsContext({ issues, points, base }: { issues: ReviewIssue[]; points: ReviewPoint[]; base: string }) {
  const [severity,setSeverity]=useState("all");
  const [query,setQuery]=useState("");
  const visible=issues.filter((issue)=>(severity==="all"||issue.severity===severity)&&(!query||`${issue.code} ${issue.message} ${issue.fieldPath??""}`.toLowerCase().includes(query.toLowerCase())));
  return <><section className="context-summary"><h2>Current diagnostics</h2><p>Blocking items must be resolved by correcting the underlying facts. They cannot be dismissed here.</p><div className="context-diagnostic-filters"><input aria-label="Search diagnostics" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search code or message"/><select aria-label="Filter diagnostic severity" value={severity} onChange={(event)=>setSeverity(event.target.value)}><option value="all">All severities</option><option value="blocking">Blocking</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Information</option></select></div></section><div className="context-card-list">{visible.slice(0, 30).map((issue) => { const topicValue = workbenchTopicForIssue(issue); return <article className={`context-issue ${issue.severity}`} key={issue.id}><AlertCircle size={14}/><div><strong>{issue.message}</strong><small>{issue.code} · {human(issue.severity)}{issue.fieldPath ? ` · ${issue.fieldPath}` : ""}</small><p>{issue.resolutionAction}</p><Link href={issue.fieldPath ? withFocus(topicHref(base, topicValue), issue.fieldPath) : topicHref(base, topicValue)}>Open {topicValue.title}{issue.fieldPath ? " field" : " details"}<ChevronRight size={12}/></Link>{issue.definitionVersion ? <details className="diagnostic-technical"><summary>Authority and technical details</summary><small>Tax year {issue.taxYear} · definition v{issue.definitionVersion} · {human(issue.evaluationStage??"unknown stage")} · authority {human(issue.authorityStatus??"pending")}</small><code>{issue.fingerprint?.slice(0,16)}</code></details> : null}</div></article>; })}{!visible.length ? <p className="context-empty"><CheckCircle2 size={16}/> {issues.length?"No diagnostics match these filters.":"No open machine diagnostics."}</p> : null}</div>{points.length ? <section className="context-review-points"><h2>Assigned review points</h2>{points.filter(({ status }) => status === "open" || status === "waiting").slice(0, 10).map((point) => <Link href={`${base}/review`} key={point.id}><span><strong>{point.subject}</strong><small>{point.assignedName ?? "Unassigned"} · {human(point.status)}</small></span><ChevronRight size={13}/></Link>)}</section> : null}</>;
}

function SourcesContext({ sources, mapping, base, clientId, year }: { sources: SourcePayload | null; mapping: MappingPayload | null; base: string; clientId: string; year: number }) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = sources?.documents.find(({ id }) => id === previewId);
  const activityNames = new Map(mapping?.activities.map((activity) => [activity.id, activity.name]));
  return <><section className="context-summary"><h2>Source evidence</h2><p>Only metadata loads here. Source bytes are requested solely when you select Preview or View.</p></section>{preview ? <section className="context-source-preview"><header><span><FileText size={13}/><strong>{preview.fileName}</strong></span><button onClick={() => setPreviewId(null)} aria-label="Close source preview"><X size={14}/></button></header><iframe title={`Preview ${preview.fileName}`} sandbox="" src={`/api/clients/${clientId}/years/${year}/sources/${preview.id}/download`}/></section> : null}<div className="context-card-list">{sources?.documents.slice(0, 25).map((document) => <article className="context-source" key={document.id}><FileText size={14}/><div><strong>{document.fileName}</strong><small>{document.documentType} · {human(document.scanState)}</small><span><span className="context-source-actions"><button onClick={() => setPreviewId(document.id)}>Preview</button><a href={`/api/clients/${clientId}/years/${year}/sources/${document.id}/download`} target="_blank" rel="noreferrer">View</a></span><code>{document.checksum?.slice(0, 10) ?? "no hash"}</code></span></div></article>)}{sources && !sources.documents.length ? <p className="context-empty">No source documents are attached.</p> : null}</div>{mapping?.sources.length ? <section className="context-mappings"><h2>Mapped destinations</h2>{mapping.sources.slice(0, 15).map((source) => <article key={`${source.id}:${source.label}`}><div><strong>{source.formType} · {source.label}</strong><small>{formatAmount(source.amount)} · {human(source.reconciliation.status)}</small></div>{source.mappings.length ? source.mappings.map((allocation) => <p key={allocation.id}><span>{allocation.targetType === "excluded" ? "Excluded" : activityNames.get(allocation.targetActivityId ?? "") ?? human(allocation.targetType)}</span><b>{formatAmount(allocation.allocatedAmount)}</b>{allocation.note ? <small>{allocation.note}</small> : null}</p>) : <p><span>No destination selected</span><b>{formatAmount(source.reconciliation.unresolvedAmount)}</b></p>}</article>)}</section> : null}<Link className="context-full-link" href={`${base}/sources`}>Open source workspace <ChevronRight size={13}/></Link></>;
}

function TraceContext({ calculation, base }: { calculation: CalculationPayload | null; base: string }) {
  const trace = calculation?.latestRun?.result.trace ?? [];
  return <><section className="context-summary"><h2>Calculation trace</h2><p>{calculation?.latestRun ? `${calculation.latestRun.current ? "Current" : "Stale"} run from revision ${calculation.latestRun.inputRevision}.` : "No immutable calculation has been created."}</p></section><div className="context-card-list">{trace.slice(0, 30).map((step) => <article className="context-trace" key={step.nodeId}><span><strong>{step.formLine}</strong><small>{step.ruleId}</small></span><b>{formatAmount(step.result)}</b></article>)}</div><Link className="context-full-link" href={`${base}/calculation/summary`}>{calculation?.latestRun ? "Open full calculation and trace" : "Calculate current revision"}<ChevronRight size={13}/></Link></>;
}

function ProvenanceContext({ review, context }: { review: ReviewPayload | null; context: TaxYearWorkspaceRecord }) {
  return <><section className="context-summary"><h2>Revision and provenance</h2><dl><div><dt>Current revision</dt><dd>{context.revision}</dd></div><div><dt>Calculation</dt><dd>{human(context.calculationStatus)}</dd></div><div><dt>Preparation</dt><dd>{context.status}</dd></div><div><dt>Release mode</dt><dd>Draft only</dd></div></dl></section><div className="context-card-list">{review?.auditEvents.slice(0, 20).map((event) => <article className="context-audit" key={event.id}><strong>{human(event.eventType)}</strong><small>{event.actorName} · {new Date(event.createdAt).toLocaleString()}</small></article>)}</div></>;
}

function CommandPalette({ query, setQuery, results, inputRef, close, go }: { query: string; setQuery: (value: string) => void; results: WorkbenchTopic[]; inputRef: React.RefObject<HTMLInputElement | null>; close: () => void; go: (topic: WorkbenchTopic) => void }) {
  const [selected, setSelected] = useState(0);
  useEffect(() => { setSelected(0); }, [query]);
  return <div className="workbench-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="workbench-palette" role="dialog" aria-modal="true" aria-label="Open form or topic"><div className="palette-search"><Search size={17}/><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setSelected((value) => Math.min(results.length - 1, value + 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setSelected((value) => Math.max(0, value - 1)); } if (event.key === "Enter" && results[selected]) { event.preventDefault(); go(results[selected]); } }} placeholder="Search forms, lines, topics, or common terms" aria-label="Search forms and topics" role="combobox" aria-expanded="true" aria-controls="workbench-topic-results"/><kbd>Esc</kbd></div><div className="palette-results" id="workbench-topic-results" role="listbox">{results.map((topicValue, index) => <button key={topicValue.id} role="option" aria-selected={selected === index} className={selected === index ? "selected" : ""} onMouseEnter={() => setSelected(index)} onClick={() => go(topicValue)}><span><strong>{topicValue.title}</strong><small>{topicValue.group} · {topicValue.detail}</small></span><em>{topicValue.formRefs.join(" · ")}</em></button>)}{!results.length ? <p>No supported form or topic matches that search.</p> : null}</div><footer><span><kbd>↑</kbd><kbd>↓</kbd> Move</span><span><kbd>Enter</kbd> Open</span><span>Search covers common names and official form numbers.</span></footer></div></div>;
}

function ShortcutDialog({ close }: { close: () => void }) { return <div className="workbench-dialog-backdrop"><div className="workbench-help-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-title"><header><div><Keyboard size={18}/><h2 id="shortcut-title">Keyboard shortcuts</h2></div><button onClick={close} aria-label="Close keyboard shortcuts"><X size={17}/></button></header><dl><div><dt><kbd>Ctrl/⌘ K</kbd></dt><dd>Open form or topic</dd></div><div><dt><kbd>Ctrl/⌘ S</kbd></dt><dd>Activate the current screen's Save command</dd></div><div><dt><kbd>Ctrl/⌘ Enter</kbd></dt><dd>Open calculation</dd></div><div><dt><kbd>Alt D</kbd></dt><dd>Open diagnostics</dd></div><div><dt><kbd>Alt N / Alt P</kbd></dt><dd>Open next / previous diagnostic</dd></div><div><dt><kbd>Alt S</kbd></dt><dd>Open source context</dd></div><div><dt><kbd>Alt F</kbd></dt><dd>Open forms and outputs</dd></div><div><dt><kbd>F6</kbd></dt><dd>Move between tree, entry and context panes</dd></div><div><dt><kbd>Esc</kbd></dt><dd>Close a dialog or mobile pane</dd></div></dl><button className="button primary" onClick={close}>Done</button></div></div>; }

function TourDialog({ close }: { close: () => void }) { return <div className="workbench-dialog-backdrop"><div className="workbench-tour" role="dialog" aria-modal="true" aria-labelledby="tour-title"><CircleHelp size={24}/><div><p className="eyebrow">Welcome to the Return Workbench</p><h2 id="tour-title">Everything for this return stays in one place.</h2><ol><li><strong>Choose a topic</strong><span>Use the return tree or press Ctrl/⌘ K to open any supported form.</span></li><li><strong>Enter and review</strong><span>The center keeps the existing guarded editor, including imported data.</span></li><li><strong>Resolve context</strong><span>Issues, sources, calculation trace and provenance stay available on the right.</span></li><li><strong>Calculate and output</strong><span>Use the top commands from any topic; filing controls remain safely disabled.</span></li></ol><button className="button primary" onClick={close}>Start preparing</button></div></div></div>; }

function PaneResizer({ label, value, min, max, direction, onChange }: { label: string; value: number; min: number; max: number; direction: 1 | -1; onChange: (value: number) => void }) {
  function start(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault(); const startX = event.clientX; const startValue = value;
    const move = (moveEvent: PointerEvent) => onChange(clamp(startValue + (moveEvent.clientX - startX) * direction, min, max));
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  }
  return <button className="pane-resizer" role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} onPointerDown={start} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const delta = event.key === "ArrowRight" ? 10 : -10; onChange(clamp(value + delta * direction, min, max)); } }}><GripVertical size={12}/></button>;
}

function currentTopic(pathname: string, base: string, suffix: string) {
  const relative = pathname === base ? "" : pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : "";
  const current = new URL(suffix || "?", "https://workbench.invalid");
  return workbenchTopics
    .filter((topicValue) => stripQuery(topicValue.path) === relative)
    .map((topicValue) => ({ topicValue, score: topicMatchScore(topicValue, current) }))
    .sort((left, right) => right.score - left.score)[0]?.topicValue ?? workbenchTopics[0];
}
function topicMatchScore(topicValue: WorkbenchTopic, current: URL) {
  const topicUrl = new URL(topicValue.path || "?topic=overview", "https://workbench.invalid/");
  let score = 0;
  for (const [key, value] of topicUrl.searchParams) score += current.searchParams.get(key) === value ? 10 : -10;
  if (topicUrl.hash) score += current.hash === topicUrl.hash ? 5 : -5;
  return score;
}
function stripQuery(value: string) { return value.split(/[?#]/)[0]; }
function topicsFor(ids: string[]) { return ids.flatMap((id) => { const match = workbenchTopics.find((topicValue) => topicValue.id === id); return match ? [match] : []; }); }
function validTopicIds(value: unknown) { return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && workbenchTopics.some((topicValue) => topicValue.id === id)) : []; }
function topicState(topicValue: WorkbenchTopic, context: TaxYearWorkspaceRecord, blockers: number): WorkbenchTopicState { if (topicValue.id === "diagnostics" && blockers) return "blocking"; if (["calculation", "outputs"].includes(topicValue.id) && context.calculationStatus !== "complete") return "stale"; if (topicValue.id === "overview") return "complete"; return "in_progress"; }
function human(value: string) { return value.replaceAll("_", " ").replaceAll(".", " · ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, Math.round(value))); }
function formatAmount(value: string) { const number = Number(value); return Number.isFinite(number) ? number.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : value; }
function withFocus(href: string, fieldPath: string) { const [withoutHash, hash] = href.split("#", 2); return `${withoutHash}${withoutHash.includes("?") ? "&" : "?"}focus=${encodeURIComponent(fieldPath)}${hash ? `#${hash}` : ""}`; }
