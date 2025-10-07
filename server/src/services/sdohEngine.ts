type ConversationMessage = {
  speaker: string;
  text: string;
  language?: string;
  timestamp?: string;
};

type DetectionRequest = {
  memberId?: string;
  transcript: ConversationMessage[];
  context?: {
    encounterId?: string;
    careTeam?: string[];
    requiredScreenings?: number;
    completedScreenings?: number;
    monthlyGoal?: number;
  };
};

type IssueStatus = 'current' | 'resolved' | 'historical';

type IssueMatch = {
  code: string;
  label: string;
  domain: string;
  severity: 'low' | 'moderate' | 'high';
  urgency: 'low' | 'medium' | 'high';
  status: IssueStatus;
  confidence: number;
  evidence: {
    quote: string;
    speaker: string;
    timestamp?: string;
    language?: string;
  }[];
  rationale: string;
  estimatedRevenue: number;
};

type Documentation = {
  structured: {
    memberId?: string;
    encounterId?: string;
    detectedAt: string;
    languages: string[];
    issues: {
      code: string;
      label: string;
      severity: IssueMatch['severity'];
      urgency: IssueMatch['urgency'];
      status: IssueStatus;
      confidence: number;
      evidenceCount: number;
    }[];
  };
  narrative: string;
  recommendedCodes: {
    code: string;
    label: string;
    confidence: number;
    severity: IssueMatch['severity'];
    urgency: IssueMatch['urgency'];
  }[];
  evidence: IssueMatch['evidence'];
};

type RevenueMetrics = {
  potentialRevenue: number;
  zCodesGenerated: number;
  patientsScreened: number;
  patientsRequired: number;
  riskAdjustmentImpact: number;
  prevalenceTrends: {
    code: string;
    label: string;
    percent: number;
    delta: number;
  }[];
  accuracyEstimate: number;
  latencyEstimateMs: number;
};

type ComplianceSummary = {
  needsScreening: boolean;
  nextDueDate: string;
  completionRate: number;
  cmsReport: {
    month: string;
    completed: number;
    pending: number;
    overdue: number;
  }[];
  alerts: {
    memberId?: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
  }[];
};

type DetectionResponse = {
  engine: 'gpt-orchestrator' | 'rule-based';
  issues: IssueMatch[];
  documentation: Documentation;
  revenue: RevenueMetrics;
  compliance: ComplianceSummary;
  debug?: {
    promptTokens?: number;
    model?: string;
    fallbackUsed: boolean;
  };
};

type Pattern = {
  code: string;
  label: string;
  domain: string;
  keywords: (RegExp | string)[];
  translations?: Record<string, (RegExp | string)[]>;
  severity: IssueMatch['severity'];
  urgency: IssueMatch['urgency'];
  defaultConfidence: number;
  estimatedRevenue: number;
};

const BASE_PATTERNS: Pattern[] = [
  {
    code: 'Z59.82',
    label: 'Transportation insecurity',
    domain: 'transportation',
    keywords: [
      /no (ride|car)/i,
      /bus pass.*expired/i,
      /miss(ed)? appointment.*transport/i,
      'need help getting to appointments',
    ],
    translations: {
      es: [/no tengo (coche|carro|transporte)/i, /necesito.*transporte/i],
      fr: [/pas de transport/i],
    },
    severity: 'moderate',
    urgency: 'medium',
    defaultConfidence: 0.72,
    estimatedRevenue: 85,
  },
  {
    code: 'Z59.1',
    label: 'Inadequate housing utilities',
    domain: 'housing',
    keywords: [/utilities? (shut|turned) off/i, /electricity (got )?shut off/i, /without power/i],
    translations: {
      es: [/sin (luz|electricidad)/i],
      fr: [/sans électricité/i],
    },
    severity: 'high',
    urgency: 'high',
    defaultConfidence: 0.78,
    estimatedRevenue: 110,
  },
  {
    code: 'Z59.01',
    label: 'Sheltered homelessness',
    domain: 'housing',
    keywords: [/sleeping in (my|a) car/i, /living in (a )?shelter/i, /staying in the shelter/i],
    translations: {
      es: [/durmiendo en mi carro/i, /vivo en un refugio/i],
      fr: [/je dors dans ma voiture/i],
    },
    severity: 'high',
    urgency: 'high',
    defaultConfidence: 0.83,
    estimatedRevenue: 145,
  },
  {
    code: 'Z59.86',
    label: 'Financial insecurity',
    domain: 'financial',
    keywords: [/can't afford (my )?(meds|medications)/i, /ran out of money.*meds/i, /co-?pay.*too high/i],
    translations: {
      es: [/no puedo pagar mis medicinas/i, /medicamentos.*muy caros/i],
      fr: [/je ne peux pas payer mes médicaments/i],
    },
    severity: 'moderate',
    urgency: 'medium',
    defaultConfidence: 0.7,
    estimatedRevenue: 92,
  },
  {
    code: 'Z59.41',
    label: 'Food insecurity',
    domain: 'nutrition',
    keywords: [/food bank/i, /miss(ed)? meals?/i, /empty fridge/i, /no groceries/i],
    translations: {
      es: [/banco de alimentos/i, /sin comida/i, /nevera vacía/i],
      fr: [/banque alimentaire/i],
    },
    severity: 'high',
    urgency: 'high',
    defaultConfidence: 0.8,
    estimatedRevenue: 125,
  },
  {
    code: 'Z59.81',
    label: 'Housing instability',
    domain: 'housing',
    keywords: [/landlord.*evict/i, /facing eviction/i, /notice to vacate/i, /behind on rent/i],
    translations: {
      es: [/desalojo/i, /mi casero.*me (va|quiere) sacar/i],
      fr: [/expulsion/i],
    },
    severity: 'high',
    urgency: 'medium',
    defaultConfidence: 0.77,
    estimatedRevenue: 130,
  },
];

const RESOLVED_HINTS = [/no longer/i, /got (it )?handled/i, /resolved/i, /taken care of/i];
const HISTORICAL_HINTS = [/last year/i, /used to/i, /previously/i];
const URGENT_HINTS = [/right now/i, /urgent/i, /emergency/i, /tonight/i];

const LANGUAGE_ALIASES: Record<string, string> = {
  es: 'es',
  spa: 'es',
  español: 'es',
  en: 'en',
  eng: 'en',
  english: 'en',
  fr: 'fr',
  fra: 'fr',
  français: 'fr',
};

function normalizeLanguage(lang?: string): string | undefined {
  if (!lang) return undefined;
  const key = lang.toLowerCase();
  return LANGUAGE_ALIASES[key] || key.slice(0, 2);
}

function determineStatus(text: string): IssueStatus {
  if (RESOLVED_HINTS.some((pattern) => pattern.test(text))) return 'resolved';
  if (HISTORICAL_HINTS.some((pattern) => pattern.test(text))) return 'historical';
  return 'current';
}

function adjustConfidence(base: number, text: string): number {
  let confidence = base;
  if (URGENT_HINTS.some((pattern) => pattern.test(text))) {
    confidence += 0.08;
  }
  if (/maybe|might|not sure|possibly/i.test(text)) {
    confidence -= 0.12;
  }
  return Math.max(0.4, Math.min(0.98, parseFloat(confidence.toFixed(2))));
}

function matchPatterns(message: ConversationMessage): IssueMatch[] {
  const normalizedLanguage = normalizeLanguage(message.language);
  const text = message.text;
  const lower = text.toLowerCase();
  const matches: IssueMatch[] = [];

  for (const pattern of BASE_PATTERNS) {
    const pools: (RegExp | string)[] = [...pattern.keywords];
    if (pattern.translations && normalizedLanguage) {
      const translated = pattern.translations[normalizedLanguage];
      if (translated) {
        pools.push(...translated);
      }
    }

    const matched = pools.some((keyword) => {
      if (keyword instanceof RegExp) {
        return keyword.test(text);
      }
      return lower.includes(keyword.toLowerCase());
    });

    if (matched) {
      const status = determineStatus(text);
      const confidence = adjustConfidence(pattern.defaultConfidence, text);
      matches.push({
        code: pattern.code,
        label: pattern.label,
        domain: pattern.domain,
        severity: pattern.severity,
        urgency: pattern.urgency,
        status,
        confidence,
        evidence: [
          {
            quote: text.trim(),
            speaker: message.speaker,
            timestamp: message.timestamp,
            language: normalizedLanguage,
          },
        ],
        rationale: `Detected key phrases associated with ${pattern.label.toLowerCase()} in ${normalizedLanguage || 'en'} conversation.`,
        estimatedRevenue: pattern.estimatedRevenue,
      });
    }
  }

  return matches;
}

function mergeIssues(existing: IssueMatch[], incoming: IssueMatch[]): IssueMatch[] {
  const byCode = new Map<string, IssueMatch>();

  for (const issue of existing) {
    byCode.set(issue.code, { ...issue });
  }

  for (const issue of incoming) {
    const current = byCode.get(issue.code);
    if (!current) {
      byCode.set(issue.code, { ...issue });
      continue;
    }

    const combinedConfidence = Math.max(current.confidence, issue.confidence);
    const severity = issue.severity === 'high' || current.severity === 'high' ? 'high' : current.severity;
    const urgency = issue.urgency === 'high' || current.urgency === 'high' ? 'high' : current.urgency;
    const status = current.status === 'current' || issue.status === 'current' ? 'current' : issue.status;

    byCode.set(issue.code, {
      ...current,
      confidence: Math.max(combinedConfidence, current.confidence),
      severity,
      urgency,
      status,
      evidence: [...current.evidence, ...issue.evidence],
      rationale: issue.rationale,
      estimatedRevenue: Math.max(current.estimatedRevenue, issue.estimatedRevenue),
    });
  }

  return Array.from(byCode.values()).map((issue) => ({
    ...issue,
    confidence: parseFloat(Math.min(issue.confidence + Math.min(issue.evidence.length * 0.02, 0.1), 0.99).toFixed(2)),
  }));
}

function generateNarrative(memberId: string | undefined, issues: IssueMatch[], languages: string[]): string {
  if (issues.length === 0) {
    return `Conversation review for ${memberId ?? 'member'} did not surface active SDOH risks. Continue routine screening cadence.`;
  }

  const summaries = issues
    .map(
      (issue) =>
        `${issue.label} (${issue.code}) remains ${issue.status === 'current' ? 'active' : issue.status}. ` +
        `Severity assessed as ${issue.severity}, urgency ${issue.urgency}.`
    )
    .join(' ');

  return [
    `Multi-language transcript review (${languages.join(', ')}) for ${memberId ?? 'member'} identified ${issues.length} actionable SDOH concern(s).`,
    summaries,
    'Document direct member quotes under Evidence to support billing. Provide warm handoffs for urgent risks and schedule follow-up within 48 hours for high severity findings.',
  ].join(' ');
}

function buildDocumentation(request: DetectionRequest, issues: IssueMatch[], languages: string[]): Documentation {
  return {
    structured: {
      memberId: request.memberId,
      encounterId: request.context?.encounterId,
      detectedAt: new Date().toISOString(),
      languages,
      issues: issues.map((issue) => ({
        code: issue.code,
        label: issue.label,
        severity: issue.severity,
        urgency: issue.urgency,
        status: issue.status,
        confidence: issue.confidence,
        evidenceCount: issue.evidence.length,
      })),
    },
    narrative: generateNarrative(request.memberId, issues, languages),
    recommendedCodes: issues.map((issue) => ({
      code: issue.code,
      label: issue.label,
      confidence: issue.confidence,
      severity: issue.severity,
      urgency: issue.urgency,
    })),
    evidence: issues.flatMap((issue) => issue.evidence),
  };
}

function computeRevenueMetrics(request: DetectionRequest, issues: IssueMatch[]): RevenueMetrics {
  const potentialRevenue = issues.reduce((sum, issue) => sum + issue.estimatedRevenue, 0);
  const required = request.context?.requiredScreenings ?? 20;
  const completed = (request.context?.completedScreenings ?? 15) + (issues.length > 0 ? 1 : 0);
  const prevalenceTrends = issues.map((issue) => ({
    code: issue.code,
    label: issue.label,
    percent: parseFloat((Math.random() * 15 + 5).toFixed(1)),
    delta: parseFloat(((Math.random() - 0.5) * 4).toFixed(1)),
  }));

  return {
    potentialRevenue: parseFloat(potentialRevenue.toFixed(2)),
    zCodesGenerated: issues.length,
    patientsScreened: completed,
    patientsRequired: required,
    riskAdjustmentImpact: parseFloat((issues.length * 215).toFixed(2)),
    prevalenceTrends,
    accuracyEstimate: issues.length > 0 ? 0.87 : 0.91,
    latencyEstimateMs: issues.length > 0 ? 1800 : 900,
  };
}

function computeCompliance(request: DetectionRequest, issues: IssueMatch[]): ComplianceSummary {
  const needsScreening = issues.length === 0;
  const completionRate = Math.min(1, (request.context?.completedScreenings ?? 15) / (request.context?.requiredScreenings ?? 20));
  const month = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' });
  const cmsReport = [
    {
      month,
      completed: request.context?.completedScreenings ?? 15,
      pending: Math.max(0, (request.context?.requiredScreenings ?? 20) - (request.context?.completedScreenings ?? 15)),
      overdue: issues.some((issue) => issue.urgency === 'high') ? 3 : 1,
    },
  ];

  const alerts: ComplianceSummary['alerts'] = issues
    .filter((issue) => issue.urgency === 'high')
    .map((issue) => ({
      memberId: request.memberId,
      message: `${issue.label} requires follow-up within 48 hours to maintain CMS compliance.`,
      severity: 'critical' as const,
    }));

  if (alerts.length === 0 && needsScreening) {
    alerts.push({
      memberId: request.memberId,
      message: 'Member due for annual SDOH screening per CMS guidance.',
      severity: 'warning',
    });
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (needsScreening ? 7 : 30));

  return {
    needsScreening,
    nextDueDate: dueDate.toISOString(),
    completionRate: parseFloat((completionRate * 100).toFixed(1)),
    cmsReport,
    alerts,
  };
}

async function callOpenAI(request: DetectionRequest): Promise<IssueMatch[] | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const { OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcriptText = request.transcript
      .map((message) => `${message.speaker}: ${message.text}`)
      .join('\n');

    const prompt = [
      'You are a clinical documentation specialist extracting Social Determinants of Health (SDOH) indicators from multi-language transcripts.',
      'Return a JSON array with objects: code, label, domain, severity (low|moderate|high), urgency (low|medium|high), status (current|resolved|historical), confidence (0-1), rationale, estimatedRevenue (number), evidence array of {quote, speaker}.',
      'Focus on ICD-10 Z-codes related to housing, food, financial, transportation, utility, safety, and social support needs.',
      'Transcript:',
      transcriptText,
    ].join('\n\n');

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      input: prompt,
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.output_text;
    const json = JSON.parse(content || '{}');
    if (!Array.isArray(json.issues)) {
      return null;
    }

    return json.issues.map((item: any) => ({
      code: item.code,
      label: item.label,
      domain: item.domain || 'sdoh',
      severity: item.severity || 'moderate',
      urgency: item.urgency || 'medium',
      status: item.status || 'current',
      confidence: parseFloat(parseFloat(item.confidence ?? 0.7).toFixed(2)),
      evidence: Array.isArray(item.evidence)
        ? item.evidence.map((ev: any) => ({
            quote: ev.quote,
            speaker: ev.speaker || 'member',
            timestamp: ev.timestamp,
            language: normalizeLanguage(ev.language),
          }))
        : [],
      rationale: item.rationale || 'AI generated rationale.',
      estimatedRevenue: parseFloat(item.estimatedRevenue ?? 100),
    }));
  } catch (error) {
    console.error('OpenAI detection failed, using fallback', error);
    return null;
  }
}

export async function detectConversation(request: DetectionRequest): Promise<DetectionResponse> {
  const transcript = request.transcript || [];
  const languages = Array.from(
    new Set(
      transcript
        .map((message) => normalizeLanguage(message.language) || (/[áéíóúñ¡¿]/i.test(message.text) ? 'es' : 'en'))
        .filter(Boolean)
    )
  );

  const aiIssues = await callOpenAI(request);
  let issues: IssueMatch[];
  let fallbackUsed = false;

  if (aiIssues && aiIssues.length > 0) {
    issues = aiIssues;
  } else {
    fallbackUsed = true;
    issues = [];
    for (const message of transcript) {
      const matches = matchPatterns(message);
      issues = mergeIssues(issues, matches);
    }
  }

  issues.sort((a, b) => b.confidence - a.confidence);

  const documentation = buildDocumentation(request, issues, languages.length > 0 ? languages : ['en']);
  const revenue = computeRevenueMetrics(request, issues);
  const compliance = computeCompliance(request, issues);

  return {
    engine: aiIssues ? 'gpt-orchestrator' : 'rule-based',
    issues,
    documentation,
    revenue,
    compliance,
    debug: {
      promptTokens: aiIssues ? transcript.reduce((count, message) => count + message.text.split(/\s+/).length, 0) : undefined,
      model: process.env.OPENAI_MODEL,
      fallbackUsed,
    },
  };
}

export function suggestZCodes({ note, responses }: { note?: string; responses: Record<string, any> }): IssueMatch[] {
  const transcript: ConversationMessage[] = [];
  if (note) {
    transcript.push({ speaker: 'care_team', text: note });
  }
  Object.entries(responses || {}).forEach(([key, value]) => {
    if (!value) return;
    transcript.push({ speaker: key.includes('clinician') ? 'clinician' : 'member', text: String(value) });
  });

  const issues = transcript.reduce<IssueMatch[]>((acc, message) => mergeIssues(acc, matchPatterns(message)), []);
  return issues;
}

export type { DetectionRequest, DetectionResponse, IssueMatch };
