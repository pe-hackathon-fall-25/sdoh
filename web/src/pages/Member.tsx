import { useState } from 'react';
import { api } from '../api';

export default function Member() {
  const [screeningId, setScreeningId] = useState<string | null>(null);
  const [responses, setResponses] = useState({ q1: '', q2: '' });
  const [note, setNote] = useState('Missed meals this week; SNAP pending.');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const memberId = 'demo-member';

  async function createScreening() {
    const res = await api.createScreening({ memberId, domain: 'food_insecurity', responses, note });
    setScreeningId(res.screeningId);
  }
  async function suggest() {
    if (!screeningId) return; const { suggestions } = await api.suggestZ(screeningId); setSuggestions(suggestions);
  }
  async function finalize() {
    if (!screeningId) return; const accepted = suggestions.slice(0,2).map(s=>s.code);
    await api.finalizeZ({ screeningId, acceptedCodes: accepted, rationale: 'HVS positive + notes' });
    alert('Finalized!');
  }
  async function pdf() {
    const resp = await api.pdf({
      member: { id: memberId, name: 'Alex Rivera', dob: '1952-03-14' },
      consent: { scope: 'sdoh_evidence', collectedAt: new Date().toISOString() },
      screening: { domain: 'food_insecurity', instrument: 'HungerVitalSign', responses, note, createdAt: new Date().toISOString() },
      referralTimeline: [{ orgName: 'City Pantry', service: 'Food box', status: 'completed', occurredAt: new Date().toISOString(), result: 'helped', note: 'Received food box' }],
      zcodes: suggestions.slice(0,2), packId: crypto.randomUUID(), tenant: 'Demo Tenant'
    });
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h2>Member — SDOH Intake</h2>
      <label>HVS Q1
        <select value={responses.q1} onChange={e=>setResponses(v=>({...v,q1:e.target.value}))}>
          <option value="">Select</option>
          <option>Often true</option>
          <option>Sometimes true</option>
          <option>Never true</option>
        </select>
      </label>
      <label>HVS Q2
        <select value={responses.q2} onChange={e=>setResponses(v=>({...v,q2:e.target.value}))}>
          <option value="">Select</option>
          <option>Often true</option>
          <option>Sometimes true</option>
          <option>Never true</option>
        </select>
      </label>
      <label>Note
        <textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} />
      </label>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={createScreening}>Save Screening</button>
        <button onClick={suggest} disabled={!screeningId}>Suggest Z-codes</button>
        <button onClick={finalize} disabled={!suggestions.length}>Finalize</button>
        <button onClick={pdf} disabled={!suggestions.length}>Evidence PDF</button>
      </div>

      {suggestions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>Suggestions</h3>
          <ul>
            {suggestions.map((s,i)=> (
              <li key={i}><strong>{s.code}</strong> — {s.label} (conf {Math.round(s.confidence*100)}%)<br/>
                <small>Why: {s.rationale}. Cites: {s.citations?.join(' | ')}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
