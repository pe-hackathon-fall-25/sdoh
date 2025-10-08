import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, type DetectionResponse, type DetectionRunRecord } from '../api';

type TranscriptMessage = {
  speaker: string;
  text: string;
  language?: string;
  timestamp?: string;
};

type ScenarioDefinition = {
  id: string;
  icon: string;
  title: string;
  description: string;
  category: 'voice' | 'sms' | 'ehr' | 'monitoring' | 'alerts' | 'analytics' | 'post-discharge';
  memberId: string;
  memberName: string;
  defaultRecipients: string[];
  transcript: TranscriptMessage[];
  context?: Record<string, unknown>;
  participants: string[];
};

type ToastState = { message: string; tone: 'success' | 'error' } | null;

const scenarios: ScenarioDefinition[] = [
  {
    id: 'care-coordination',
    icon: '🩺',
    title: 'Care Coordination Calls',
    description: 'Document voice call SDOH risks with narrative summaries for case managers.',
    category: 'voice',
    memberId: 'member-1001',
    memberName: 'Alex Rivera',
    defaultRecipients: ['care.team+alex@example.org'],
    participants: ['member', 'navigator', 'case-manager'],
    transcript: [
      {
        speaker: 'navigator',
        text: 'Hi Alex, thanks for taking the call. We are checking in on groceries and utilities this week.',
        language: 'en',
        timestamp: '2025-02-01T15:02:00Z',
      },
      {
        speaker: 'member',
        text: 'The pantry ran out of produce and I skipped dinner twice. Mi refrigerador está casi vacío.',
        language: 'es',
        timestamp: '2025-02-01T15:02:21Z',
      },
      {
        speaker: 'member',
        text: 'Our power bill is overdue and the company sent a shutoff warning for Friday.',
        language: 'en',
        timestamp: '2025-02-01T15:02:58Z',
      },
      {
        speaker: 'navigator',
        text: 'We will escalate LIHEAP and emergency food. Anything else impacting you?',
        language: 'en',
        timestamp: '2025-02-01T15:03:21Z',
      },
      {
        speaker: 'member',
        text: 'I sleep in the car sometimes to stay warm. Estoy muy preocupado.',
        language: 'es',
        timestamp: '2025-02-01T15:03:47Z',
      },
    ],
    context: { requiredScreenings: 24, completedScreenings: 18, monthlyGoal: 30 },
  },
  {
    id: 'sms-outreach',
    icon: '💬',
    title: 'Outreach SMS Screening',
    description: 'Automate texting programs that triage food, housing, and transportation needs.',
    category: 'sms',
    memberId: 'member-2048',
    memberName: 'María López',
    defaultRecipients: ['outreach.team@example.org'],
    participants: ['member', 'outreach-bot', 'care-coordinator'],
    transcript: [
      {
        speaker: 'outreach-bot',
        text: 'Hi María, checking in. Are you managing food and housing okay this week?',
        language: 'en',
        timestamp: '2025-02-03T18:18:00Z',
      },
      {
        speaker: 'member',
        text: "We're short on groceries and my landlord posted an eviction notice.",
        language: 'en',
        timestamp: '2025-02-03T18:18:17Z',
      },
      {
        speaker: 'member',
        text: 'También necesito ayuda con transporte para llegar a la clínica.',
        language: 'es',
        timestamp: '2025-02-03T18:18:42Z',
      },
      {
        speaker: 'care-coordinator',
        text: 'Thank you for sharing. We will schedule a follow-up to connect you with local food resources.',
        language: 'en',
        timestamp: '2025-02-03T18:19:08Z',
      },
    ],
    context: { channel: 'sms', campaign: 'food-housing-outreach' },
  },
  {
    id: 'ehr-intake',
    icon: '🧾',
    title: 'EHR Intake Form AI Screening',
    description: 'Convert intake answers into Z-codes and FHIR attachments automatically.',
    category: 'ehr',
    memberId: 'member-3090',
    memberName: 'Jordan Ellis',
    defaultRecipients: ['ehr.integration@example.org'],
    participants: ['member', 'intake-form', 'nurse'],
    transcript: [
      {
        speaker: 'intake-form',
        text: 'Do you currently have concerns about food, housing, or utilities?',
        language: 'en',
        timestamp: '2025-02-05T14:05:00Z',
      },
      {
        speaker: 'member',
        text: 'Yes, I ran out of groceries last week and the pantry is closed on weekends.',
        language: 'en',
        timestamp: '2025-02-05T14:05:36Z',
      },
      {
        speaker: 'member',
        text: 'My rent went up $400 and I cannot keep up. Estoy atrasado con el pago.',
        language: 'es',
        timestamp: '2025-02-05T14:06:12Z',
      },
      {
        speaker: 'nurse',
        text: 'Thank you, we will document this and connect you to housing navigation.',
        language: 'en',
        timestamp: '2025-02-05T14:06:45Z',
      },
    ],
    context: { encounterId: 'enc-3090', site: 'Greenwood Community Health' },
  },
  {
    id: 'elderly-check-in',
    icon: '👵',
    title: 'Elderly Weekly Check-In',
    description: 'Blend voice + SMS responses from aging members to escalate urgent needs.',
    category: 'monitoring',
    memberId: 'member-4120',
    memberName: 'Evelyn Smith',
    defaultRecipients: ['aging.services@example.org'],
    participants: ['member', 'ivr', 'care-navigator'],
    transcript: [
      {
        speaker: 'ivr',
        text: 'Press 1 if you are having trouble affording groceries this week.',
        language: 'en',
        timestamp: '2025-02-07T10:01:00Z',
      },
      {
        speaker: 'member',
        text: 'I pressed 1. The store prices doubled and my pantry is empty.',
        language: 'en',
        timestamp: '2025-02-07T10:01:22Z',
      },
      {
        speaker: 'member',
        text: 'También necesito transporte para mi cita cardiológica.',
        language: 'es',
        timestamp: '2025-02-07T10:01:58Z',
      },
      {
        speaker: 'care-navigator',
        text: 'Noted Evelyn, we will send a care coordinator to follow up today.',
        language: 'en',
        timestamp: '2025-02-07T10:02:31Z',
      },
    ],
    context: { channel: 'voice', cadence: 'weekly' },
  },
  {
    id: 'care-team-alerts',
    icon: '🚨',
    title: 'Care Team Alerts',
    description: 'Trigger critical alerts when multiple SDOH risks are detected.',
    category: 'alerts',
    memberId: 'member-5233',
    memberName: 'Samuel Green',
    defaultRecipients: ['quality.team@example.org'],
    participants: ['member', 'nurse', 'social-worker'],
    transcript: [
      {
        speaker: 'nurse',
        text: 'Samuel, tell me how you are doing with housing and medication today.',
        language: 'en',
        timestamp: '2025-02-08T09:10:00Z',
      },
      {
        speaker: 'member',
        text: 'I am sleeping on my sister’s couch. The shelter waitlist is 6 weeks.',
        language: 'en',
        timestamp: '2025-02-08T09:10:25Z',
      },
      {
        speaker: 'member',
        text: 'No puedo pagar mis medicamentos para la diabetes este mes.',
        language: 'es',
        timestamp: '2025-02-08T09:11:00Z',
      },
      {
        speaker: 'social-worker',
        text: 'We will prioritize your case and loop in the medication assistance team.',
        language: 'en',
        timestamp: '2025-02-08T09:11:40Z',
      },
    ],
    context: { dashboardUrl: 'https://portal.example.org/care-team/tasks' },
  },
  {
    id: 'population-analytics',
    icon: '📊',
    title: 'Population Health Analytics',
    description: 'Aggregate AI detections for monthly compliance and revenue dashboards.',
    category: 'analytics',
    memberId: 'cohort-analytics',
    memberName: 'Cohort Summary',
    defaultRecipients: ['population.health@example.org'],
    participants: ['analyst', 'ai-engine'],
    transcript: [
      {
        speaker: 'analyst',
        text: 'Generate a report for January cohorts with AI-detected SDOH trends.',
        language: 'en',
        timestamp: '2025-02-09T12:20:00Z',
      },
      {
        speaker: 'ai-engine',
        text: 'Detected 128 members with food insecurity and 74 with housing instability.',
        language: 'en',
        timestamp: '2025-02-09T12:20:33Z',
      },
      {
        speaker: 'ai-engine',
        text: 'Average screening completion 82%. Revenue lift estimate $214,000.',
        language: 'en',
        timestamp: '2025-02-09T12:21:05Z',
      },
      {
        speaker: 'analyst',
        text: 'Highlight members overdue for screenings and compliance gaps.',
        language: 'en',
        timestamp: '2025-02-09T12:21:41Z',
      },
    ],
    context: { cohortSize: 420, reportingMonth: '2025-01' },
  },
  {
    id: 'post-discharge',
    icon: '🏥',
    title: 'Post-Discharge Follow-Up',
    description: 'Capture barriers after discharge and route referrals instantly.',
    category: 'post-discharge',
    memberId: 'member-6344',
    memberName: 'Tiana Brooks',
    defaultRecipients: ['transitions@example.org'],
    participants: ['member', 'transition-nurse'],
    transcript: [
      {
        speaker: 'transition-nurse',
        text: 'Hi Tiana, were you able to pick up your medications after leaving the hospital?',
        language: 'en',
        timestamp: '2025-02-10T16:45:00Z',
      },
      {
        speaker: 'member',
        text: 'No, I could not afford the copay and I have no ride to the pharmacy.',
        language: 'en',
        timestamp: '2025-02-10T16:45:32Z',
      },
      {
        speaker: 'member',
        text: 'También necesito comida suave porque mis encías duelen.',
        language: 'es',
        timestamp: '2025-02-10T16:46:01Z',
      },
      {
        speaker: 'transition-nurse',
        text: 'We will send a care coordinator with groceries and arrange medication delivery.',
        language: 'en',
        timestamp: '2025-02-10T16:46:28Z',
      },
    ],
    context: { dischargeDate: '2025-02-08', encounterId: 'enc-6344' },
  },
];

type ScenarioFilterValue = ScenarioDefinition['category'] | 'all';

const scenarioFilters: { value: ScenarioFilterValue; label: string }[] = [
  { value: 'all', label: 'All scenarios' },
  { value: 'voice', label: 'Voice' },
  { value: 'sms', label: 'SMS' },
  { value: 'ehr', label: 'EHR' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'alerts', label: 'Alerts' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'post-discharge', label: 'Post-discharge' },
];

const timeFilters = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
];

type TimeFilterValue = (typeof timeFilters)[number]['value'];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ScenariosDashboard() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(scenarios[0]?.id ?? '');
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptMessage[]>>(() => {
    const initial: Record<string, TranscriptMessage[]> = {};
    for (const scenario of scenarios) {
      initial[scenario.id] = scenario.transcript;
    }
    return initial;
  });
  const [detections, setDetections] = useState<Record<string, DetectionResponse | null>>({});
  const [recentDetections, setRecentDetections] = useState<DetectionRunRecord[]>([]);
  const [loadingScenario, setLoadingScenario] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [scenarioFilter, setScenarioFilter] = useState<ScenarioFilterValue>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>('30d');
  const [draftMessage, setDraftMessage] = useState<{ speaker: string; text: string; language: string }>({
    speaker: scenarios[0]?.participants[0] ?? 'member',
    text: '',
    language: '',
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0],
    [selectedScenarioId]
  );

  const scenarioMessages = transcripts[selectedScenarioId] ?? [];
  const activeDetection = detections[selectedScenarioId] ?? null;

  const transcriptLanguages = useMemo(() => {
    const langs = new Set<string>();
    scenarioMessages.forEach((message) => {
      if (message.language) langs.add(message.language);
    });
    return Array.from(langs);
  }, [scenarioMessages]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await api.listDetections(25);
        if (!cancelled) {
          setRecentDetections(response.detections);
        }
      } catch (err) {
        console.error('Failed to load detections', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedScenario) return;
    setDraftMessage((current) => ({
      speaker: selectedScenario.participants.includes(current.speaker)
        ? current.speaker
        : selectedScenario.participants[0] ?? 'member',
      text: '',
      language: '',
    }));
    setEditingIndex(null);
  }, [selectedScenario]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(timeout);
  }, [toast]);

  const filteredScenarios = useMemo(() => {
    return scenarios.filter((scenario) => {
      const matchesFilter = scenarioFilter === 'all' || scenario.category === scenarioFilter;
      const matchesSearch = scenario.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        scenario.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [scenarioFilter, searchTerm]);

  const filteredRecentDetections = useMemo(() => {
    const now = Date.now();
    const cutoff = (() => {
      switch (timeFilter) {
        case '24h':
          return now - 24 * 60 * 60 * 1000;
        case '7d':
          return now - 7 * 24 * 60 * 60 * 1000;
        case '30d':
          return now - 30 * 24 * 60 * 60 * 1000;
        default:
          return 0;
      }
    })();
    return recentDetections.filter((detection) => {
      if (cutoff === 0) return true;
      const created = new Date(detection.createdAt).getTime();
      if (Number.isNaN(created)) return true;
      return created >= cutoff;
    });
  }, [recentDetections, timeFilter]);

  const issueFrequencyData = useMemo(() => {
    const counts = new Map<string, { code: string; label: string; count: number }>();
    filteredRecentDetections.forEach((record) => {
      record.issues.forEach((issue) => {
        if (!counts.has(issue.code)) {
          counts.set(issue.code, { code: issue.code, label: issue.label, count: 0 });
        }
        counts.get(issue.code)!.count += 1;
      });
    });
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map((item) => ({ name: `${item.code}`, label: item.label, count: item.count }));
  }, [filteredRecentDetections]);

  const confidenceByScenarioData = useMemo(() => {
    const aggregate = new Map<string, { scenario: string; total: number; count: number }>();
    filteredRecentDetections.forEach((record) => {
      if (!aggregate.has(record.scenarioName)) {
        aggregate.set(record.scenarioName, { scenario: record.scenarioName, total: 0, count: 0 });
      }
      const bucket = aggregate.get(record.scenarioName)!;
      record.issues.forEach((issue) => {
        bucket.total += issue.confidence;
        bucket.count += 1;
      });
    });
    return Array.from(aggregate.values()).map((entry) => ({
      scenario: entry.scenario,
      averageConfidence: entry.count ? Number((entry.total / entry.count).toFixed(2)) : 0,
    }));
  }, [filteredRecentDetections]);

  const complianceTrendData = useMemo(() => {
    return filteredRecentDetections
      .filter((record) => typeof record.compliance?.completionRate === 'number')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-10)
      .map((record) => ({
        date: new Date(record.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        rate: Number((record.compliance?.completionRate ?? 0).toFixed(2)),
      }));
  }, [filteredRecentDetections]);

  const maxIssueCount = useMemo(
    () => Math.max(1, ...issueFrequencyData.map((item) => item.count)),
    [issueFrequencyData]
  );

  const confidencePercentData = useMemo(
    () =>
      confidenceByScenarioData.map((item) => ({
        scenario: item.scenario,
        percent: Math.round(item.averageConfidence * 1000) / 10,
      })),
    [confidenceByScenarioData]
  );

  async function runDetection() {
    if (!selectedScenario) return;
    const transcript = transcripts[selectedScenario.id] ?? [];
    if (transcript.length === 0) {
      setError('Add at least one message before running detection.');
      return;
    }

    setLoadingScenario(selectedScenario.id);
    setError(null);
    try {
      const detection = await api.detectTranscript({
        memberId: selectedScenario.memberId,
        transcript,
        context: selectedScenario.context,
      });
      setDetections((prev) => ({ ...prev, [selectedScenario.id]: detection }));

      try {
        await api.recordDetection({
          scenarioId: selectedScenario.id,
          scenarioName: selectedScenario.title,
          memberId: selectedScenario.memberId,
          memberName: selectedScenario.memberName,
          detection,
        });
        const refreshed = await api.listDetections(25);
        setRecentDetections(refreshed.detections);
      } catch (recordError) {
        console.warn('Failed to persist detection', recordError);
      }
    } catch (err) {
      console.error(err);
      setError('The AI engine could not process the transcript. Try again shortly.');
    } finally {
      setLoadingScenario(null);
    }
  }

  async function sendSummaryEmail() {
    if (!selectedScenario) return;
    const detection = detections[selectedScenario.id];
    if (!detection) return;
    try {
      await api.sendSummaryEmail({
        to: selectedScenario.defaultRecipients,
        scenarioId: selectedScenario.id,
        scenarioName: selectedScenario.title,
        memberId: selectedScenario.memberId,
        memberName: selectedScenario.memberName,
        detection,
      });
      setToast({ message: 'Email sent successfully to care team.', tone: 'success' });
    } catch (err) {
      console.error(err);
      setToast({ message: 'Unable to send summary email. Check SendGrid settings.', tone: 'error' });
    }
  }

  function startEditMessage(index: number) {
    const message = scenarioMessages[index];
    if (!message || !selectedScenario) return;
    setDraftMessage({
      speaker: message.speaker,
      text: message.text,
      language: message.language ?? '',
    });
    setEditingIndex(index);
  }

  function removeMessage(index: number) {
    setTranscripts((prev) => ({
      ...prev,
      [selectedScenarioId]: (prev[selectedScenarioId] ?? []).filter((_, idx) => idx !== index),
    }));
    setEditingIndex(null);
    setDraftMessage((current) => ({ ...current, text: '', language: '' }));
  }

  function handleMessageSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedScenario) return;
    const text = draftMessage.text.trim();
    if (!text) return;
    const payload: TranscriptMessage = {
      speaker: draftMessage.speaker,
      text,
      language: draftMessage.language.trim() || undefined,
      timestamp: new Date().toISOString(),
    };
    setTranscripts((prev) => {
      const existing = prev[selectedScenario.id] ?? [];
      if (editingIndex !== null) {
        const next = [...existing];
        next.splice(editingIndex, 1, { ...existing[editingIndex], ...payload });
        return { ...prev, [selectedScenario.id]: next };
      }
      return { ...prev, [selectedScenario.id]: [...existing, payload] };
    });
    setDraftMessage({ speaker: draftMessage.speaker, text: '', language: '' });
    setEditingIndex(null);
  }

  return (
    <div className="page-shell scenarios-shell">
      <header className="scenarios-header">
        <div>
          <span className="hero-badge">SDOH AI Pipelines</span>
          <h1>Scenario Control Center</h1>
          <p>
            Orchestrate care coordination, outreach, intake, monitoring, alerts, analytics, and post-discharge workflows — all
            powered by the AI detection engine and SendGrid notifications.
          </p>
        </div>
        <div className="scenarios-filters">
          <label>
            <span>Scenario type</span>
            <select value={scenarioFilter} onChange={(event) => setScenarioFilter(event.target.value as ScenarioFilterValue)}>
              {scenarioFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Search</span>
            <input
              type="search"
              placeholder="Search scenarios"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label>
            <span>Time filter</span>
            <select value={timeFilter} onChange={(event) => setTimeFilter(event.target.value as TimeFilterValue)}>
              {timeFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section className="scenario-grid">
        {filteredScenarios.map((scenario) => (
          <button
            key={scenario.id}
            className={`scenario-card${scenario.id === selectedScenarioId ? ' scenario-card--active' : ''}`}
            type="button"
            onClick={() => setSelectedScenarioId(scenario.id)}
          >
            <div className="scenario-card__icon">{scenario.icon}</div>
            <div>
              <h3>{scenario.title}</h3>
              <p>{scenario.description}</p>
            </div>
            <footer>
              <span>{scenario.memberName}</span>
              <span className="scenario-card__tag">{scenario.category}</span>
            </footer>
          </button>
        ))}
      </section>

      {selectedScenario && (
        <section className="scenario-detail">
          <div className="transcript-panel">
            <header>
              <h2>
                {selectedScenario.icon} {selectedScenario.title}
              </h2>
              <span className="status-pill">Member ID: {selectedScenario.memberId}</span>
            </header>
            <div className="transcript-messages">
              {scenarioMessages.map((message, index) => (
                <div
                  key={`${message.timestamp ?? index}-${index}`}
                  className={`message-bubble message-bubble--${message.speaker === 'member' ? 'member' : 'staff'}`}
                >
                  <div className="message-meta">
                    <strong>{message.speaker}</strong>
                    {message.language && <span className="message-language">{message.language}</span>}
                    {message.timestamp && <time>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}
                  </div>
                  <p>{message.text}</p>
                  <div className="message-actions">
                    <button type="button" onClick={() => startEditMessage(index)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => removeMessage(index)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {scenarioMessages.length === 0 && <p className="empty-state">No transcript messages yet. Add one below to get started.</p>}
            </div>

            <form className="add-message" onSubmit={handleMessageSubmit}>
              <div className="add-message__controls">
                <label>
                  <span>Speaker</span>
                  <select
                    value={draftMessage.speaker}
                    onChange={(event) => setDraftMessage((prev) => ({ ...prev, speaker: event.target.value }))}
                  >
                    {selectedScenario.participants.map((participant) => (
                      <option key={participant} value={participant}>
                        {participant}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Language</span>
                  <input
                    value={draftMessage.language}
                    onChange={(event) => setDraftMessage((prev) => ({ ...prev, language: event.target.value }))}
                    placeholder="en, es, ..."
                  />
                </label>
              </div>
              <textarea
                placeholder="Add message"
                value={draftMessage.text}
                onChange={(event) => setDraftMessage((prev) => ({ ...prev, text: event.target.value }))}
                rows={3}
              />
              <div className="add-message__actions">
                <button className="btn" type="submit">
                  {editingIndex !== null ? 'Update message' : 'Add message'}
                </button>
                {editingIndex !== null && (
                  <button
                    className="btn btn--glass"
                    type="button"
                    onClick={() => {
                      setEditingIndex(null);
                      setDraftMessage((prev) => ({ ...prev, text: '', language: '' }));
                    }}
                  >
                    Cancel
                  </button>
                )}
                <button
                  className="btn btn--accent"
                  type="button"
                  onClick={runDetection}
                  disabled={loadingScenario === selectedScenario.id}
                >
                  {loadingScenario === selectedScenario.id ? 'Analyzing…' : 'Run AI Detection'}
                </button>
              </div>
            </form>
            {error && <p className="error-banner">{error}</p>}
          </div>

          <div className="results-panel">
            <header>
              <h3>Detected SDOH Issues</h3>
              {activeDetection && <span>{activeDetection.issues.length} issues</span>}
            </header>
            {!activeDetection && <p className="empty-state">Run the AI detection to see structured outputs.</p>}
            {activeDetection && (
              <ul className="issues-list">
                {activeDetection.issues.map((issue) => (
                  <li key={issue.code}>
                    <div className="issue-header">
                      <strong>
                        {issue.code} · {issue.label}
                      </strong>
                      <span className={`issue-pill issue-pill--${issue.severity.toLowerCase()}`}>{issue.severity}</span>
                    </div>
                    <div className="issue-meta">
                      <span>Urgency: {issue.urgency}</span>
                      <span>Confidence: {(issue.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <p>{issue.rationale}</p>
                    {issue.evidence.length > 0 && (
                      <details>
                        <summary>Evidence ({issue.evidence.length})</summary>
                        <ul>
                          {issue.evidence.map((ev, idx) => (
                            <li key={`${ev.quote}-${idx}`}>
                              <span>{ev.speaker}</span>: “{ev.quote}”{' '}
                              {ev.language && <em>({ev.language})</em>}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {activeDetection && (
              <button className="btn btn--glass send-email" type="button" onClick={sendSummaryEmail}>
                📧 Send Summary Email
              </button>
            )}
          </div>

          <aside className="insights-panel">
            <h3>AI Narrative & Insights</h3>
            {activeDetection ? (
              <>
                <p className="narrative">{activeDetection.documentation.narrative}</p>
                <div className="insight-block">
                  <h4>Potential Revenue</h4>
                  <p>${activeDetection.revenue.potentialRevenue.toLocaleString()}</p>
                </div>
                <div className="insight-block">
                  <h4>Compliance completion</h4>
                  <p>{activeDetection.compliance.completionRate.toFixed(1)}%</p>
                </div>
                {activeDetection.compliance.alerts.length > 0 && (
                  <div className="insight-block">
                    <h4>Alerts</h4>
                    <ul>
                      {activeDetection.compliance.alerts.map((alert, idx) => (
                        <li key={`${alert.message}-${idx}`}>{alert.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="empty-state">Insights will appear after the AI detection runs.</p>
            )}
            <div className="insight-block">
              <h4>Languages</h4>
              {transcriptLanguages.length ? (
                <div className="language-tags">
                  {transcriptLanguages.map((language) => (
                    <span key={language}>{language}</span>
                  ))}
                </div>
              ) : (
                <p>No language metadata</p>
              )}
            </div>
          </aside>
        </section>
      )}

      <section className="analytics-section">
        <div className="analytics-card">
          <h3>Detected issues by frequency</h3>
          {issueFrequencyData.length === 0 ? (
            <p className="empty-state">Run detections to populate analytics.</p>
          ) : (
            <ul className="analytics-bars">
              {issueFrequencyData.map((item) => (
                <li key={item.name}>
                  <div className="analytics-bars__label">
                    <span>{item.name}</span>
                    <span>{item.count}</span>
                  </div>
                  <div className="analytics-bars__meter">
                    <span style={{ width: `${Math.round((item.count / maxIssueCount) * 100)}%` }} />
                  </div>
                  <p className="analytics-bars__caption">{item.label}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="analytics-card">
          <h3>Average confidence by scenario</h3>
          {confidencePercentData.length === 0 ? (
            <p className="empty-state">Confidence metrics will appear after detections are saved.</p>
          ) : (
            <ul className="analytics-bars">
              {confidencePercentData.map((item) => (
                <li key={item.scenario}>
                  <div className="analytics-bars__label">
                    <span>{item.scenario}</span>
                    <span>{item.percent.toFixed(1)}%</span>
                  </div>
                  <div className="analytics-bars__meter analytics-bars__meter--teal">
                    <span style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="analytics-card">
          <h3>Compliance rate trend</h3>
          {complianceTrendData.length === 0 ? (
            <p className="empty-state">No compliance trend data yet.</p>
          ) : (
            <ul className="compliance-trend">
              {complianceTrendData.map((item) => (
                <li key={`${item.date}-${item.rate}`}>
                  <div className="compliance-trend__meta">
                    <strong>{item.date}</strong>
                    <span>{item.rate}%</span>
                  </div>
                  <div className="compliance-trend__meter">
                    <span style={{ width: `${Math.min(100, Math.max(0, item.rate))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="recent-detections">
        <header>
          <h2>Recent detections</h2>
          <span>{filteredRecentDetections.length} records</span>
        </header>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Member</th>
                <th>Issues</th>
                <th>Top issue</th>
                <th>Potential revenue</th>
                <th>Compliance</th>
                <th>Detected at</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecentDetections.map((record) => {
                const topIssue = record.issues[0];
                return (
                  <tr key={record.id}>
                    <td>{record.scenarioName}</td>
                    <td>{record.memberName ?? record.memberId}</td>
                    <td>{record.issues.length}</td>
                    <td>{topIssue ? `${topIssue.code} · ${topIssue.label}` : '—'}</td>
                    <td>
                      {typeof record.revenue?.potentialRevenue === 'number'
                        ? `$${Number(record.revenue.potentialRevenue).toLocaleString()}`
                        : '—'}
                    </td>
                    <td>
                      {typeof record.compliance?.completionRate === 'number'
                        ? `${Number(record.compliance.completionRate).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td>{formatDate(record.createdAt)}</td>
                  </tr>
                );
              })}
              {filteredRecentDetections.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No detections saved for this time range yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {toast && <div className={`toast toast--${toast.tone}`}>{toast.message}</div>}
    </div>
  );
}
