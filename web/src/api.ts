const base = import.meta.env.VITE_API_BASE;

type ConversationMessage = {
  speaker: string;
  text: string;
  language?: string;
  timestamp?: string;
};

export type CallTranscriptMessage = {
  speaker: string;
  text: string;
  language?: string;
  timestamp?: string;
  startTime?: string;
  endTime?: string;
  confidence?: number;
};

export type VoiceDialResult = {
  provider: 'twilio' | 'stub';
  sid: string;
  status: string;
  delivered: boolean;
  preview?: { to: string; from?: string; url?: string; twiml?: string };
  error?: string;
};

export type DetectionResponse = {
  engine: string;
  issues: {
    code: string;
    label: string;
    domain: string;
    severity: string;
    urgency: string;
    status: string;
    confidence: number;
    evidence: { quote: string; speaker: string; timestamp?: string; language?: string }[];
    rationale: string;
    estimatedRevenue: number;
  }[];
  documentation: {
    structured: {
      issues: {
        code: string;
        label: string;
        severity: string;
        urgency: string;
        status: string;
        confidence: number;
        evidenceCount: number;
      }[];
      memberId?: string;
      encounterId?: string;
      detectedAt: string;
      languages: string[];
    };
    narrative: string;
    recommendedCodes: { code: string; label: string; confidence: number; severity: string; urgency: string }[];
    evidence: { quote: string; speaker: string; timestamp?: string; language?: string }[];
  };
  revenue: {
    potentialRevenue: number;
    zCodesGenerated: number;
    patientsScreened: number;
    patientsRequired: number;
    riskAdjustmentImpact: number;
    prevalenceTrends: { code: string; label: string; percent: number; delta: number }[];
    accuracyEstimate: number;
    latencyEstimateMs: number;
  };
  compliance: {
    needsScreening: boolean;
    nextDueDate: string;
    completionRate: number;
    cmsReport: { month: string; completed: number; pending: number; overdue: number }[];
    alerts: { memberId?: string; message: string; severity: 'info' | 'warning' | 'critical' }[];
  };
  debug?: { fallbackUsed: boolean; model?: string };
};

export type DetectionRunRecord = {
  id: string;
  scenarioId: string;
  scenarioName: string;
  memberId: string;
  memberName?: string | null;
  issues: DetectionResponse['issues'];
  narrative?: string | null;
  revenue?: DetectionResponse['revenue'] | null;
  compliance?: DetectionResponse['compliance'] | null;
  createdAt: string;
};

export type CallSummaryEmail = {
  to: string[];
  delivered: boolean;
  provider: string;
  sentAt?: string;
  status?: number | string;
  messageId?: string;
  preview?: { to: string[]; subject: string; text: string; html?: string } | null;
  error?: string;
};

export type CallRecord = {
  id: string;
  memberId?: string | null;
  memberName?: string | null;
  callSid?: string | null;
  direction: string;
  status: string;
  toNumber?: string | null;
  fromNumber?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  transcript: CallTranscriptMessage[];
  analysis?: DetectionResponse | null;
  analysisRunAt?: string | null;
  summaryEmail?: CallSummaryEmail | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export const api = {
  createScreening: (body: any) =>
    fetch(`${base}/api/screenings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
  suggestZ: (screeningId: string) =>
    fetch(`${base}/api/zcodes/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screeningId }),
    }).then((r) => r.json()),
  finalizeZ: (body: any) =>
    fetch(`${base}/api/zcodes/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
  pdf: (pack: any) =>
    fetch(`${base}/api/evidence/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pack),
    }),
  detectTranscript: (payload: { memberId: string; transcript: ConversationMessage[]; context?: Record<string, any> }): Promise<DetectionResponse> =>
    fetch(`${base}/api/ai/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json()),
  sendSummaryEmail: (payload: {
    to: string[];
    scenarioId?: string;
    scenarioName: string;
    memberId: string;
    memberName?: string;
    detection: DetectionResponse;
  }) =>
    fetch(`${base}/api/ai/send-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json()),
  recordDetection: (payload: {
    scenarioId: string;
    scenarioName: string;
    memberId: string;
    memberName?: string;
    detection: DetectionResponse;
  }) =>
    fetch(`${base}/api/ai/detections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json()),
  listDetections: (limit = 10): Promise<{ detections: DetectionRunRecord[] }> =>
    fetch(`${base}/api/ai/detections?limit=${limit}`, {
      headers: { 'Content-Type': 'application/json' },
    }).then((r) => r.json()),
  initiateCall: (payload: { to: string; from?: string; memberId?: string; memberName?: string; metadata?: Record<string, unknown> }):
    Promise<{ call: CallRecord; dial: VoiceDialResult }> =>
    fetch(`${base}/api/calls/outbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json()),
  listCalls: (limit = 25): Promise<{ calls: CallRecord[] }> =>
    fetch(`${base}/api/calls?limit=${limit}`, {
      headers: { 'Content-Type': 'application/json' },
    }).then((r) => r.json()),
  getCall: (id: string): Promise<{ call: CallRecord }> =>
    fetch(`${base}/api/calls/${id}`, {
      headers: { 'Content-Type': 'application/json' },
    }).then((r) => r.json()),
  runCallDetection: (id: string): Promise<{ call: CallRecord; detection: DetectionResponse }> =>
    fetch(`${base}/api/calls/${id}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).then((r) => r.json()),
  sendCallSummary: (id: string, payload: { to: string[] }): Promise<{ call: CallRecord; email: unknown }> =>
    fetch(`${base}/api/calls/${id}/send-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json()),
};
