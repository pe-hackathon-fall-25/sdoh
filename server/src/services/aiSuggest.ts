export type Suggestion = { code: string; label: string; confidence: number; citations: string[]; rationale: string };

const MAP: Record<string, Suggestion> = {
  Z59_4: { code: 'Z59.4', label: 'Lack of adequate food and safe drinking water', confidence: 0.87, citations: [], rationale: 'Hunger Vital Sign positive + note mentions missed meals.' },
  Z59_41: { code: 'Z59.41', label: 'Food insecurity', confidence: 0.83, citations: [], rationale: 'Explicit mention of food insecurity or SNAP pending.' }
};

export function suggestZCodes({ note, responses }: { note?: string; responses: Record<string, any>; }): Suggestion[] {
  const out: Suggestion[] = [];
  const text = (note || '').toLowerCase();
  const hv1 = String(responses?.q1 || '').toLowerCase();
  const hv2 = String(responses?.q2 || '').toLowerCase();
  const positive = [hv1, hv2].some(v => ['often true','sometimes true','yes','true'].includes(v));

  if (positive) {
    const s = { ...MAP.Z59_4, citations: ['HVS Q1/Q2 positive'] };
    out.push(s);
  }
  if (/(food insecure|missed meals|empty fridge|snap pending|no money for food)/.test(text)) {
    const s = { ...MAP.Z59_41, citations: ['Note: ' + (note || '').slice(0,120)] };
    out.push(s);
  }
  return out.slice(0,3);
}
