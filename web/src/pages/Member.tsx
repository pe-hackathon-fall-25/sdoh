import { useMemo, useState } from 'react';
import { api, type DetectionResponse } from '../api';
import { transcriptSamples, type TranscriptMessage } from '../data/transcripts';

type Suggestion = {
  code: string;
  label: string;
  confidence: number;
  severity: string;
  urgency: string;
  rationale: string;
  evidence: TranscriptMessage[];
  estimatedRevenue: number;
};

export default function Member() {
  const memberId = 'demo-member';
  const memberName = 'Alex Rivera';
  const memberDob = 'Mar 14, 1952';
  const primaryCare = 'Greenwood Community Health';

  const [selectedTranscriptId, setSelectedTranscriptId] = useState(transcriptSamples[0]?.id ?? '');
  const activeTranscript = useMemo(
    () => transcriptSamples.find((sample) => sample.id === selectedTranscriptId) ?? transcriptSamples[0],
    [selectedTranscriptId]
  );

  const [analysis, setAnalysis] = useState<DetectionResponse | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [screeningId, setScreeningId] = useState<string | null>(null);
  const [note, setNote] = useState('Emergency pantry delivered 1/9; SNAP recertification interview pending.');
  const [responses, setResponses] = useState({ q1: 'Sometimes true', q2: 'Often true' });
  const [loadingAction, setLoadingAction] = useState<null | 'analyze' | 'save' | 'finalize' | 'pdf'>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFinalized, setIsFinalized] = useState(false);

  const suggestions: Suggestion[] = useMemo(() => {
    if (!analysis) return [];
    return analysis.issues.map((issue) => ({
      code: issue.code,
      label: issue.label,
      confidence: issue.confidence,
      severity: issue.severity,
      urgency: issue.urgency,
      rationale: issue.rationale,
      evidence: issue.evidence.map((ev) => ({
        speaker: ev.speaker,
        text: ev.quote,
        language: ev.language,
        timestamp: ev.timestamp,
      })),
      estimatedRevenue: issue.estimatedRevenue,
    }));
  }, [analysis]);

  const timeline = useMemo(
    () => [
      {
        title: 'Warm handoff to City Pantry',
        date: 'Jan 9, 2025',
        description: 'Confirmed delivery of emergency food box with bilingual dietician follow-up.',
        status: 'completed' as const,
      },
      {
        title: 'Utility relief escalation',
        date: 'Jan 17, 2025',
        description: 'Applied for LIHEAP crisis grant and notified housing stability navigator.',
        status: 'in-progress' as const,
      },
      {
        title: 'Shelter placement review',
        date: 'Jan 18, 2025',
        description: 'Awaiting county response for emergency hotel placement.',
        status: 'in-progress' as const,
      },
    ],
    []
  );

  const statusLabel = isFinalized ? 'Documentation finalized' : analysis ? 'AI review complete' : 'Waiting for AI review';
  const statusClass = isFinalized ? 'status-pill status-pill--finalized' : analysis ? 'status-pill' : 'status-pill status-pill--draft';

  async function analyzeTranscript() {
    if (!activeTranscript) return;
    setError(null);
    setLoadingAction('analyze');
    try {
      const payload = await api.detectTranscript({
        memberId,
        transcript: activeTranscript.transcript,
        context: { requiredScreenings: 24, completedScreenings: 18 },
      });
      setAnalysis(payload);
      setSelectedCodes(payload.issues.map((issue) => issue.code));
      setIsFinalized(false);
    } catch (err) {
      console.error(err);
      setError('The AI engine could not process the transcript. Try again shortly.');
    } finally {
      setLoadingAction(null);
    }
  }

  async function createScreening() {
    setError(null);
    setLoadingAction('save');
    try {
      const res = await api.createScreening({
        memberId,
        domain: 'multi_domain',
        responses,
        note,
      });
      setScreeningId(res.screeningId);
      setIsFinalized(false);
    } catch (err) {
      console.error(err);
      setError('We could not save the screening. Please review and try again.');
    } finally {
      setLoadingAction(null);
    }
  }

  async function finalizeCodes() {
    if (!screeningId) {
      setError('Save the screening before finalizing recommendations.');
      return;
    }
    if (selectedCodes.length === 0) {
      setError('Select at least one recommendation to finalize.');
      return;
    }
    setError(null);
    setLoadingAction('finalize');
    try {
      await api.finalizeZ({
        screeningId,
        acceptedCodes: selectedCodes,
        rationale: 'Validated against AI-detected transcript evidence and navigator documentation.',
      });
      setIsFinalized(true);
    } catch (err) {
      console.error(err);
      setError('Unable to finalize codes right now.');
    } finally {
      setLoadingAction(null);
    }
  }

  async function exportPdf() {
    if (!analysis || selectedCodes.length === 0) {
      setError('Select recommendations and run AI review before exporting evidence.');
      return;
    }
    setError(null);
    setLoadingAction('pdf');
    try {
      const selectedSuggestions = suggestions.filter((suggestion) => selectedCodes.includes(suggestion.code));
      const resp = await api.pdf({
        member: { id: memberId, name: memberName, dob: '1952-03-14' },
        consent: { scope: 'sdoh_evidence', collectedAt: new Date().toISOString() },
        screening: {
          domain: 'multi_domain',
          instrument: 'ConversationAI',
          responses,
          note,
          createdAt: new Date().toISOString(),
        },
        referralTimeline: timeline.map((item) => ({
          orgName: item.title,
          service: 'SDOH Support',
          status: item.status === 'completed' ? 'completed' : 'in_progress',
          occurredAt: new Date(item.date).toISOString(),
          result: item.status === 'completed' ? 'helped' : 'pending',
          note: item.description,
        })),
        zcodes: selectedSuggestions.map((suggestion) => ({
          code: suggestion.code,
          label: suggestion.label,
          confidence: suggestion.confidence,
          rationale: suggestion.rationale,
          citations: suggestion.evidence.map((item) => item.text),
        })),
        packId: crypto.randomUUID(),
        tenant: 'Demo Tenant',
      });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error(err);
      setError('The evidence PDF could not be generated.');
    } finally {
      setLoadingAction(null);
    }
  }

  function toggleCode(code: string) {
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]));
  }

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="hero-badge">AI-enabled workspace</span>
        <h1>SDOH Intelligence Command Center</h1>
        <p>
          Streaming voice, SMS, and email conversations are analyzed in real time to surface Z-code opportunities,
          produce billing-ready documentation, and quantify revenue impact.
        </p>
        <div className="hero-meta">
          <div className="hero-meta__item">
            <strong>{memberName}</strong>
            <span>Member #{memberId}</span>
          </div>
          <div className="hero-meta__item">
            <strong>{memberDob}</strong>
            <span>DOB</span>
          </div>
          <div className="hero-meta__item">
            <strong>{primaryCare}</strong>
            <span>Care team</span>
          </div>
          <div className="hero-meta__item">
            <strong>{analysis?.documentation.structured.languages.join(', ') ?? '—'}</strong>
            <span>Languages detected</span>
          </div>
        </div>
        <div className="hero-actions">
          <span className={statusClass}>{statusLabel}</span>
          <div className="hero-actions__buttons">
            <button className="btn btn--glass" onClick={analyzeTranscript} disabled={loadingAction === 'analyze'}>
              {loadingAction === 'analyze' ? 'Analyzing…' : 'Run AI detection'}
            </button>
            <button className="btn" onClick={createScreening} disabled={loadingAction === 'save'}>
              {loadingAction === 'save' ? 'Saving…' : 'Save screening'}
            </button>
            <button className="btn btn--accent" onClick={finalizeCodes} disabled={loadingAction === 'finalize'}>
              {loadingAction === 'finalize' ? 'Finalizing…' : 'Finalize codes'}
            </button>
            <button className="btn btn--outline" onClick={exportPdf} disabled={loadingAction === 'pdf'}>
              {loadingAction === 'pdf' ? 'Exporting…' : 'Export evidence pack'}
            </button>
            <button
              type="button"
              className="btn btn--glass"
              onClick={() => {
                window.history.pushState({}, '', '/calls');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
            >
              📞 Call Patient
            </button>
          </div>
        </div>
        {error && <div className="inline-error">{error}</div>}
      </section>

      <section className="grid-two">
        <div className="card transcript-card">
          <header>
            <h2>Conversation feeds</h2>
            <span>Select a real transcript to test the engine.</span>
          </header>
          <div className="transcript-selector">
            {transcriptSamples.map((sample) => (
              <button
                key={sample.id}
                className={`transcript-chip ${sample.id === activeTranscript?.id ? 'is-active' : ''}`}
                onClick={() => setSelectedTranscriptId(sample.id)}
              >
                <strong>{sample.title}</strong>
                <span>{sample.summary}</span>
              </button>
            ))}
          </div>
          <div className="transcript-feed">
            {activeTranscript?.transcript.map((entry, index) => (
              <div key={index} className={`transcript-line transcript-line--${entry.speaker === 'member' ? 'member' : 'team'}`}>
                <div className="transcript-line__meta">
                  <span>{entry.speaker}</span>
                  <span>{entry.language?.toUpperCase()}</span>
                </div>
                <p>{entry.text}</p>
                {entry.timestamp && <time>{new Date(entry.timestamp).toLocaleTimeString()}</time>}
              </div>
            ))}
          </div>
        </div>

        <div className="card ai-results">
          <header>
            <h2>AI detections</h2>
            <span>{analysis ? `${analysis.issues.length} Z-code opportunities detected` : 'Awaiting transcript analysis'}</span>
          </header>
          {analysis ? (
            <div className="ai-results__list">
              {suggestions.map((suggestion) => (
                <label key={suggestion.code} className={`ai-result ${selectedCodes.includes(suggestion.code) ? 'is-selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedCodes.includes(suggestion.code)}
                    onChange={() => toggleCode(suggestion.code)}
                  />
                  <div className="ai-result__body">
                    <div className="ai-result__header">
                      <span className="ai-result__code">{suggestion.code}</span>
                      <span className={`badge badge--${suggestion.severity}`}>{suggestion.severity}</span>
                      <span className={`badge badge--outline badge--${suggestion.urgency}`}>{suggestion.urgency}</span>
                      <span className="badge badge--ghost">{Math.round(suggestion.confidence * 100)}% confidence</span>
                    </div>
                    <h3>{suggestion.label}</h3>
                    <p>{suggestion.rationale}</p>
                    <div className="ai-result__evidence">
                      {suggestion.evidence.map((item, idx) => (
                        <blockquote key={idx}>
                          <span>{item.speaker}</span>
                          <p>“{item.text}”</p>
                        </blockquote>
                      ))}
                    </div>
                    <footer>
                      <span>Estimated revenue: ${suggestion.estimatedRevenue.toFixed(0)}</span>
                    </footer>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div className="placeholder">Run the AI engine to populate detections.</div>
          )}
        </div>
      </section>

      <section className="grid-two">
        <div className="card documentation-card">
          <header>
            <h2>Clinical documentation</h2>
            <span>Structured summaries ready for EHR import and billing compliance.</span>
          </header>
          {analysis ? (
            <>
              <div className="documentation-grid">
                <div>
                  <h3>Structured screening</h3>
                  <ul>
                    {analysis.documentation.structured.issues.map((issue) => (
                      <li key={issue.code}>
                        <strong>{issue.code}</strong>
                        <span>{issue.label}</span>
                        <span>{issue.status} · {issue.severity} severity</span>
                        <span>{Math.round(issue.confidence * 100)}% confidence</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Clinical narrative</h3>
                  <p>{analysis.documentation.narrative}</p>
                </div>
              </div>
              <div className="evidence-table">
                <h3>Evidence snippets</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Speaker</th>
                      <th>Quote</th>
                      <th>Language</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.documentation.evidence.map((item, index) => (
                      <tr key={index}>
                        <td>{item.speaker}</td>
                        <td>“{item.quote}”</td>
                        <td>{item.language?.toUpperCase() ?? 'EN'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="placeholder">Run detection to generate structured documentation.</div>
          )}
        </div>

        <div className="card revenue-card">
          <header>
            <h2>Revenue impact dashboard</h2>
            <span>Quantifies reimbursement opportunities unlocked this month.</span>
          </header>
          {analysis ? (
            <div className="revenue-grid">
              <div className="metric">
                <span>Potential revenue identified</span>
                <strong>${analysis.revenue.potentialRevenue.toLocaleString()}</strong>
              </div>
              <div className="metric">
                <span>Z-codes generated this review</span>
                <strong>{analysis.revenue.zCodesGenerated}</strong>
              </div>
              <div className="metric">
                <span>Patients screened for SDOH</span>
                <strong>
                  {analysis.revenue.patientsScreened} / {analysis.revenue.patientsRequired}
                </strong>
              </div>
              <div className="metric">
                <span>Risk adjustment impact</span>
                <strong>${analysis.revenue.riskAdjustmentImpact.toLocaleString()}</strong>
              </div>
              <div className="trend-list">
                <h3>Trending domains</h3>
                <ul>
                  {analysis.revenue.prevalenceTrends.map((trend) => (
                    <li key={trend.code}>
                      <span>{trend.label}</span>
                      <strong>{trend.percent}%</strong>
                      <span className={trend.delta >= 0 ? 'trend-up' : 'trend-down'}>
                        {trend.delta >= 0 ? '+' : ''}
                        {trend.delta}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="metric">
                <span>AI accuracy (last cohort)</span>
                <strong>{Math.round(analysis.revenue.accuracyEstimate * 100)}%</strong>
              </div>
              <div className="metric">
                <span>Average processing latency</span>
                <strong>{(analysis.revenue.latencyEstimateMs / 1000).toFixed(1)}s</strong>
              </div>
            </div>
          ) : (
            <div className="placeholder">Run detection to populate financial metrics.</div>
          )}
        </div>
      </section>

      <section className="grid-two">
        <div className="card compliance-card">
          <header>
            <h2>Compliance workflow</h2>
            <span>Automated CMS readiness with proactive alerts.</span>
          </header>
          {analysis ? (
            <>
              <div className="compliance-summary">
                <div>
                  <span>Screening need</span>
                  <strong>{analysis.compliance.needsScreening ? 'Due now' : 'Up to date'}</strong>
                </div>
                <div>
                  <span>Next due date</span>
                  <strong>{new Date(analysis.compliance.nextDueDate).toLocaleDateString()}</strong>
                </div>
                <div>
                  <span>Completion rate</span>
                  <strong>{analysis.compliance.completionRate}%</strong>
                </div>
              </div>
              <div className="cms-table">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Completed</th>
                      <th>Pending</th>
                      <th>Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.compliance.cmsReport.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td>{row.completed}</td>
                        <td>{row.pending}</td>
                        <td>{row.overdue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="alert-stack">
                {analysis.compliance.alerts.map((alert, index) => (
                  <div key={index} className={`alert alert--${alert.severity}`}>
                    <strong>{alert.severity.toUpperCase()}</strong>
                    <span>{alert.message}</span>
                  </div>
                ))}
                {analysis.compliance.alerts.length === 0 && <div className="alert alert--info">No alerts at this time.</div>}
              </div>
            </>
          ) : (
            <div className="placeholder">Run detection to update compliance queue.</div>
          )}
        </div>

        <div className="card timeline-card">
          <header>
            <h2>Action timeline</h2>
            <span>Track interventions tied to AI detected needs.</span>
          </header>
          <ol className="timeline">
            {timeline.map((item, index) => (
              <li key={index} className={`timeline__item timeline__item--${item.status}`}>
                <div className="timeline__date">{item.date}</div>
                <div className="timeline__content">
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
