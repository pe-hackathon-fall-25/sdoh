const base = import.meta.env.VITE_API_BASE;
export const api = {
  createScreening: (body: any) => fetch(`${base}/api/screenings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r=>r.json()),
  suggestZ: (screeningId: string) => fetch(`${base}/api/zcodes/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ screeningId }) }).then(r=>r.json()),
  finalizeZ: (body: any) => fetch(`${base}/api/zcodes/finalize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r=>r.json()),
  pdf: (pack: any) => fetch(`${base}/api/evidence/pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pack) }),
};
