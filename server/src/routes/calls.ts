import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { calls } from '../db/schema';
import { db } from '../util/db';
import { env } from '../env';
import { initiateVoiceCall } from '../services/voice';
import { detectConversation, type DetectionResponse } from '../services/sdohEngine';
import { sendEmail } from '../services/notifications';
import { composeDetectionEmailContent } from '../services/emailTemplates';

const r = Router();

const transcriptMessageSchema = z.object({
  speaker: z.string(),
  text: z.string(),
  language: z.string().optional(),
  timestamp: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  confidence: z.number().optional(),
});

type TranscriptMessage = z.infer<typeof transcriptMessageSchema>;

type CallRow = typeof calls.$inferSelect;

function parseMaybeJson<T = unknown>(value: unknown): T | undefined {
  if (!value) return undefined;
  if (typeof value === 'object') return value as T;
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function normalizeSpeaker(value?: string, fallback = 'participant'): string {
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

function coerceMessagesFromPayload(payload: any): TranscriptMessage[] {
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

function mergeMetadata(existing: unknown, incoming: Record<string, unknown> | undefined): Record<string, unknown> | null {
  const base = (existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {}) as Record<string, unknown>;
  if (!incoming) {
    return Object.keys(base).length ? base : null;
  }
  return { ...base, ...incoming };
}

function toTranscriptArray(value: unknown): TranscriptMessage[] {
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

function serializeCall(row: CallRow) {
  const transcript = toTranscriptArray(row.transcript);
  const analysis = (row.analysis as DetectionResponse | null) || null;
  const summaryEmail = (row.summaryEmail as Record<string, unknown> | null) || null;
  const metadata = (row.metadata as Record<string, unknown> | null) || null;

  return {
    id: row.id,
    memberId: row.memberId,
    memberName: row.memberName,
    callSid: row.callSid,
    direction: row.direction ?? 'outbound',
    status: row.status ?? 'initiated',
    toNumber: row.toNumber,
    fromNumber: row.fromNumber,
    startedAt: row.startedAt?.toISOString?.() ?? null,
    endedAt: row.endedAt?.toISOString?.() ?? null,
    durationSeconds: row.durationSeconds ?? null,
    transcript,
    analysis,
    analysisRunAt: row.analysisRunAt?.toISOString?.() ?? null,
    summaryEmail,
    metadata,
    createdBy: row.createdBy,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  };
}

async function getCallOrThrow(id: string): Promise<CallRow> {
  const existing = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  if (!existing.length) {
    const error = new Error('Call not found');
    (error as any).status = 404;
    throw error;
  }
  return existing[0];
}

const initiateCallSchema = z.object({
  to: z.string().min(3),
  from: z.string().min(3).optional(),
  memberId: z.string().uuid().optional(),
  memberName: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

r.post('/outbound', async (req, res, next) => {
  try {
    const body = initiateCallSchema.parse(req.body);
    const now = new Date();

    const dial = await initiateVoiceCall({
      to: body.to,
      from: body.from,
      url: process.env.TWILIO_VOICE_TWIML_URL,
      statusCallback: process.env.TWILIO_CALL_STATUS_CALLBACK_URL,
      record: true,
    });

    const callId = randomUUID();
    await db.insert(calls).values({
      id: callId,
      tenantId: env.TENANT_ID,
      memberId: body.memberId ?? null,
      memberName: body.memberName ?? null,
      callSid: dial.sid,
      direction: 'outbound',
      status: dial.delivered ? dial.status : 'initiated',
      toNumber: body.to,
      fromNumber: body.from ?? process.env.TWILIO_FROM_NUMBER ?? null,
      startedAt: now,
      metadata: mergeMetadata(null, {
        ...body.metadata,
        dialPreview: dial.preview,
      }),
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
    res.json({ call: serializeCall(row), dial });
  } catch (error) {
    next(error);
  }
});

const transcriptWebhookSchema = z
  .object({
    CallSid: z.string().optional(),
    callSid: z.string().optional(),
    Sid: z.string().optional(),
    callStatus: z.string().optional(),
    CallStatus: z.string().optional(),
    Direction: z.string().optional(),
    StartedAt: z.string().optional(),
    startedAt: z.string().optional(),
    EndedAt: z.string().optional(),
    endedAt: z.string().optional(),
    Duration: z.union([z.string(), z.number()]).optional(),
    duration: z.union([z.string(), z.number()]).optional(),
    Metadata: z.any().optional(),
    metadata: z.any().optional(),
  })
  .passthrough();

function coerceStatus(value?: string | null): string {
  if (!value) return 'completed';
  const key = value.toLowerCase();
  if (['completed', 'complete', 'finished'].includes(key)) return 'completed';
  if (['in-progress', 'processing', 'ongoing'].includes(key)) return 'in-progress';
  if (['queued', 'ringing', 'dialing', 'initiated', 'connecting'].includes(key)) return 'initiated';
  if (['failed', 'busy', 'no-answer', 'canceled', 'cancelled'].includes(key)) return 'failed';
  return key;
}

function coerceDuration(value?: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

r.post('/webhook/transcript', async (req, res, next) => {
  try {
    const parsed = transcriptWebhookSchema.parse(req.body ?? {});
    const callSid = parsed.CallSid || parsed.callSid || parsed.Sid;
    if (!callSid) {
      res.status(400).json({ error: 'CallSid missing' });
      return;
    }

    const messages = coerceMessagesFromPayload(req.body ?? {});
    const status = coerceStatus(parsed.CallStatus || parsed.callStatus);
    const metadataPayload =
      parseMaybeJson<Record<string, unknown>>(parsed.Metadata) ||
      parseMaybeJson<Record<string, unknown>>(parsed.metadata) ||
      undefined;

    const startedAt = parsed.StartedAt || parsed.startedAt;
    const endedAt = parsed.EndedAt || parsed.endedAt;
    const durationSeconds = coerceDuration(parsed.Duration ?? parsed.duration);

    const existing = await db.select().from(calls).where(eq(calls.callSid, callSid)).limit(1);
    const now = new Date();

    if (!existing.length) {
      const id = randomUUID();
      await db.insert(calls).values({
        id,
        tenantId: env.TENANT_ID,
        callSid,
        direction: 'inbound',
        status,
        transcript: messages,
        startedAt: startedAt ? new Date(startedAt) : now,
        endedAt: endedAt ? new Date(endedAt) : now,
        durationSeconds: durationSeconds ?? null,
        metadata: mergeMetadata(null, {
          ...metadataPayload,
          webhookReceivedAt: now.toISOString(),
        }),
        createdAt: now,
        updatedAt: now,
      });
      const [row] = await db.select().from(calls).where(eq(calls.callSid, callSid)).limit(1);
      res.json({ ok: true, call: serializeCall(row) });
      return;
    }

    const call = existing[0];
    const nextTranscript = messages.length ? messages : toTranscriptArray(call.transcript);

    const startDate = call.startedAt ?? (startedAt ? new Date(startedAt) : null);
    const endDate = endedAt ? new Date(endedAt) : call.endedAt ?? null;
    const computedDuration =
      durationSeconds ??
      call.durationSeconds ??
      (startDate && endDate ? Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000)) : null);

    const updated = await db
      .update(calls)
      .set({
        transcript: nextTranscript,
        status,
        startedAt: startDate,
        endedAt: endDate,
        durationSeconds: computedDuration,
        metadata: mergeMetadata(call.metadata, {
          ...metadataPayload,
          webhookReceivedAt: now.toISOString(),
        }),
        updatedAt: now,
      })
      .where(eq(calls.id, call.id))
      .returning();

    res.json({ ok: true, call: serializeCall(updated[0]) });
  } catch (error) {
    next(error);
  }
});

r.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const rows = await db
      .select()
      .from(calls)
      .orderBy(desc(calls.startedAt), desc(calls.createdAt))
      .limit(limit);
    res.json({ calls: rows.map(serializeCall) });
  } catch (error) {
    next(error);
  }
});

r.get('/:id', async (req, res, next) => {
  try {
    const row = await getCallOrThrow(req.params.id);
    res.json({ call: serializeCall(row) });
  } catch (error) {
    next(error);
  }
});

r.post('/:id/detect', async (req, res, next) => {
  try {
    const row = await getCallOrThrow(req.params.id);
    const transcript = toTranscriptArray(row.transcript);
    if (!transcript.length) {
      const error = new Error('Transcript not available for this call yet.');
      (error as any).status = 400;
      throw error;
    }

    const detection = await detectConversation({
      memberId: row.memberId ?? undefined,
      transcript,
      context: { requiredScreenings: 24, completedScreenings: 18 },
    });

    const [updated] = await db
      .update(calls)
      .set({ analysis: detection, analysisRunAt: new Date(), updatedAt: new Date() })
      .where(eq(calls.id, row.id))
      .returning();

    res.json({ call: serializeCall(updated), detection });
  } catch (error) {
    next(error);
  }
});

const sendSummarySchema = z.object({
  to: z.array(z.string().email()).nonempty(),
});

r.post('/:id/send-summary', async (req, res, next) => {
  try {
    const body = sendSummarySchema.parse(req.body);
    const row = await getCallOrThrow(req.params.id);
    const analysis = (row.analysis as DetectionResponse | null) || null;
    if (!analysis) {
      const error = new Error('Run AI detection before sending a summary email.');
      (error as any).status = 400;
      throw error;
    }

    const { text, html } = composeDetectionEmailContent({
      issues: analysis.issues,
      documentation: analysis.documentation,
      revenue: analysis.revenue,
      compliance: analysis.compliance,
    });

    const subject = `Care Coordination Summary • ${row.memberName ?? 'Member'} • ${new Date().toLocaleDateString()}`;
    const result = await sendEmail({
      to: body.to,
      subject,
      text,
      html,
      categories: ['sdoh-summary', 'care-coordination'],
      customArgs: {
        callId: row.id,
        memberId: row.memberId ?? '',
      },
    });

    const summaryRecord = {
      to: body.to,
      delivered: result.delivered,
      provider: result.provider,
      sentAt: new Date().toISOString(),
      status: result.status,
      messageId: result.messageId,
      preview: result.preview,
      error: result.error,
    };

    const [updated] = await db
      .update(calls)
      .set({ summaryEmail: summaryRecord, updatedAt: new Date() })
      .where(eq(calls.id, row.id))
      .returning();

    res.json({ call: serializeCall(updated), email: result });
  } catch (error) {
    next(error);
  }
});

export default r;
