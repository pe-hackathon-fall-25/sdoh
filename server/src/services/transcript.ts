import { z } from 'zod';

export const transcriptMessageSchema = z.object({
  speaker: z.string(),
  text: z.string(),
  language: z.string().optional(),
  timestamp: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  confidence: z.number().optional(),
});

export type TranscriptMessage = z.infer<typeof transcriptMessageSchema>;

export function parseMaybeJson<T = unknown>(value: unknown): T | undefined {
  if (!value) return undefined;
  if (typeof value === 'object') return value as T;
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export function normalizeSpeaker(value?: string, fallback = 'participant'): string {
  if (!value) return fallback;
  const key = value.toLowerCase();
  if (['customer', 'client', 'member', 'patient', 'user', 'caller', 'callee', 'participant'].includes(key)) {
    return 'member';
  }
  if (['agent', 'navigator', 'coach', 'caremanager', 'care_manager', 'staff', 'assistant', 'operator'].includes(key)) {
    return 'navigator';
  }
  if (['system', 'twilio'].includes(key)) {
    return 'system';
  }
  if (['bot', 'ai', 'automation'].includes(key)) {
    return 'assistant';
  }
  return key.replace(/[^a-z0-9_-]+/g, '-');
}

function parseSegments(value: unknown): TranscriptMessage[] {
  const payload = parseMaybeJson(value);
  if (!Array.isArray(payload)) return [];
  return payload
    .map((segment) => {
      if (!segment || typeof segment !== 'object') return null;
      const text = typeof (segment as any).text === 'string' ? (segment as any).text.trim() : undefined;
      if (!text) return null;
      const startRaw = (segment as any).startTime ?? (segment as any).start ?? (segment as any).start_timestamp;
      const endRaw = (segment as any).endTime ?? (segment as any).end ?? (segment as any).end_timestamp;
      const timestamp = (segment as any).timestamp ?? (segment as any).time ?? startRaw;
      const confidenceRaw = (segment as any).confidence;
      const languageRaw = (segment as any).language ?? (segment as any).locale;
      const speakerRaw = (segment as any).speaker ?? (segment as any).participant ?? (segment as any).role;

      const confidence =
        typeof confidenceRaw === 'number'
          ? confidenceRaw
          : typeof confidenceRaw === 'string'
          ? Number.parseFloat(confidenceRaw)
          : undefined;

      const message: TranscriptMessage = {
        speaker: normalizeSpeaker(typeof speakerRaw === 'string' ? speakerRaw : undefined, 'participant'),
        text,
        language: typeof languageRaw === 'string' ? languageRaw : undefined,
        timestamp:
          typeof timestamp === 'number'
            ? new Date(timestamp).toISOString()
            : typeof timestamp === 'string'
            ? timestamp
            : undefined,
        startTime:
          typeof startRaw === 'number'
            ? new Date(startRaw).toISOString()
            : typeof startRaw === 'string'
            ? startRaw
            : undefined,
        endTime:
          typeof endRaw === 'number'
            ? new Date(endRaw).toISOString()
            : typeof endRaw === 'string'
            ? endRaw
            : undefined,
        confidence: Number.isFinite(confidence) ? Number(confidence?.toFixed(3)) : undefined,
      };

      return transcriptMessageSchema.safeParse(message).success ? message : null;
    })
    .filter((item): item is TranscriptMessage => Boolean(item));
}

function parseTranscriptString(value: unknown, speaker: string): TranscriptMessage[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ speaker: normalizeSpeaker(speaker), text: line }));
}

export function coerceMessagesFromPayload(payload: any): TranscriptMessage[] {
  const messages: TranscriptMessage[] = [];

  const segmentCandidates = [payload?.Segments, payload?.segments, payload?.transcriptSegments, payload?.TranscriptSegments];
  segmentCandidates.forEach((candidate) => {
    const parsed = parseSegments(candidate);
    if (parsed.length) {
      messages.push(...parsed);
    }
  });

  const userTranscript =
    payload?.UserTranscript || payload?.userTranscript || payload?.CustomerTranscript || payload?.customerTranscript;
  const agentTranscript =
    payload?.AgentTranscript || payload?.agentTranscript || payload?.AssistantTranscript || payload?.assistantTranscript;
  const genericTranscript = payload?.Transcript || payload?.transcript;

  messages.push(...parseTranscriptString(userTranscript, 'member'));
  messages.push(...parseTranscriptString(agentTranscript, 'navigator'));

  const participant = normalizeSpeaker(payload?.Participant || payload?.participant || 'participant');
  messages.push(...parseTranscriptString(genericTranscript, participant));

  const deduped = new Map<string, TranscriptMessage>();
  messages.forEach((message) => {
    const key = `${message.speaker}::${message.text}::${message.timestamp ?? message.startTime ?? ''}`;
    if (!deduped.has(key)) {
      deduped.set(key, message);
    }
  });

  return Array.from(deduped.values());
}

export function toTranscriptArray(value: unknown): TranscriptMessage[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const candidate = transcriptMessageSchema.safeParse(item);
        return candidate.success ? candidate.data : null;
      })
      .filter((item): item is TranscriptMessage => Boolean(item));
  }
  const parsed = parseMaybeJson<TranscriptMessage[]>(value);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => {
        const candidate = transcriptMessageSchema.safeParse(item);
        return candidate.success ? candidate.data : null;
      })
      .filter((item): item is TranscriptMessage => Boolean(item));
  }
  return [];
}

export function mergeTranscripts(existing: TranscriptMessage[], incoming: TranscriptMessage[]): TranscriptMessage[] {
  if (!incoming.length) return existing;
  const seen = new Set<string>();
  const ordered = [...existing];
  const register = (message: TranscriptMessage) => {
    const key = `${message.speaker}::${message.text}::${message.timestamp ?? message.startTime ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(message);
  };

  existing.forEach((message) => {
    const key = `${message.speaker}::${message.text}::${message.timestamp ?? message.startTime ?? ''}`;
    seen.add(key);
  });

  incoming.forEach((message) => {
    if (!message.text?.trim()) return;
    const normalized: TranscriptMessage = {
      ...message,
      speaker: normalizeSpeaker(message.speaker, 'participant'),
      timestamp: message.timestamp || message.startTime || new Date().toISOString(),
    };
    register(normalized);
  });

  return ordered;
}

