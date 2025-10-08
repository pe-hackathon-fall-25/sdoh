import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  api,
  type DetectionResponse,
  type DetectionRunRecord,
} from '../api';

type ScenarioCategory =
  | 'voice'
  | 'sms'
  | 'ehr'
  | 'monitoring'
  | 'alerts'
  | 'analytics'
  | 'post-discharge';

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
  category: ScenarioCategory;
  memberId: string;
  memberName: string;
  defaultRecipients: string[];
  participants: string[];
  transcript: TranscriptMessage[];
  context?: Record<string, unknown>;
};

type ToastState = { message: string; tone: 'success' | 'error' } | null;

type DetectionMap = Record<string, DetectionResponse | null>;

type TranscriptMap = Record<string, TranscriptMessage[]>;

type ScenarioAnalytics = {
  issueFrequency: { name: string; count: number }[];
  averageConfidence: { name: string; value: number }[];
  complianceTrend: { period: string; completion: number }[];
};

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'care-coordination',
    icon: '🩺',
    title: 'Care Coordination Calls',
    description: 'Document voice call SDOH risks with narrative summaries for case managers.',
    category: 'voice',
    memberId: 'BH-1001',
    memberName: 'Alex Rivera',
    defaultRecipients: ['care.team@bloominghealth.com'],
    participants: ['member', 'navigator', 'case-manager'],
    transcript: [
      {
        speaker: 'navigator',
        text: 'Hi Alex, thanks for checking in. We are reviewing food, housing, and utilities today.',
        language: 'en',
        timestamp: '2025-02-01T15:02:00Z',
      },
      {
        speaker: 'member',
        text: 'The pantry ran out of produce and mi refrigerador está casi vacío.',
        language: 'es',
        timestamp: '2025-02-01T15:02:18Z',
      },
      {
        speaker: 'member',
        text: 'Our power bill is overdue and the company scheduled a shutoff for Friday.',
        language: 'en',
        timestamp: '2025-02-01T15:02:51Z',
      },
      {
        speaker: 'member',
        text: 'I sleep in the car some nights when it gets too cold inside.',
        language: 'en',
        timestamp: '2025-02-01T15:03:24Z',
      },
    ],
    context: {
      requiredScreenings: 24,
      completedScreenings: 18,
      monthlyGoal: 30,
    },
  },
  {
    id: 'sms-outreach',
    icon: '💬',
    title: 'Outreach SMS Screening',
    description: 'Automate texting programs that triage food, housing, and transportation needs.',
    category: 'sms',
    memberId: 'BH-2048',
    memberName: 'María López',
    defaultRecipients: ['outreach@bloominghealth.com'],
    participants: ['member', 'outreach-bot', 'care-coordinator'],
    transcript: [
      {
        speaker: 'outreach-bot',
        text: 'Hi María, how are groceries and housing this week? Reply and we will connect support.',
        language: 'en',
        timestamp: '2025-02-03T18:18:00Z',
      },
      {
        speaker: 'member',
        text: "We are short on groceries and my landlord posted an eviction notice.",
        language: 'en',
        timestamp: '2025-02-03T18:18:21Z',
      },
      {
        speaker: 'member',
        text: 'También necesito ayuda con transporte para llegar a la clínica.',
        language: 'es',
        timestamp: '2025-02-03T18:18:48Z',
      },
    ],
  },
  {
    id: 'ehr-intake',
    icon: '🧾',
    title: 'EHR Intake Form AI Screening',
    description: 'Convert intake answers into Z-codes and FHIR attachments automatically.',
    category: 'ehr',
    memberId: 'BH-3090',
    memberName: 'Jordan Ellis',
    defaultRecipients: ['ehr@bloominghealth.com'],
    participants: ['member', 'intake-form', 'nurse'],
    transcript: [
      {
        speaker: 'intake-form',
        text: 'Do you have any trouble keeping food or utilities at home?',
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
        text: 'My rent went up $400 and estoy atrasado con el pago.',
        language: 'es',
        timestamp: '2025-02-05T14:06:12Z',
      },
    ],
    context: {
      encounterId: 'enc-3090',
      site: 'Greenwood Community Health',
    },
  },
  {
    id: 'elderly-check-in',
    icon: '👵',
    title: 'Elderly Weekly Check-In',
    description: 'Blend voice and SMS responses from aging members to escalate urgent needs.',
    category: 'monitoring',
    memberId: 'BH-4120',
    memberName: 'Evelyn Smith',
    defaultRecipients: ['aging@bloominghealth.com'],
    participants: ['member', 'ivr', 'care-navigator'],
    transcript: [
      {
        speaker: 'ivr',
        text: 'Press 1 if you are having trouble affording groceries.',
        language: 'en',
        timestamp: '2025-02-07T16:00:00Z',
      },
      {
        speaker: 'member',
        text: 'I pressed 1 because my pantry is empty and I have not eaten a full meal in two days.',
        language: 'en',
        timestamp: '2025-02-07T16:00:24Z',
      },
      {
        speaker: 'member',
        text: 'El bus ya no llega a mi parada y no puedo ir al mercado.',
        language: 'es',
        timestamp: '2025-02-07T16:01:02Z',
      },
    ],
  },
  {
    id: 'care-team-alerts',
    icon: '🚨',
    title: 'Care Team Alerts',
    description: 'Spot multi-risk cases and escalate them to supervisors with dashboards.',
    category: 'alerts',
    memberId: 'BH-5230',
    memberName: 'Tariq Jones',
    defaultRecipients: ['quality@bloominghealth.com'],
    participants: ['member', 'navigator', 'pharmacist'],
    transcript: [
      {
        speaker: 'navigator',
        text: 'Tariq, we noticed you reported issues with food and medication pickups.',
        language: 'en',
        timestamp: '2025-02-08T18:10:00Z',
      },
      {
        speaker: 'member',
        text: 'The pharmacy is far and I missed two doses because I could not afford the ride.',
        language: 'en',
        timestamp: '2025-02-08T18:10:36Z',
      },
      {
        speaker: 'member',
        text: 'Our fridge is empty until my next check comes in.',
        language: 'en',
        timestamp: '2025-02-08T18:11:04Z',
      },
    ],
  },
  {
    id: 'population-analytics',
    icon: '📊',
    title: 'Population Health Analytics',
    description: 'Summarize common SDOH issues, revenue, and completion trends across members.',
    category: 'analytics',
    memberId: 'BH-COHORT',
    memberName: 'Population Cohort',
    defaultRecipients: ['analytics@bloominghealth.com'],
    participants: ['member', 'analyst', 'community-worker'],
    transcript: [
      {
        speaker: 'analyst',
        text: 'Aggregating the latest member conversations to quantify food and housing needs.',
        language: 'en',
      },
      {
        speaker: 'community-worker',
        text: 'Most members cite groceries and rent support. Necesitamos más recursos de vivienda.',
        language: 'es',
      },
    ],
  },
  {
    id: 'post-discharge',
    icon: '🏥',
    title: 'Post-Discharge Follow-Up',
    description: 'Detect barriers after discharge and route referrals to prevent readmissions.',
    category: 'post-discharge',
    memberId: 'BH-6150',
    memberName: 'Danielle Carter',
    defaultRecipients: ['transitions@bloominghealth.com'],
    participants: ['member', 'nurse', 'care-coordinator'],
    transcript: [
      {
        speaker: 'nurse',
        text: 'Hi Danielle, were you able to pick up medications and groceries after discharge?',
        language: 'en',
      },
      {
        speaker: 'member',
        text: 'Not yet, the pharmacy co-pay was too high and I have no groceries left.',
        language: 'en',
      },
      {
        speaker: 'member',
        text: 'Mi hermano me ayuda pero también está sin trabajo.',
        language: 'es',
      },
    ],
  },
];

function createInitialTranscriptState(): TranscriptMap {
  return SCENARIOS.reduce<TranscriptMap>((acc, scenario) => {
    acc[scenario.id] = scenario.transcript;
    return acc;
  }, {});
}

function formatTimestamp(timestamp?: string) {
  if (!timestamp) return 'Now';
  try {
    return new Intl.DateTimeFormat('en', {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    }).format(new Date(timestamp));
  } catch (error) {
    return timestamp;
  }
}

function getScenarioById(id: string | null) {
  if (!id) return null;
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

function toIssueFrequency(detections: DetectionRunRecord[]): ScenarioAnalytics['issueFrequency'] {
  const counts = new Map<string, number>();
  detections.forEach((detection) => {
    detection.issues.forEach((issue) => {
      const key = `${issue.code} ${issue.label}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function toAverageConfidence(detections: DetectionRunRecord[]): ScenarioAnalytics['averageConfidence'] {
  const grouped = new Map<string, { total: number; count: number }>();
  detections.forEach((detection) => {
    if (!detection.issues.length) return;
    const confidence =
      detection.issues.reduce((sum, issue) => sum + issue.confidence, 0) / detection.issues.length;
    const current = grouped.get(detection.scenarioName) ?? { total: 0, count: 0 };
    grouped.set(detection.scenarioName, { total: current.total + confidence, count: current.count + 1 });
  });
  return Array.from(grouped.entries())
    .map(([name, value]) => ({ name, value: Number((value.total / value.count).toFixed(2)) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function toComplianceTrend(detections: DetectionRunRecord[]): ScenarioAnalytics['complianceTrend'] {
  const grouped = new Map<string, number[]>();
  detections.forEach((detection) => {
    const completion = detection.compliance?.completionRate;
    if (typeof completion === 'number') {
      const period = new Date(detection.createdAt).toISOString().slice(0, 10);
      const arr = grouped.get(period) ?? [];
      arr.push(completion);
      grouped.set(period, arr);
    }
  });
  return Array.from(grouped.entries())
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([period, values]) => ({
      period,
      completion: Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2)),
    }))
    .slice(-7);
}

function buildAnalytics(detections: DetectionRunRecord[]): ScenarioAnalytics {
  return {
    issueFrequency: toIssueFrequency(detections),
    averageConfidence: toAverageConfidence(detections),
    complianceTrend: toComplianceTrend(detections),
  };
}

export default function ScenariosDashboard() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(SCENARIOS[0]?.id ?? null);
  const [transcripts, setTranscripts] = useState<TranscriptMap>(() => createInitialTranscriptState());
  const [detections, setDetections] = useState<DetectionMap>({});
  const [recentDetections, setRecentDetections] = useState<DetectionRunRecord[]>([]);
  const [filters, setFilters] = useState({
    category: 'all' as 'all' | ScenarioCategory,
    search: '',
    timeRange: '30d' as '7d' | '30d' | '90d',
  });
  const [toast, setToast] = useState<ToastState>(null);
  const [loadingDetect, setLoadingDetect] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    api
      .listDetections(25)
      .then((response) => setRecentDetections(response.detections ?? []))
      .catch(() => {
        setRecentDetections([]);
      });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timeout);
  }, [toast]);

  const selectedScenario = getScenarioById(selectedScenarioId);
  const transcript = selectedScenario ? transcripts[selectedScenario.id] ?? [] : [];
  const detection = selectedScenario ? detections[selectedScenario.id] ?? null : null;

  const filteredScenarios = useMemo(() => {
    return SCENARIOS.filter((scenario) => {
      if (filters.category !== 'all' && scenario.category !== filters.category) return false;
      if (!filters.search) return true;
      const haystack = `${scenario.title} ${scenario.description}`.toLowerCase();
      return haystack.includes(filters.search.toLowerCase());
    });
  }, [filters]);

  const filteredRecentDetections = useMemo(() => {
    const cutoff = (() => {
      const now = new Date();
      if (filters.timeRange === '7d') {
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
      if (filters.timeRange === '30d') {
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    })();
    return recentDetections.filter((row) => new Date(row.createdAt) >= cutoff);
  }, [recentDetections, filters.timeRange]);

  const analytics = useMemo(() => buildAnalytics(filteredRecentDetections), [filteredRecentDetections]);

  function handleSelectScenario(id: string) {
    setSelectedScenarioId(id);
  }

  function handleLoadExample() {
    if (!selectedScenario) return;
    setTranscripts((current) => ({
      ...current,
      [selectedScenario.id]: [...selectedScenario.transcript],
    }));
  }

  function handleEditMessage(index: number, field: keyof TranscriptMessage, value: string) {
    if (!selectedScenario) return;
    setTranscripts((current) => {
      const nextMessages = [...(current[selectedScenario.id] ?? [])];
      nextMessages[index] = { ...nextMessages[index], [field]: value };
      return { ...current, [selectedScenario.id]: nextMessages };
    });
  }

  function handleAddMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedScenario) return;
    const formData = new FormData(event.currentTarget);
    const speaker = (formData.get('speaker') as string) || 'member';
    const text = (formData.get('text') as string) || '';
    const language = (formData.get('language') as string) || undefined;
    if (!text.trim()) return;

    setTranscripts((current) => ({
      ...current,
      [selectedScenario.id]: [
        ...(current[selectedScenario.id] ?? []),
        { speaker, text, language, timestamp: new Date().toISOString() },
      ],
    }));

    event.currentTarget.reset();
  }

  async function handleRunDetection() {
    if (!selectedScenario) return;
    setLoadingDetect(true);
    try {
      const result = await api.detectTranscript({
        memberId: selectedScenario.memberId,
        transcript,
        context: selectedScenario.context,
      });
      setDetections((current) => ({ ...current, [selectedScenario.id]: result }));

      try {
        const record = await api.recordDetection({
          scenarioId: selectedScenario.id,
          scenarioName: selectedScenario.title,
          memberId: selectedScenario.memberId,
          memberName: selectedScenario.memberName,
          detection: result,
        });
        if (record?.id) {
          setRecentDetections((current) => [
            {
              id: record.id,
              scenarioId: selectedScenario.id,
              scenarioName: selectedScenario.title,
              memberId: selectedScenario.memberId,
              memberName: selectedScenario.memberName,
              issues: result.issues,
              narrative: result.documentation?.narrative,
              revenue: result.revenue,
              compliance: result.compliance,
              createdAt: new Date().toISOString(),
            },
            ...current,
          ].slice(0, 50));
        }
      } catch (error) {
        console.error('Failed to record detection', error);
      }
    } catch (error) {
      console.error('Detection failed', error);
      setToast({ message: 'Unable to run detection. Please try again.', tone: 'error' });
    } finally {
      setLoadingDetect(false);
    }
  }

  async function handleSendEmail() {
    if (!selectedScenario || !detection) return;
    setSendingEmail(true);
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
    } catch (error) {
      console.error('Failed to send email', error);
      setToast({ message: 'Unable to send email. Check SendGrid settings.', tone: 'error' });
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <div className="scenarios-shell">
      <header className="scenarios-header">
        <div>
          <p className="scenarios-subtitle">Blooming Health • SDOH AI Journeys</p>
          <h1>Scenario Playbooks</h1>
          <p className="scenarios-description">
            Simulate seven real-world pipelines, detect SDOH risks, and trigger SendGrid documentation in minutes.
          </p>
        </div>
        <div className="scenarios-profile">
          <span className="scenarios-logo">🌱</span>
          <div>
            <strong>Care Manager</strong>
            <span>Blooming Health</span>
          </div>
        </div>
      </header>

      <section className="scenarios-filters">
        <select
          value={filters.category}
          onChange={(event) =>
            setFilters((current) => ({ ...current, category: event.target.value as typeof filters.category }))
          }
        >
          <option value="all">All scenario types</option>
          <option value="voice">Voice & hybrid</option>
          <option value="sms">SMS outreach</option>
          <option value="ehr">EHR intake</option>
          <option value="monitoring">Monitoring</option>
          <option value="alerts">Alerts</option>
          <option value="analytics">Analytics</option>
          <option value="post-discharge">Post-discharge</option>
        </select>
        <input
          type="search"
          placeholder="Search scenarios"
          value={filters.search}
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
        />
        <select
          value={filters.timeRange}
          onChange={(event) =>
            setFilters((current) => ({ ...current, timeRange: event.target.value as typeof filters.timeRange }))
          }
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </section>

      <section className="scenarios-grid">
        {filteredScenarios.map((scenario) => {
          const isActive = scenario.id === selectedScenarioId;
          return (
            <button
              key={scenario.id}
              type="button"
              className={`scenario-card${isActive ? ' scenario-card--active' : ''}`}
              onClick={() => handleSelectScenario(scenario.id)}
            >
              <span className="scenario-icon">{scenario.icon}</span>
              <h2>{scenario.title}</h2>
              <p>{scenario.description}</p>
              <span className="scenario-cta">Start Scenario →</span>
            </button>
          );
        })}
      </section>

      {selectedScenario && (
        <section className="scenario-workspace">
          <div className="scenario-main">
            <div className="transcript-header">
              <h3>
                {selectedScenario.icon} {selectedScenario.title}
              </h3>
              <div className="transcript-actions">
                <button type="button" onClick={handleLoadExample} className="secondary-btn">
                  Load example transcript
                </button>
                <button type="button" onClick={handleRunDetection} disabled={loadingDetect} className="primary-btn">
                  {loadingDetect ? 'Running detection…' : 'Run AI Detection'}
                </button>
              </div>
            </div>

            <div className="transcript-simulator">
              <ul>
                {transcript.map((message, index) => (
                  <li key={`${message.speaker}-${index}`} className={`message message--${message.speaker}`}>
                    <header>
                      <strong>{message.speaker}</strong>
                      <span>{formatTimestamp(message.timestamp)}</span>
                      {message.language && <span className="language-chip">{message.language}</span>}
                    </header>
                    <textarea
                      value={message.text}
                      onChange={(event) => handleEditMessage(index, 'text', event.target.value)}
                    />
                  </li>
                ))}
              </ul>
              <form className="message-form" onSubmit={handleAddMessage}>
                <select name="speaker">
                  {selectedScenario.participants.map((participant) => (
                    <option key={participant} value={participant}>
                      {participant}
                    </option>
                  ))}
                </select>
                <input name="language" placeholder="Language (en, es, …)" />
                <input name="text" placeholder="Add message" />
                <button type="submit" className="primary-btn">
                  Add
                </button>
              </form>
            </div>

            <div className="detection-panel">
              <h3>Detected SDOH issues</h3>
              {!detection && <p className="panel-placeholder">Run detection to see Z-code insights.</p>}
              {detection && (
                <div className="detection-results">
                  <div className="issue-chips">
                    {detection.issues.length === 0 ? (
                      <span className="chip chip--neutral">No active risks detected</span>
                    ) : (
                      detection.issues.map((issue) => (
                        <span key={issue.code} className="chip">
                          {issue.code} • {issue.label}
                        </span>
                      ))
                    )}
                  </div>
                  {detection.issues.length > 0 && (
                    <table>
                      <thead>
                        <tr>
                          <th>Issue</th>
                          <th>Confidence</th>
                          <th>Severity</th>
                          <th>Urgency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detection.issues.map((issue) => (
                          <tr key={`${issue.code}-${issue.rationale}`}>
                            <td>{issue.label}</td>
                            <td>{Math.round(issue.confidence * 100)}%</td>
                            <td className={`severity severity--${issue.severity}`}>{issue.severity}</td>
                            <td className={`urgency urgency--${issue.urgency}`}>{issue.urgency}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleSendEmail}
                    disabled={sendingEmail || !detection}
                  >
                    {sendingEmail ? 'Sending…' : '📧 Send Summary Email'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <aside className="scenario-sidebar">
            <section>
              <h4>Narrative summary</h4>
              <p>{detection?.documentation?.narrative ?? 'Narrative will appear after detection runs.'}</p>
            </section>
            <section>
              <h4>Compliance & alerts</h4>
              {detection?.compliance ? (
                <ul>
                  <li>
                    Completion rate:{' '}
                    <strong>{Math.round((detection.compliance.completionRate ?? 0) * 100)}%</strong>
                  </li>
                  <li>Needs screening: {detection.compliance.needsScreening ? 'Yes' : 'No'}</li>
                  {detection.compliance.alerts?.map((alert, index) => (
                    <li key={index} className={`alert alert--${alert.severity}`}>
                      {alert.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="panel-placeholder">Compliance metrics will surface after detection.</p>
              )}
            </section>
            <section>
              <h4>Revenue insights</h4>
              {detection?.revenue ? (
                <ul>
                  <li>
                    Potential revenue:{' '}
                    <strong>${(detection.revenue.potentialRevenue ?? 0).toLocaleString()}</strong>
                  </li>
                  <li>Z-codes generated: {detection.revenue.zCodesGenerated ?? 0}</li>
                  <li>
                    Accuracy estimate: {Math.round((detection.revenue.accuracyEstimate ?? 0) * 100)}%
                  </li>
                </ul>
              ) : (
                <p className="panel-placeholder">Run detection to quantify revenue impact.</p>
              )}
            </section>
            <section>
              <h4>Languages detected</h4>
              <div className="language-pills">
                {(detection?.documentation?.structured?.languages ?? transcript
                  .map((message) => message.language)
                  .filter(Boolean))
                  .filter((value, index, array) => value && array.indexOf(value) === index)
                  .map((language) => (
                    <span key={language} className="chip chip--neutral">
                      {language}
                    </span>
                  ))}
                {(!detection || detection.documentation?.structured?.languages?.length === 0) && (
                  <span className="chip chip--neutral">en</span>
                )}
              </div>
            </section>
          </aside>
        </section>
      )}

      <section className="analytics-section">
        <h3>Program analytics</h3>
        <div className="analytics-grid">
          <div className="analytics-card">
            <h4>Detected issues by frequency</h4>
            <ul className="analytics-bars">
              {analytics.issueFrequency.length === 0 && (
                <li className="panel-placeholder">No detections recorded in this window.</li>
              )}
              {analytics.issueFrequency.map((item) => (
                <li key={item.name}>
                  <div className="analytics-bars__label">
                    <span>{item.name}</span>
                    <span>{item.count}</span>
                  </div>
                  <div className="analytics-bars__meter">
                    <span style={{ width: `${Math.min(item.count * 12, 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="analytics-card">
            <h4>Average confidence per scenario</h4>
            <ul className="analytics-bars">
              {analytics.averageConfidence.length === 0 && (
                <li className="panel-placeholder">Run detections to measure accuracy.</li>
              )}
              {analytics.averageConfidence.map((item) => (
                <li key={item.name}>
                  <div className="analytics-bars__label">
                    <span>{item.name}</span>
                    <span>{Math.round(item.value * 100)}%</span>
                  </div>
                  <div className="analytics-bars__meter analytics-bars__meter--teal">
                    <span style={{ width: `${Math.round(item.value * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="analytics-card">
            <h4>Compliance rate trend</h4>
            <ul className="compliance-trend">
              {analytics.complianceTrend.length === 0 && (
                <li className="panel-placeholder">Compliance signals will appear after detections.</li>
              )}
              {analytics.complianceTrend.map((item) => (
                <li key={item.period}>
                  <div className="compliance-trend__meta">
                    <span>{item.period}</span>
                    <span>{item.completion}%</span>
                  </div>
                  <div className="compliance-trend__meter">
                    <span style={{ width: `${Math.min(item.completion, 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="recent-detections">
        <div className="recent-header">
          <h3>Recent detections</h3>
          <span>{filteredRecentDetections.length} results</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Scenario</th>
              <th>Issues</th>
              <th>Confidence</th>
              <th>Compliance</th>
              <th>Recorded</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecentDetections.length === 0 && (
              <tr>
                <td colSpan={6} className="panel-placeholder">
                  Run a detection to populate the timeline.
                </td>
              </tr>
            )}
            {filteredRecentDetections.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.memberName ?? row.memberId}</strong>
                  <span className="table-subtitle">{row.memberId}</span>
                </td>
                <td>{row.scenarioName}</td>
                <td>
                  {row.issues.length === 0
                    ? 'No risks'
                    : row.issues.map((issue) => issue.code).join(', ')}
                </td>
                <td>
                  {row.issues.length
                    ? `${Math.round(
                        (row.issues.reduce((sum, issue) => sum + issue.confidence, 0) / row.issues.length) * 100,
                      )}%`
                    : '—'}
                </td>
                <td>
                  {typeof row.compliance?.completionRate === 'number'
                    ? `${Math.round(row.compliance.completionRate * 100)}%`
                    : '—'}
                </td>
                <td>{formatTimestamp(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {toast && <div className={`toast toast--${toast.tone}`}>{toast.message}</div>}
    </div>
  );
}
