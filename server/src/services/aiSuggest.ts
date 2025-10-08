import type { IssueMatch } from './sdohEngine';
import { suggestZCodes as runDetection } from './sdohEngine';

export type Suggestion = { code: string; label: string; confidence: number; citations: string[]; rationale: string };

export function suggestZCodes({ note, responses }: { note?: string; responses: Record<string, any> }): Suggestion[] {
  const matches: IssueMatch[] = runDetection({ note, responses });
  return matches.slice(0, 5).map((match) => ({
    code: match.code,
    label: match.label,
    confidence: match.confidence,
    citations: match.evidence.map((ev) => `${ev.speaker}: ${ev.quote.slice(0, 140)}`),
    rationale: match.rationale,
  }));
}
