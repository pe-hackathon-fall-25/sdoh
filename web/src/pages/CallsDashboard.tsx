import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  api,
  type CallRecord,
  type CallTranscriptMessage,
  type DetectionResponse,
  type VoiceDialResult,
} from '../api';

type ToastTone = 'info' | 'success' | 'error' | 'warning';

type Toast = {
  message: string;
  tone: ToastTone;
};

const DEFAULT_MEMBER_NAME = 'Alex Rivera';
const DEFAULT_PHONE = '+15555551212';
const DEFAULT_EMAIL = 'care-team@example.com';

function formatDateTime(iso?: string | null): string {
  if (!iso) return 'Not captured yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not captured yet';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toString().padStart(2, '0')}s`;
}

function formatStatus(status: string): { label: string; tone: 'completed' | 'in-progress' | 'failed' | 'initiated' } {
  const normalized = status.toLowerCase();
  if (normalized.includes('fail')) return { label: 'Failed', tone: 'failed' };
  if (normalized.includes('progress') || normalized.includes('ongoing')) return { label: 'In progress', tone: 'in-progress' };
  if (normalized.includes('init') || normalized.includes('queue') || normalized.includes('ring')) {
    return { label: 'Dialing', tone: 'initiated' };
  }
  return { label: 'Completed', tone: 'completed' };
}

function uniqueLanguages(messages: CallTranscriptMessage[], analysis?: DetectionResponse | null): string[] {
  if (analysis?.documentation?.structured?.languages?.length) {
    return analysis.documentation.structured.languages;
  }

  const languages = new Set<string>();
  messages.forEach((message) => {
    if (message.language) {
      languages.add(message.language);
    }
  });
  return Array.from(languages);
}

function detectionIssues(analysis?: DetectionResponse | null) {
  return analysis?.issues ?? [];
}

function summarizeDialResult(result: VoiceDialResult): Toast {
  if (result.delivered) {
    return { message: 'Dialing patient via Twilio Voice…', tone: 'info' };
  }
  if (result.error) {
    return { message: result.error, tone: 'error' };
  }
  return { message: 'Twilio credentials missing – running in preview mode.', tone: 'warning' };
}

export default function CallsDashboard() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [dialForm, setDialForm] = useState({ memberName: DEFAULT_MEMBER_NAME, to: DEFAULT_PHONE });
  const [dialing, setDialing] = useState(false);
  const [runningDetectionFor, setRunningDetectionFor] = useState<string | null>(null);
  const [sendingEmailFor, setSendingEmailFor] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const selectedCall = useMemo(
    () => calls.find((call) => call.id === selectedCallId) ?? null,
    [calls, selectedCallId]
  );

  useEffect(() => {
    loadCalls();
  }, []);

  useEffect(() => {
    if (calls.length === 0) {
      setSelectedCallId(null);
      return;
    }
    if (!selectedCallId || !calls.some((call) => call.id === selectedCallId)) {
      setSelectedCallId(calls[0].id);
    }
  }, [calls, selectedCallId]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function loadCalls() {
    try {
      setLoadingList(true);
      const data = await api.listCalls(50);
      setCalls(data.calls);
    } catch (error) {
      console.error(error);
      setToast({ message: 'Unable to load recent calls.', tone: 'error' });
    } finally {
      setLoadingList(false);
    }
  }

  function handleSelectCall(callId: string) {
    setSelectedCallId(callId);
  }

  async function handleDial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialForm.to.trim()) {
      setToast({ message: 'Enter a destination phone number in E.164 format.', tone: 'error' });
      return;
    }

    setDialing(true);
    try {
      const response = await api.initiateCall({
        to: dialForm.to.trim(),
        memberName: dialForm.memberName.trim() || undefined,
      });
      setCalls((previous) => [response.call, ...previous.filter((call) => call.id !== response.call.id)]);
      setSelectedCallId(response.call.id);
      setToast(summarizeDialResult(response.dial));
    } catch (error) {
      console.error(error);
      setToast({ message: 'Unable to initiate the call. Check Twilio configuration.', tone: 'error' });
    } finally {
      setDialing(false);
    }
  }

  async function handleRunDetection(callId: string) {
    setRunningDetectionFor(callId);
    try {
      const response = await api.runCallDetection(callId);
      setCalls((previous) => previous.map((call) => (call.id === response.call.id ? response.call : call)));
      setToast({ message: 'AI detection complete. Review insights below.', tone: 'success' });
    } catch (error) {
      console.error(error);
      setToast({ message: 'AI detection failed. Try again in a moment.', tone: 'error' });
    } finally {
      setRunningDetectionFor(null);
    }
  }

  async function handleSendSummary(callId: string) {
    const call = calls.find((item) => item.id === callId);
    if (!call?.analysis) {
      setToast({ message: 'Run AI detection before sending a summary email.', tone: 'warning' });
      return;
    }

    const input = window.prompt('Send summary to (comma separated emails)', DEFAULT_EMAIL);
    if (!input) return;
    const recipients = input
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!recipients.length) {
      setToast({ message: 'Provide at least one valid email.', tone: 'error' });
      return;
    }

    setSendingEmailFor(callId);
    try {
      const response = await api.sendCallSummary(callId, { to: recipients });
      setCalls((previous) => previous.map((item) => (item.id === response.call.id ? response.call : item)));
      setToast({ message: 'Summary email dispatched.', tone: 'success' });
    } catch (error) {
      console.error(error);
      setToast({ message: 'Unable to send summary email via SendGrid.', tone: 'error' });
    } finally {
      setSendingEmailFor(null);
    }
  }

  return (
    <div className="calls-shell">
      <section className="calls-header">
        <div>
          <p className="calls-subtitle">Care coordination calls</p>
          <h1>Voice outreach with live transcription</h1>
          <p className="calls-description">
            Launch HIPAA-ready outreach, capture Twilio media streams, and pipe the transcript directly into AI review.
            Follow-up actions, compliance, and SendGrid summaries stay one click away.
          </p>
        </div>
        <form className="dial-form" onSubmit={handleDial}>
          <label>
            <span>Member name</span>
            <input
              value={dialForm.memberName}
              onChange={(event) => setDialForm((current) => ({ ...current, memberName: event.target.value }))}
              placeholder="Patient name"
            />
          </label>
          <label>
            <span>Phone number</span>
            <input
              value={dialForm.to}
              onChange={(event) => setDialForm((current) => ({ ...current, to: event.target.value }))}
              placeholder="+15551234567"
            />
          </label>
          <button type="submit" className="primary-btn" disabled={dialing}>
            {dialing ? 'Dialing…' : '📞 Call Patient'}
          </button>
        </form>
      </section>

      <section className="calls-body">
        <aside className="calls-list">
          <header>
            <div>
              <h2>Recent calls</h2>
              <p>{loadingList ? 'Syncing Twilio logs…' : `${calls.length} call${calls.length === 1 ? '' : 's'} tracked`}</p>
            </div>
            <button type="button" className="secondary-btn" onClick={loadCalls} disabled={loadingList}>
              {loadingList ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </header>
          <ul>
            {calls.map((call) => {
              const status = formatStatus(call.status || 'completed');
              const issueCount = detectionIssues(call.analysis).length;
              return (
                <li key={call.id}>
                  <button
                    type="button"
                    className={`call-card${call.id === selectedCallId ? ' call-card--active' : ''}`}
                    onClick={() => handleSelectCall(call.id)}
                  >
                    <div className={`call-status call-status--${status.tone}`}>{status.label}</div>
                    <strong>{call.memberName || 'Unassigned member'}</strong>
                    <span className="call-card__time">{formatDateTime(call.startedAt || call.createdAt)}</span>
                    <div className="call-card__meta">
                      <span>{formatDuration(call.durationSeconds)}</span>
                      <span>{issueCount} issue{issueCount === 1 ? '' : 's'}</span>
                    </div>
                  </button>
                </li>
              );
            })}
            {!loadingList && calls.length === 0 && <li className="call-empty">No calls yet. Start with “Call Patient”.</li>}
          </ul>
        </aside>

        <section className="call-viewer">
          {!selectedCall && (
            <div className="call-placeholder">
              <h2>Select a call to inspect its transcript</h2>
              <p>New Twilio sessions will populate here as soon as transcripts post back to the webhook.</p>
            </div>
          )}

          {selectedCall && (
            <>
              <div className="call-overview">
                <div>
                  <h2>{selectedCall.memberName || 'Unassigned member'}</h2>
                  <p>
                    {selectedCall.direction === 'inbound' ? 'Inbound call' : 'Outbound call'} •{' '}
                    {formatDateTime(selectedCall.startedAt || selectedCall.createdAt)} • Duration {formatDuration(selectedCall.durationSeconds)}
                  </p>
                </div>
                <div className="call-overview__actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => handleRunDetection(selectedCall.id)}
                    disabled={runningDetectionFor === selectedCall.id}
                  >
                    {runningDetectionFor === selectedCall.id ? 'Analyzing…' : 'Run AI Detection'}
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => handleSendSummary(selectedCall.id)}
                    disabled={sendingEmailFor === selectedCall.id || !selectedCall.analysis}
                  >
                    {sendingEmailFor === selectedCall.id ? 'Sending…' : '📧 Send Summary Email'}
                  </button>
                </div>
              </div>

              <div className="call-meta">
                <div>
                  <span className="call-meta__label">Call SID</span>
                  <strong>{selectedCall.callSid || 'Pending'}</strong>
                </div>
                <div>
                  <span className="call-meta__label">From</span>
                  <strong>{selectedCall.fromNumber || '—'}</strong>
                </div>
                <div>
                  <span className="call-meta__label">To</span>
                  <strong>{selectedCall.toNumber || '—'}</strong>
                </div>
                <div>
                  <span className="call-meta__label">Transcript updated</span>
                  <strong>{formatDateTime(selectedCall.updatedAt)}</strong>
                </div>
                <div>
                  <span className="call-meta__label">AI reviewed</span>
                  <strong>{selectedCall.analysisRunAt ? formatDateTime(selectedCall.analysisRunAt) : 'Not yet run'}</strong>
                </div>
              </div>

              <div className="call-panels">
                <div className="call-transcript">
                  <div className="call-panel__header">
                    <h3>Transcript</h3>
                    <span>{selectedCall.transcript.length} turn{selectedCall.transcript.length === 1 ? '' : 's'}</span>
                  </div>
                  {selectedCall.transcript.length === 0 && (
                    <p className="panel-placeholder">
                      Waiting for Twilio media stream to close the call. We store patient & navigator sides together when the call
                      ends.
                    </p>
                  )}
                  {selectedCall.transcript.length > 0 && (
                    <ul className="call-transcript__list">
                      {selectedCall.transcript.map((message, index) => (
                        <li key={`${message.speaker}-${index}`} className={`call-message call-message--${message.speaker}`}>
                          <header>
                            <strong>{message.speaker}</strong>
                            {message.timestamp && <span>{new Date(message.timestamp).toLocaleTimeString()}</span>}
                            {message.language && <span className="language-chip">{message.language}</span>}
                          </header>
                          <p>{message.text}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="call-detection">
                  <div className="call-panel__header">
                    <h3>AI detection</h3>
                    <span>
                      {selectedCall.analysis
                        ? `${detectionIssues(selectedCall.analysis).length} issues detected`
                        : 'Pending'}
                    </span>
                  </div>
                  {!selectedCall.analysis && (
                    <p className="panel-placeholder">Run detection to surface Z-codes, compliance flags, and revenue impacts.</p>
                  )}
                  {selectedCall.analysis && (
                    <div className="call-detection__body">
                      <div className="issue-chips">
                        {detectionIssues(selectedCall.analysis).length === 0 ? (
                          <span className="chip chip--neutral">No active risks detected</span>
                        ) : (
                          detectionIssues(selectedCall.analysis).map((issue) => (
                            <span key={issue.code} className="chip">
                              {issue.code} • {issue.label}
                            </span>
                          ))
                        )}
                      </div>

                      {detectionIssues(selectedCall.analysis).length > 0 && (
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
                            {detectionIssues(selectedCall.analysis).map((issue) => (
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

                      <section>
                        <h4>Narrative summary</h4>
                        <p>{selectedCall.analysis.documentation?.narrative ?? 'Narrative will appear after detection.'}</p>
                      </section>

                      <section>
                        <h4>Compliance</h4>
                        {selectedCall.analysis.compliance ? (
                          <ul>
                            <li>
                              Completion rate:{' '}
                              <strong>{selectedCall.analysis.compliance.completionRate}%</strong>
                            </li>
                            <li>
                              Next due:{' '}
                              {selectedCall.analysis.compliance.nextDueDate
                                ? formatDateTime(selectedCall.analysis.compliance.nextDueDate)
                                : '—'}
                            </li>
                            {selectedCall.analysis.compliance.alerts?.map((alert, index) => (
                              <li key={`${alert.message}-${index}`} className={`alert alert--${alert.severity}`}>
                                {alert.message}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="panel-placeholder">Compliance metrics will populate after detection.</p>
                        )}
                      </section>

                      <section>
                        <h4>Revenue</h4>
                        {selectedCall.analysis.revenue ? (
                          <ul>
                            <li>
                              Potential revenue:{' '}
                              <strong>${selectedCall.analysis.revenue.potentialRevenue.toLocaleString()}</strong>
                            </li>
                            <li>Z-codes generated: {selectedCall.analysis.revenue.zCodesGenerated}</li>
                            <li>
                              Accuracy estimate:{' '}
                              {Math.round((selectedCall.analysis.revenue.accuracyEstimate ?? 0) * 100)}%
                            </li>
                          </ul>
                        ) : (
                          <p className="panel-placeholder">Run detection to surface revenue lift.</p>
                        )}
                      </section>

                      <section>
                        <h4>Languages detected</h4>
                        <div className="language-pills">
                          {uniqueLanguages(selectedCall.transcript, selectedCall.analysis).map((language) => (
                            <span key={language} className="chip chip--neutral">
                              {language}
                            </span>
                          ))}
                          {uniqueLanguages(selectedCall.transcript, selectedCall.analysis).length === 0 && (
                            <span className="chip chip--neutral">en</span>
                          )}
                        </div>
                      </section>
                    </div>
                  )}
                </div>

                <div className="call-summary">
                  <div className="call-panel__header">
                    <h3>SendGrid summary</h3>
                  </div>
                  {selectedCall.summaryEmail ? (
                    <ul>
                      <li>
                        Delivered: <strong>{selectedCall.summaryEmail.delivered ? 'Yes' : 'Preview only'}</strong>
                      </li>
                      <li>Provider: {selectedCall.summaryEmail.provider}</li>
                      <li>Recipients: {Array.isArray(selectedCall.summaryEmail.to) ? selectedCall.summaryEmail.to.join(', ') : '—'}</li>
                      <li>Sent at: {selectedCall.summaryEmail.sentAt ? formatDateTime(selectedCall.summaryEmail.sentAt) : '—'}</li>
                      {selectedCall.summaryEmail.error && <li className="alert alert--warning">{selectedCall.summaryEmail.error}</li>}
                    </ul>
                  ) : (
                    <p className="panel-placeholder">
                      Trigger SendGrid to deliver a structured summary once the AI review completes.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </section>

      {toast && (
        <div className={`calls-toast calls-toast--${toast.tone}`} role="status">
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
