import {
  coerceMessagesFromPayload,
  mergeTranscripts,
  normalizeSpeaker,
  type TranscriptMessage,
} from './transcript';

type TranscriptBuffer = {
  messages: TranscriptMessage[];
  updatedAt: number;
};

const transcriptBuffers = new Map<string, TranscriptBuffer>();
const streamToCall = new Map<string, string>();

function ensureBuffer(callSid: string): TranscriptBuffer {
  const existing = transcriptBuffers.get(callSid);
  if (existing) {
    return existing;
  }
  const buffer: TranscriptBuffer = { messages: [], updatedAt: Date.now() };
  transcriptBuffers.set(callSid, buffer);
  return buffer;
}

function extractCallSid(payload: any): string | undefined {
  const direct =
    payload?.callSid ||
    payload?.CallSid ||
    payload?.sid ||
    payload?.Sid ||
    payload?.StartCallSid ||
    payload?.start?.callSid ||
    payload?.start?.CallSid;
  if (typeof direct === 'string' && direct.trim()) {
    if (payload?.streamSid) {
      streamToCall.set(String(payload.streamSid), direct);
    }
    return direct.trim();
  }

  const streamSid = payload?.streamSid || payload?.stream?.sid;
  if (typeof streamSid === 'string' && streamToCall.has(streamSid)) {
    return streamToCall.get(streamSid);
  }
  return undefined;
}

function inferSpeaker(payload: any): string {
  const track = payload?.media?.track || payload?.track || payload?.participant;
  if (typeof track === 'string') {
    const normalized = track.toLowerCase();
    if (normalized.includes('inbound') || normalized.includes('caller')) {
      return 'member';
    }
    if (normalized.includes('outbound') || normalized.includes('agent')) {
      return 'navigator';
    }
  }
  const participant = payload?.speaker || payload?.participant || payload?.role;
  return normalizeSpeaker(typeof participant === 'string' ? participant : undefined, 'participant');
}

function extractText(payload: any): string | undefined {
  const candidates = [
    payload?.text,
    payload?.transcript,
    payload?.speechResult,
    payload?.media?.text,
    payload?.media?.transcript,
    payload?.message,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function bufferTranscript(callSid: string, messages: TranscriptMessage[]): void {
  if (!callSid || !Array.isArray(messages) || !messages.length) return;
  const buffer = ensureBuffer(callSid);
  buffer.messages = mergeTranscripts(buffer.messages, messages);
  buffer.updatedAt = Date.now();
}

export function ingestStreamPayload(payload: any): { callSid?: string; appended: number } {
  const callSid = extractCallSid(payload);
  if (!callSid) {
    return { appended: 0 };
  }

  if (payload?.event === 'stop' && payload?.streamSid) {
    streamToCall.delete(String(payload.streamSid));
  }

  if (payload?.event === 'start') {
    ensureBuffer(callSid);
    return { callSid, appended: 0 };
  }

  const messages = coerceMessagesFromPayload(payload);
  if (messages.length) {
    bufferTranscript(callSid, messages);
    return { callSid, appended: messages.length };
  }

  const text = extractText(payload);
  if (text) {
    bufferTranscript(callSid, [
      {
        speaker: inferSpeaker(payload),
        text,
        timestamp: new Date().toISOString(),
      },
    ]);
    return { callSid, appended: 1 };
  }

  return { callSid, appended: 0 };
}

export function getBufferedTranscript(callSid: string): TranscriptMessage[] {
  const buffer = transcriptBuffers.get(callSid);
  if (!buffer) return [];
  return [...buffer.messages];
}

export function finalizeTranscript(callSid: string): TranscriptMessage[] {
  const transcript = getBufferedTranscript(callSid);
  clearTranscript(callSid);
  return transcript;
}

export function clearTranscript(callSid: string): void {
  transcriptBuffers.delete(callSid);
  for (const [streamSid, mappedCallSid] of streamToCall.entries()) {
    if (mappedCallSid === callSid) {
      streamToCall.delete(streamSid);
    }
  }
}

