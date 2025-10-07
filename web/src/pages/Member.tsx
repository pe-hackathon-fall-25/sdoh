import { useMemo, useState } from 'react';
import { api } from '../api';

type Suggestion = {
  code: string;
  label: string;
  confidence: number;
  rationale: string;
  citations?: string[];
};

type TimelineItem = {
  title: string;
  date: string;
  description: string;
  status: 'completed' | 'in-progress';
};

export default function Member() {
  const memberId = 'demo-member';
  const memberName = 'Alex Rivera';
  const memberDob = 'Mar 14, 1952';
  const primaryCare = 'Greenwood Community Health';

  const [responses, setResponses] = useState({ q1: '', q2: '' });
  const [note, setNote] = useState('Missed meals this week; SNAP renewal pending approval.');
  const [screeningId, setScreeningId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [isFinalized, setIsFinalized] = useState(false);
  const [loadingAction, setLoadingAction] = useState<null | 'save' | 'suggest' | 'finalize' | 'pdf'>(null);
  const [error, setError] = useState<string | null>(null);

  const timeline: TimelineItem[] = useMemo(
    () => [
      {
        title: 'Warm handoff to City Pantry',
        date: 'Jan 9, 2025',
        description: 'Confirmed delivery of emergency food box with follow-up coaching call.',
        status: 'completed',
      },
      {
        title: 'SNAP renewal check-in',
        date: 'Jan 16, 2025',
        description: 'Assisted member with documentation upload and scheduled county interview.',
        status: 'in-progress',
      },
      {
        title: 'Nutrition education series',
        date: 'Feb 3, 2025',
        description: 'Group class enrollment pending confirmation from partner organization.',
        status: 'in-progress',
      },
    ],
    []
  );

  const statusLabel = isFinalized ? 'Finalized plan' : screeningId ? 'Screening saved' : 'Draft in progress';
  const statusClass = isFinalized ? 'status-pill status-pill--finalized' : screeningId ? 'status-pill' : 'status-pill status-pill--draft';

  const selectedSuggestions = useMemo(
    () => suggestions.filter((suggestion) => selectedCodes.includes(suggestion.code)),
    [selectedCodes, suggestions]
  );

  async function createScreening() {
    setError(null);
    setLoadingAction('save');
    try {
      const res = await api.createScreening({
        memberId,
        domain: 'food_insecurity',
        responses,
        note,
      });
      setScreeningId(res.screeningId);
      setIsFinalized(false);
    } catch (err) {
      console.error(err);
      setError('We could not save the screening. Please review the responses and try again.');
    } finally {
      setLoadingAction(null);
    }
  }

  async function suggest() {
    if (!screeningId) {
      setError('Save the screening details before requesting Z-code suggestions.');
      return;
    }
    setError(null);
    setLoadingAction('suggest');
    try {
      const payload = await api.suggestZ(screeningId);
      const nextSuggestions: Suggestion[] = payload?.suggestions ?? [];
      setSuggestions(nextSuggestions);
      setSelectedCodes(nextSuggestions.slice(0, 2).map((item) => item.code));
      setIsFinalized(false);
    } catch (err) {
      console.error(err);
      setError('Unable to fetch AI-assisted Z-code suggestions right now.');
    } finally {
      setLoadingAction(null);
    }
  }

  async function finalize() {
    if (!screeningId) {
      setError('Save the screening before finalizing recommendations.');
      return;
    }
    if (selectedCodes.length === 0) {
      setError('Choose at least one suggestion to finalize.');
      return;
    }
    setError(null);
    setLoadingAction('finalize');
    try {
      await api.finalizeZ({
        screeningId,
        acceptedCodes: selectedCodes,
        rationale: 'Hunger Vital Sign positive with corroborating coaching notes.',
      });
      setIsFinalized(true);
    } catch (err) {
      console.error(err);
      setError('There was an issue finalizing recommendations. Please try again.');
    } finally {
      setLoadingAction(null);
    }
  }

  async function pdf() {
    if (selectedSuggestions.length === 0) {
      setError('Select at least one recommendation to include in the evidence pack.');
      return;
    }
    setError(null);
    setLoadingAction('pdf');
    try {
      const resp = await api.pdf({
        member: { id: memberId, name: memberName, dob: '1952-03-14' },
        consent: { scope: 'sdoh_evidence', collectedAt: new Date().toISOString() },
        screening: {
          domain: 'food_insecurity',
          instrument: 'HungerVitalSign',
          responses,
          note,
          createdAt: new Date().toISOString(),
        },
        referralTimeline: timeline.map((item) => ({
          orgName: item.title,
          service: 'Food access support',
          status: item.status === 'completed' ? 'completed' : 'in_progress',
          occurredAt: new Date(item.date).toISOString(),
          result: item.status === 'completed' ? 'helped' : 'pending',
          note: item.description,
        })),
        zcodes: selectedSuggestions,
        packId: crypto.randomUUID(),
        tenant: 'Demo Tenant',
      });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error(err);
      setError('The evidence PDF could not be generated. Please try again.');
    } finally {
      setLoadingAction(null);
    }
  }

  function toggleSuggestion(code: string) {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]
    );
  }

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="hero-badge">Active Member</span>
        <h1>SDOH Navigator Workspace</h1>
        <p>
          Capture structured screening data, surface AI-backed Z-code recommendations, and produce
          payer-ready evidence packs in minutes.
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
            <strong>Food insecurity</strong>
            <span>Primary domain</span>
          </div>
          <div className="hero-meta__item">
            <strong>{primaryCare}</strong>
            <span>Care team</span>
          </div>
        </div>
      </section>

      <div className="grid-layout">
        <section className="card">
          <div className="card__header">
            <h2 className="card__title">Screening responses</h2>
            <span className={statusClass}>{statusLabel}</span>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="q1">Hunger Vital Sign — Question 1</label>
              <select
                id="q1"
                className="select"
                value={responses.q1}
                onChange={(e) => setResponses((prev) => ({ ...prev, q1: e.target.value }))}
              >
                <option value="">Select a response</option>
                <option>Often true</option>
                <option>Sometimes true</option>
                <option>Never true</option>
              </select>
              <span className="helper-text">How often did food run out before you could afford more?</span>
            </div>

            <div className="field">
              <label htmlFor="q2">Hunger Vital Sign — Question 2</label>
              <select
                id="q2"
                className="select"
                value={responses.q2}
                onChange={(e) => setResponses((prev) => ({ ...prev, q2: e.target.value }))}
              >
                <option value="">Select a response</option>
                <option>Often true</option>
                <option>Sometimes true</option>
                <option>Never true</option>
              </select>
              <span className="helper-text">How often were you worried food would run out?</span>
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="note">Care team notes</label>
              <textarea
                id="note"
                className="textarea"
                value={note}
                rows={4}
                onChange={(e) => setNote(e.target.value)}
              />
              <span className="helper-text">Include context for transportation, benefits, or coaching support.</span>
            </div>
          </div>

          <div className="button-row">
            <button
              className="btn btn--primary"
              onClick={createScreening}
              disabled={loadingAction === 'save'}
            >
              {loadingAction === 'save' ? 'Saving…' : 'Save screening'}
            </button>
            <button
              className="btn btn--ghost"
              onClick={suggest}
              disabled={!screeningId || loadingAction === 'suggest'}
            >
              {loadingAction === 'suggest' ? 'Requesting…' : 'Suggest Z-codes'}
            </button>
            <button
              className="btn btn--success"
              onClick={finalize}
              disabled={selectedCodes.length === 0 || loadingAction === 'finalize'}
            >
              {loadingAction === 'finalize' ? 'Finalizing…' : 'Finalize plan'}
            </button>
            <button
              className="btn btn--outline"
              onClick={pdf}
              disabled={selectedSuggestions.length === 0 || loadingAction === 'pdf'}
            >
              {loadingAction === 'pdf' ? 'Building PDF…' : 'Export evidence pack'}
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}
        </section>

        <aside className="card">
          <div className="card__header">
            <h2 className="card__title">Action timeline</h2>
          </div>
          <ul className="timeline">
            {timeline.map((item, index) => (
              <li key={`${item.title}-${index}`} className="timeline__item">
                <span
                  className={`timeline__dot ${item.status === 'completed' ? 'timeline__dot--success' : ''}`}
                />
                <h3 className="timeline__heading">{item.title}</h3>
                <div className="timeline__meta">{item.date}</div>
                <p className="timeline__description">{item.description}</p>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <section className="card" style={{ marginTop: 32 }}>
        <div className="card__header">
          <h2 className="card__title">AI-assisted Z-code recommendations</h2>
          <span className="helper-text">
            Select the options that best support the member&apos;s documented needs.
          </span>
        </div>

        {suggestions.length === 0 ? (
          <div className="empty-state">
            Capture the screening and request suggestions to populate this space with clinical-grade
            Z-code insights.
          </div>
        ) : (
          <div className="suggestion-list">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.code}
                type="button"
                className={`suggestion ${selectedCodes.includes(suggestion.code) ? 'suggestion--selected' : ''}`}
                onClick={() => toggleSuggestion(suggestion.code)}
              >
                <div className="suggestion__header">
                  <span className="badge badge--code">{suggestion.code}</span>
                  <span className="badge badge--confidence">
                    Confidence {Math.round(suggestion.confidence * 100)}%
                  </span>
                </div>
                <strong>{suggestion.label}</strong>
                <p className="suggestion__rationale">{suggestion.rationale}</p>
                {suggestion.citations?.length ? (
                  <div className="citation-list">
                    {suggestion.citations.map((citation, index) => (
                      <span key={`${suggestion.code}-citation-${index}`}>{citation}</span>
                    ))}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
