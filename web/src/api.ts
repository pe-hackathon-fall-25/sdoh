const base = import.meta.env.VITE_API_BASE;

type ConversationMessage = {
  speaker: string;
  text: string;
  language?: string;
  timestamp?: string;
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
};
