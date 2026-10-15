export type WorkbenchTopicState = "not_started" | "in_progress" | "complete" | "warning" | "blocking" | "stale";

export interface WorkbenchTopic {
  id: string;
  group: string;
  title: string;
  detail: string;
  path: string;
  keywords: string[];
  formRefs: string[];
}

export const workbenchTopics: WorkbenchTopic[] = [
  topic("overview", "Return", "Return overview", "Status, scope and workflow access", "", ["home", "workspace", "summary"], ["1040"]),
  topic("people", "Client and return setup", "Taxpayer and spouse", "Identity, address, occupation and protected identifiers", "taxpayer-profile", ["identity", "people", "address", "ssn"], ["1040"]),
  topic("filing-status", "Client and return setup", "Filing status and dependents", "Five filing statuses, dependents and standard-deduction facts", "return-profile", ["single", "joint", "mfs", "hoh", "qss", "child", "dependent"], ["1040", "8812"]),
  topic("intake", "Client and return setup", "Intake and completeness", "Eligibility questions and expected-document evidence", "intake", ["organizer", "questions", "completeness", "documents"], []),

  topic("w2", "Income", "W-2 wages", "Wages, withholding and employer records", "source-entry?form=W2", ["wages", "employer", "withholding"], ["W-2", "1040 line 1"]),
  topic("interest-dividends", "Income", "Interest and dividends", "Interest, dividends and foreign-account facts", "source-entry?form=1099-INT", ["interest", "dividend", "bank", "broker"], ["1099-INT", "1099-DIV", "Schedule B"]),
  topic("capital", "Income", "Capital transactions", "Broker transactions, adjustments and carryovers", "source-entry?form=1099-B", ["stock", "sale", "basis", "capital gain", "carryover"], ["1099-B", "8949", "Schedule D"]),
  topic("retirement", "Income", "Retirement distributions", "Pensions, IRAs, rollovers, QCDs and distribution codes", "source-entry?form=1099-R", ["pension", "ira", "rollover", "qcd"], ["1099-R", "8606", "5329"]),
  topic("social-security", "Income", "Social Security benefits", "SSA and railroad retirement benefit statements", "source-entry?form=SSA-1099", ["ssa", "rrb", "social security"], ["SSA-1099", "RRB-1099", "1040 line 6"]),
  topic("other-income", "Income", "Other source income", "Unemployment, payment-network and miscellaneous source records", "source-entry?form=1099-G", ["unemployment", "1099-k", "miscellaneous"], ["1099-G", "1099-K", "1099-MISC"]),
  topic("schedule-c", "Income", "Schedule C businesses", "Business income, expenses, vehicle, home office and assets", "activities?type=schedule_c", ["business", "sole proprietor", "vehicle", "home office"], ["Schedule C", "4562", "8829"]),
  topic("schedule-e", "Income", "Schedule E rentals and K-1s", "Rental, royalty, pass-through and limitation ledgers", "activities?type=schedule_e", ["rental", "royalty", "k-1", "passive", "basis", "at risk"], ["Schedule E", "6198", "8582"]),
  topic("schedule-f", "Income", "Schedule F farms", "Farm income, inventory, expenses, assets and losses", "activities?type=schedule_f", ["farm", "agriculture", "inventory"], ["Schedule F", "4562"]),

  topic("adjustments", "Adjustments", "Income adjustments", "Educator, IRA, student-loan, HSA and self-employed deductions", "advanced?section=adjustments", ["educator", "student loan", "health insurance", "retirement plan"], ["Schedule 1", "8889"]),
  topic("ira-hsa", "Adjustments", "IRA and HSA", "Nondeductible IRA basis and health savings accounts", "advanced?section=adjustments&focus=ira-hsa", ["8606", "8889", "ira basis", "hsa"], ["8606", "8889"]),

  topic("standard-deduction", "Deductions", "Standard deduction", "Claimable taxpayer and age/blindness facts", "return-profile#standard-deduction", ["65", "blind", "claimable"], ["1040 line 12"]),
  topic("schedule-a", "Deductions", "Itemized deductions", "Medical, taxes, interest, charity and casualty items", "return-profile#schedule-a", ["medical", "salt", "mortgage", "charity", "itemized"], ["Schedule A"]),

  topic("ctc", "Credits", "Child and dependent credits", "CTC, ACTC and other-dependent credit facts", "return-profile#dependents", ["child tax credit", "odc", "actc"], ["8812"]),
  topic("eitc", "Credits", "Earned Income Tax Credit", "Eligibility and qualifying-child interview", "credits#eitc", ["earned income", "qualifying child"], ["Schedule EIC", "8867"]),
  topic("dependent-care", "Credits", "Child and dependent care", "Care providers, qualifying people and expenses", "credits#dependent-care", ["daycare", "care provider"], ["2441", "Schedule 3"]),
  topic("education", "Credits", "Education credits", "1098-T, AOTC and Lifetime Learning Credit", "credits#education", ["college", "tuition", "aotc", "llc"], ["1098-T", "8863", "Schedule 3"]),
  topic("ptc", "Credits", "Premium Tax Credit", "Marketplace coverage and monthly reconciliation", "advanced?section=premiumTaxCredit", ["marketplace", "health insurance", "aptc"], ["1095-A", "8962"]),

  topic("amt", "Other taxes", "Alternative Minimum Tax", "AMT preferences, exemption and tax computation", "advanced?section=adjustments&focus=amt", ["alternative minimum tax"], ["6251", "Schedule 2"]),
  topic("medicare", "Other taxes", "Additional Medicare Tax", "Medicare wages, tips and withholding", "advanced?section=adjustments&focus=medicare", ["medicare wages", "unreported tips"], ["8959", "Schedule 2"]),
  topic("niit", "Other taxes", "Net Investment Income Tax", "Investment income, deductions and MAGI threshold", "advanced?section=adjustments&focus=niit", ["investment tax", "magi"], ["8960", "Schedule 2"]),
  topic("qbi", "Other taxes", "Qualified business income", "Trades, SSTB, wage/UBIA limits and carryovers", "advanced?section=adjustments&focus=qbi", ["199a", "sstb", "ubia"], ["8995", "8995-A"]),

  topic("payments", "Payments", "Payments and refundable items", "Estimated, extension, withholding and prior-year payments", "advanced?section=payments", ["estimated tax", "extension", "overpayment", "withholding"], ["1040 payments"]),

  topic("sources", "Sources and reconciliation", "Source documents", "Secure upload, scan and source preview", "sources", ["upload", "pdf", "image", "evidence"], []),
  topic("source-entry", "Sources and reconciliation", "Typed source entry", "Every registered box and repeatable source-form field", "source-entry", ["manual entry", "boxes", "1099", "w2"], []),
  topic("lineage", "Sources and reconciliation", "Corrections and lineage", "Corrected, void and duplicate source records", "source-records", ["correct", "void", "duplicate", "history"], []),
  topic("imports", "Sources and reconciliation", "JSON import", "Preview, decide, commit and roll back canonical JSON", "imports", ["canonical", "upload json", "rollback"], ["JSON"]),
  topic("mapping", "Sources and reconciliation", "Mapping center", "Allocate source amounts to return activities", "mapping", ["allocation", "reconcile", "destination"], []),

  topic("diagnostics", "Review", "Diagnostics and review points", "Blocking findings, warnings and assigned questions", "review", ["error", "warning", "open point", "audit"], []),
  topic("due-diligence", "Review", "Form 8867 due diligence", "Required knowledge, documents, evidence and certification", "advanced?section=dueDiligence", ["preparer", "evidence", "signature"], ["8867"]),
  topic("overrides", "Review", "Governed overrides", "Independently approved calculation adjustments", "overrides", ["manual override", "approval"], []),
  topic("calculation", "Review", "Calculation and line trace", "Immutable tax result, diagnostics and dependency trace", "calculation/summary", ["tax summary", "refund", "amount owed", "trace"], ["1040"]),

  topic("outputs", "Forms and outputs", "Forms and output center", "Draft PDF, Excel workpaper and JSON export", "outputs", ["download", "export", "workpaper", "forms", "print"], ["PDF", "XLSX", "JSON"]),
  topic("print-package", "Forms and outputs", "Print-package controls", "Client/internal package preferences and ordering", "advanced?section=formPackage", ["client copy", "internal draft", "filing copy"], ["PDF"]),
];

export const workbenchGroups = Array.from(new Set(workbenchTopics.map(({ group }) => group)));

export function topicHref(base: string, topic: WorkbenchTopic) {
  return topic.path ? `${base}/${topic.path}` : `${base}?topic=overview`;
}

export function findWorkbenchTopics(query: string) {
  const terms = normalize(query).split(" ").filter(Boolean);
  if (!terms.length) return workbenchTopics;
  return workbenchTopics
    .map((topicValue) => ({ topic: topicValue, score: searchScore(topicValue, terms) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.topic.title.localeCompare(right.topic.title))
    .map(({ topic: topicValue }) => topicValue);
}

export function workbenchTopicForIssue(issue: { code?: string; category?: string; fieldPath?: string | null; message?: string }) {
  const value = normalize([issue.code, issue.category, issue.fieldPath, issue.message].filter(Boolean).join(" "));
  const rules: Array<[RegExp, string]> = [
    [/(taxpayer|spouse|identity|person\.)/, "people"],
    [/(filing status|dependent|schedule a|standard deduction|8812)/, "filing-status"],
    [/(eitc|earned income|schedule eic)/, "eitc"],
    [/(2441|dependent care)/, "dependent-care"],
    [/(8863|education|1098 t|aotc)/, "education"],
    [/(8962|1095 a|premium tax)/, "ptc"],
    [/(8867|due diligence)/, "due-diligence"],
    [/(6251|alternative minimum|\bamt\b)/, "amt"],
    [/(8959|additional medicare)/, "medicare"],
    [/(8960|net investment)/, "niit"],
    [/(8995|qualified business|\bqbi\b)/, "qbi"],
    [/(schedule c|business activity|vehicle|home office)/, "schedule-c"],
    [/(schedule e|rental|passive|k 1)/, "schedule-e"],
    [/(schedule f|farm)/, "schedule-f"],
    [/(w 2|wage)/, "w2"],
    [/(1099 int|1099 div|interest|dividend)/, "interest-dividends"],
    [/(1099 b|8949|schedule d|capital)/, "capital"],
    [/(1099 r|8606|retirement|ira distribution)/, "retirement"],
    [/(ssa|rrb|social security)/, "social-security"],
    [/(payment|withholding|estimated tax|extension)/, "payments"],
    [/(mapping|allocation|reconcil)/, "mapping"],
    [/(source|document|unsupported form)/, "source-entry"],
    [/(import|canonical json)/, "imports"],
    [/(calculation|engine|rule package)/, "calculation"],
    [/(artifact|output|pdf|workpaper|xlsx)/, "outputs"],
  ];
  const id = rules.find(([pattern]) => pattern.test(value))?.[1] ?? "diagnostics";
  return workbenchTopics.find((topicValue) => topicValue.id === id) ?? workbenchTopics[0];
}

function topic(id: string, group: string, title: string, detail: string, path: string, keywords: string[], formRefs: string[]): WorkbenchTopic {
  return { id, group, title, detail, path, keywords, formRefs };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function searchScore(topicValue: WorkbenchTopic, terms: string[]) {
  const title = normalize(topicValue.title);
  const formRefs = normalize(topicValue.formRefs.join(" "));
  const haystack = normalize([topicValue.group, topicValue.title, topicValue.detail, ...topicValue.keywords, ...topicValue.formRefs].join(" "));
  if (!terms.every((term) => haystack.includes(term))) return 0;
  return terms.reduce((score, term) => score + (title === term ? 12 : title.startsWith(term) ? 8 : title.includes(term) ? 5 : formRefs.includes(term) ? 4 : 1), 0);
}
