const base = import.meta.env.VITE_API_BASE;

type ConversationMessage = {
  speaker: string;
  text: string;
  language?: string;
  timestamp?: string;
};

export type CallTranscriptMessage = ConversationMessage;

export type CallSummary = {
  id: string;
  memberId: string;
  memberName?: string | null;
  direction: string;
  fromNumber?: string | null;
  toNumber?: string | null;
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  transcriptMessageCount: number;
  lastDetection?: { id: string; createdAt: string; issueCount: number } | null;
};

export type CallDetectionRecord = {
  id: string;
  engine?: string | null;
  issues: DetectionResponse['issues'];
  documentation?: DetectionResponse['documentation'] | null;
  revenue?: DetectionResponse['revenue'] | null;
  compliance?: DetectionResponse['compliance'] | null;
  narrative?: string | null;
  createdAt: string;
};

export type CallDetail = {
  call: CallSummary;
  transcript: { messages: CallTranscriptMessage[]; updatedAt: string | null };
  detections: CallDetectionRecord[];
  metadata?: Record<string, unknown> | null;
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
  createCall: (payload: {
    memberId: string;
    to: string;
    from?: string;
    direction?: 'outbound' | 'inbound';
    transcript?: CallTranscriptMessage[];
    metadata?: Record<string, unknown>;
  }): Promise<{ call?: CallSummary; transcript?: { messages: CallTranscriptMessage[] }; detections?: CallDetectionRecord[] }> =>
    fetch(`${base}/api/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json()),
  listCalls: (limit = 25): Promise<{ calls: CallSummary[] }> =>
    fetch(`${base}/api/calls?limit=${limit}`, {
      headers: { 'Content-Type': 'application/json' },
    }).then((r) => r.json()),
  getCall: (id: string): Promise<CallDetail> =>
    fetch(`${base}/api/calls/${id}`, {
      headers: { 'Content-Type': 'application/json' },
    }).then((r) => r.json()),
  runCallDetection: (
    id: string,
    body?: { context?: Record<string, unknown> }
  ): Promise<{ detectionId: string; detection: DetectionResponse }> =>
    fetch(`${base}/api/calls/${id}/run-detection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => r.json()),
  sendCallSummary: (
    id: string,
    payload: { to: string[]; detectionId?: string; subject?: string; intro?: string }
  ) =>
    fetch(`${base}/api/calls/${id}/send-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json()),
};
