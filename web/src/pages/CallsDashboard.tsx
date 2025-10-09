import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  api,
  type CallSummary,
  type CallDetail,
  type CallDetectionRecord,
  type DetectionResponse,
} from '../api';
import { transcriptSamples } from '../data/transcripts';

const MEMBER_ID = 'demo-member';
const DEFAULT_TO_NUMBER = '+15555551212';
const DEFAULT_FROM_NUMBER = '+18005550100';

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

function normalizeStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function convertStoredDetection(record?: CallDetectionRecord | null): DetectionResponse | null {
  if (!record) return null;
  const structuredIssues = (record.issues ?? []).map((issue) => ({
    code: issue.code,
    label: issue.label,
    severity: issue.severity,
    urgency: issue.urgency,
    status: (issue.status as 'current' | 'resolved' | 'historical') || 'current',
    confidence: issue.confidence ?? 0,
    evidenceCount: issue.evidence?.length ?? 0,
  }));

  const fallbackDocumentation = {
    structured: {
      detectedAt: record.createdAt,
      issues: structuredIssues,
      languages: [],
    },
    narrative: record.narrative ?? '',
    recommendedCodes: [],
    evidence: record.issues?.flatMap((issue) => issue.evidence ?? []) ?? [],
  } as DetectionResponse['documentation'];

  const fallbackRevenue = {
    potentialRevenue: 0,
    zCodesGenerated: 0,
    patientsScreened: 0,
    patientsRequired: 0,
    riskAdjustmentImpact: 0,
    prevalenceTrends: [],
    accuracyEstimate: 0,
    latencyEstimateMs: 0,
  } satisfies DetectionResponse['revenue'];

  const fallbackCompliance = {
    needsScreening: false,
    nextDueDate: record.createdAt,
    completionRate: 0,
    cmsReport: [],
    alerts: [],
  } satisfies DetectionResponse['compliance'];

  return {
    engine: (record.engine as DetectionResponse['engine']) || 'gpt-orchestrator',
    issues: record.issues ?? [],
    documentation: (record.documentation as DetectionResponse['documentation']) ?? fallbackDocumentation,
    revenue: (record.revenue as DetectionResponse['revenue']) ?? fallbackRevenue,
    compliance: (record.compliance as DetectionResponse['compliance']) ?? fallbackCompliance,
    debug: record.engine ? { fallbackUsed: false, model: record.engine } : undefined,
  };
}

export default function CallsDashboard() {
  const [callList, setCallList] = useState<CallSummary[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<CallDetail | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [callForm, setCallForm] = useState({
    to: DEFAULT_TO_NUMBER,
    from: DEFAULT_FROM_NUMBER,
    sampleId: transcriptSamples[0]?.id ?? '',
  });
  const [callSubmitting, setCallSubmitting] = useState(false);
  const [callSuccess, setCallSuccess] = useState<string | null>(null);
  const [callSubmitError, setCallSubmitError] = useState<string | null>(null);

  const [activeDetection, setActiveDetection] = useState<DetectionResponse | null>(null);
  const [detectionLoading, setDetectionLoading] = useState(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);

  const [summaryRecipients, setSummaryRecipients] = useState('careteam@example.com');
  const [summaryIntro, setSummaryIntro] = useState('');
  const [summaryStatus, setSummaryStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [summaryError, setSummaryError] = useState<string | null>(null);

  async function loadCalls(options?: { focusId?: string }) {
    setListLoading(true);
    setListError(null);
    try {
      const data = await api.listCalls();
      setCallList(data.calls);
      if (options?.focusId) {
        await loadCallDetail(options.focusId);
      } else if (!selectedCallId && data.calls[0]) {
        await loadCallDetail(data.calls[0].id);
      } else if (selectedCallId) {
        const exists = data.calls.some((call) => call.id === selectedCallId);
        if (!exists && data.calls[0]) {
          await loadCallDetail(data.calls[0].id);
        }
      }
    } catch (error) {
      console.error(error);
      setListError('Unable to load call history.');
    } finally {
      setListLoading(false);
    }
  }

  async function loadCallDetail(id: string) {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const detail = await api.getCall(id);
      setSelectedCallId(id);
      setSelectedCall(detail);
      setActiveDetection(null);
    } catch (error) {
      console.error(error);
      setDetailError('Unable to load call detail.');
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadCalls().catch((err) => console.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detectionToDisplay = useMemo(() => {
    if (activeDetection) return activeDetection;
    return convertStoredDetection(selectedCall?.detections?.[0]);
  }, [activeDetection, selectedCall]);

  async function handleCreateCall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!callForm.sampleId) {
      setCallSubmitError('Select a transcript sample to simulate transcription.');
      return;
    }
    const sample = transcriptSamples.find((item) => item.id === callForm.sampleId);
    if (!sample) {
      setCallSubmitError('Transcript sample not found.');
      return;
    }

    setCallSubmitting(true);
    setCallSubmitError(null);
    setCallSuccess(null);
    try {
      const response = await api.createCall({
        memberId: MEMBER_ID,
        to: callForm.to,
        from: callForm.from || undefined,
        direction: 'outbound',
        metadata: { sampleId: sample.id, sampleTitle: sample.title },
        transcript: sample.transcript,
      });

      if (!response.call?.id) {
        throw new Error('Call creation failed');
      }

      setCallSuccess(`Call ${response.call.id} logged with ${sample.transcript.length} transcript messages.`);
      setSummaryStatus('idle');
      await loadCalls({ focusId: response.call.id });
    } catch (error) {
      console.error(error);
      setCallSubmitError('Unable to start the call. Check configuration and try again.');
    } finally {
      setCallSubmitting(false);
    }
  }

  async function handleRunDetection() {
    if (!selectedCall) return;
    setDetectionLoading(true);
    setDetectionError(null);
    try {
      const { detectionId, detection } = await api.runCallDetection(selectedCall.call.id);
      const newRecord: CallDetectionRecord = {
        id: detectionId,
        engine: detection.engine,
        issues: detection.issues,
        documentation: detection.documentation,
        revenue: detection.revenue,
        compliance: detection.compliance,
        narrative: detection.documentation?.narrative ?? null,
        createdAt: new Date().toISOString(),
      };
      setSelectedCall((prev) =>
        prev
          ? {
              ...prev,
              detections: [newRecord, ...prev.detections],
            }
          : prev
      );
      await loadCalls({ focusId: selectedCall.call.id });
      setActiveDetection(detection);
    } catch (error) {
      console.error(error);
      setDetectionError('AI detection failed. Try again later.');
    } finally {
      setDetectionLoading(false);
    }
  }

  async function handleSendSummary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCall) return;
    const recipients = summaryRecipients
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean);
    if (!recipients.length) {
      setSummaryError('Add at least one recipient.');
      return;
    }
    setSummaryStatus('sending');
    setSummaryError(null);
    try {
      const detectionId = selectedCall.detections[0]?.id;
      await api.sendCallSummary(selectedCall.call.id, {
        to: recipients,
        detectionId,
        intro: summaryIntro || undefined,
      });
      setSummaryStatus('sent');
    } catch (error) {
      console.error(error);
      setSummaryError('Unable to send summary email.');
      setSummaryStatus('error');
    }
  }

  function renderIssues() {
    if (!detectionToDisplay?.issues?.length) {
      return <p className="call-empty">No active issues detected.</p>;
    }
    return (
      <div className="call-issues">
        {detectionToDisplay.issues.map((issue, index) => (
          <div key={`${issue.code}-${index}`} className="call-issue-card">
            <div className="call-issue-card__header">
              <span className="call-issue-card__code">{issue.code}</span>
              <span className="call-issue-card__label">{issue.label}</span>
            </div>
            <div className="call-issue-card__meta">
              <span>Severity: {issue.severity}</span>
              <span>Urgency: {issue.urgency}</span>
              <span>Confidence: {(issue.confidence * 100).toFixed(1)}%</span>
            </div>
            {issue.rationale ? <p className="call-issue-card__rationale">{issue.rationale}</p> : null}
            {issue.evidence?.length ? (
              <ul className="call-issue-card__evidence">
                {issue.evidence.map((ev, evidenceIndex) => (
                  <li key={`${issue.code}-evidence-${evidenceIndex}`}>
                    <strong>{ev.speaker}:</strong> {ev.quote}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="calls-page">
      <header className="calls-page__header">
        <div>
          <h1>Care Coordination Calls</h1>
          <p>Launch patient outreach, capture live transcripts, and orchestrate AI detection in one workflow.</p>
        </div>
        <button className="btn btn--glass" type="button" onClick={() => loadCalls()} disabled={listLoading}>
          Refresh
        </button>
      </header>

      <section className="call-create">
        <div className="call-create__content">
          <h2>📞 Call Patient</h2>
          <p>
            Start a Twilio-powered call and log the transcript. For this demo environment we seed the transcript from curated call
            samples.
          </p>
          <form className="call-create__form" onSubmit={handleCreateCall}>
            <label>
              Patient number
              <input
                type="tel"
                value={callForm.to}
                onChange={(event) => setCallForm((prev) => ({ ...prev, to: event.target.value }))}
                required
              />
            </label>
            <label>
              Navigator caller ID
              <input
                type="tel"
                value={callForm.from}
                onChange={(event) => setCallForm((prev) => ({ ...prev, from: event.target.value }))}
                required
              />
            </label>
            <label>
              Transcript sample
              <select
                value={callForm.sampleId}
                onChange={(event) => setCallForm((prev) => ({ ...prev, sampleId: event.target.value }))}
                required
              >
                {transcriptSamples.map((sample) => (
                  <option key={sample.id} value={sample.id}>
                    {sample.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" type="submit" disabled={callSubmitting}>
              {callSubmitting ? 'Dialing…' : 'Call Patient'}
            </button>
          </form>
          {callSuccess ? <p className="call-success">{callSuccess}</p> : null}
          {callSubmitError ? <p className="call-error">{callSubmitError}</p> : null}
        </div>
        <aside className="call-create__sample">
          <h3>Sample overview</h3>
          <p>
            {transcriptSamples.find((sample) => sample.id === callForm.sampleId)?.summary ||
              'Choose a transcript sample to preview the storyline.'}
          </p>
        </aside>
      </section>

      <section className="calls-layout">
        <div className="calls-list">
          <div className="calls-list__header">
            <h2>Recent calls</h2>
            {listError ? <span className="call-error">{listError}</span> : null}
          </div>
          {listLoading ? (
            <p className="call-empty">Loading call history…</p>
          ) : callList.length === 0 ? (
            <p className="call-empty">No calls logged yet. Start by calling a patient above.</p>
          ) : (
            <ul className="call-list">
              {callList.map((call) => (
                <li
                  key={call.id}
                  className={`call-list__item${call.id === selectedCallId ? ' call-list__item--active' : ''}`}
                  onClick={() => loadCallDetail(call.id)}
                >
                  <div className="call-list__primary">
                    <span className="call-list__name">{call.memberName ?? call.memberId}</span>
                    <span
                      className={`call-status call-status--${call.status
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')}`}
                    >
                      {normalizeStatus(call.status)}
                    </span>
                  </div>
                  <div className="call-list__meta">
                    <span>{formatDateTime(call.startedAt)}</span>
                    <span>{formatDuration(call.durationSeconds)}</span>
                    <span>{call.transcriptMessageCount} msgs</span>
                    {call.lastDetection ? <span>{call.lastDetection.issueCount} issues</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="call-detail">
          {detailLoading ? (
            <p className="call-empty">Loading call detail…</p>
          ) : detailError ? (
            <p className="call-error">{detailError}</p>
          ) : !selectedCall ? (
            <p className="call-empty">Select a call to inspect transcript and detections.</p>
          ) : (
            <>
              <div className="call-detail__header">
                <div>
                  <h2>{selectedCall.call.memberName ?? selectedCall.call.memberId}</h2>
                  <p>
                    {formatDateTime(selectedCall.call.startedAt)} · {normalizeStatus(selectedCall.call.status)} ·{' '}
                    {formatDuration(selectedCall.call.durationSeconds)}
                  </p>
                </div>
                <div className="call-detail__actions">
                  <button className="btn btn--accent" type="button" onClick={handleRunDetection} disabled={detectionLoading}>
                    {detectionLoading ? 'Analyzing…' : 'Run AI Detection'}
                  </button>
                </div>
              </div>

              {detectionError ? <p className="call-error">{detectionError}</p> : null}

              <div className="call-detail__body">
                <div className="call-transcript">
                  <h3>Transcript</h3>
                  {selectedCall.transcript.messages.length === 0 ? (
                    <p className="call-empty">No transcript captured yet.</p>
                  ) : (
                    <ul>
                      {selectedCall.transcript.messages.map((message, index) => (
                        <li key={`${message.timestamp}-${index}`} className={`call-line call-line--${message.speaker}`}>
                          <div className="call-line__meta">
                            <span className="call-line__speaker">{message.speaker}</span>
                            {message.timestamp ? (
                              <span className="call-line__time">{formatDateTime(message.timestamp)}</span>
                            ) : null}
                          </div>
                          <p className="call-line__text">{message.text}</p>
                          {message.language ? (
                            <span className="call-line__language">Language: {message.language.toUpperCase()}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="call-detection">
                  <h3>AI Detection</h3>
                  {renderIssues()}

                  <div className="call-summary">
                    <h4>Send summary email</h4>
                    <form onSubmit={handleSendSummary} className="call-summary__form">
                      <label>
                        Recipients
                        <input
                          type="text"
                          value={summaryRecipients}
                          onChange={(event) => setSummaryRecipients(event.target.value)}
                          placeholder="careteam@example.com"
                        />
                      </label>
                      <label>
                        Intro message (optional)
                        <textarea
                          value={summaryIntro}
                          onChange={(event) => setSummaryIntro(event.target.value)}
                          rows={3}
                          placeholder="Context for the outreach team"
                        />
                      </label>
                      <button className="btn btn--glass" type="submit" disabled={summaryStatus === 'sending'}>
                        {summaryStatus === 'sending' ? 'Sending…' : 'Send summary'}
                      </button>
                    </form>
                    {summaryError ? <p className="call-error">{summaryError}</p> : null}
                    {summaryStatus === 'sent' ? (
                      <p className="call-success">Summary email sent successfully.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
