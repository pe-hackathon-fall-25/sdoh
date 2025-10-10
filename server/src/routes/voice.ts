import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { calls } from '../db/schema';
import { db } from '../util/db';
import { serializeCall } from './calls';
import { coerceMessagesFromPayload, mergeTranscripts, parseMaybeJson, toTranscriptArray } from '../services/transcript';
import { finalizeTranscript, ingestStreamPayload } from '../services/voiceTranscription';
import { detectConversation, type DetectionResponse } from '../services/sdohEngine';
import { composeDetectionEmailContent } from '../services/emailTemplates';
import { sendEmail } from '../services/notifications';

const r = Router();

function absoluteUrl(path: string): string {
  const base = process.env.BASE_URL?.replace(/\/$/, '') || '';
  if (!base) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function twimlStreamUrl(): string {
  const configured = process.env.TWILIO_MEDIA_STREAM_URL;
  if (configured && configured.trim()) {
    return configured.trim();
  }
  return absoluteUrl('/api/voice/stream');
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function parseDuration(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.round(parsed));
    }
  }
  return null;
}

function normalizeStatus(value?: string | null): string {
  if (!value) return 'completed';
  const normalized = value.toLowerCase();
  if (['completed', 'complete', 'finished'].includes(normalized)) return 'completed';
  if (['in-progress', 'processing', 'ongoing'].includes(normalized)) return 'in-progress';
  if (['queued', 'ringing', 'dialing', 'initiated', 'connecting'].includes(normalized)) return 'initiated';
  if (['failed', 'busy', 'no-answer', 'canceled', 'cancelled'].includes(normalized)) return 'failed';
  return normalized;
}

function mergeMetadata(
  existing: unknown,
  incoming: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  const base =
    existing && typeof existing === 'object'
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (!incoming) {
    return Object.keys(base).length ? base : null;
  }
  return { ...base, ...incoming };
}

function collectSummaryRecipients(): string[] {
  const raw = process.env.CALL_SUMMARY_RECIPIENTS || '';
  return raw
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email.length > 3);
}

r.all('/twiml', (_req, res) => {
  const streamUrl = twimlStreamUrl();
  const greeting =
    process.env.TWILIO_TWIML_GREETING ||
    'You are now connected to the care coordination line. This call may be transcribed for quality improvement.';

  const response = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Start>\n    <Stream url="${streamUrl}" />\n  </Start>\n  <Say voice="Polly.Joanna">${greeting}</Say>\n  <Pause length="600" />\n</Response>`;

  res.type('text/xml').send(response);
});

r.post('/stream', (req, res) => {
  const result = ingestStreamPayload(req.body ?? {});
  res.json({ ok: true, ...result });
});

r.post('/status', async (req, res, next) => {
  try {
    const payload = req.body ?? {};
    const callSid: string | undefined =
      payload.CallSid || payload.callSid || payload.Sid || payload.sid || payload.CallSID;
    if (!callSid) {
      res.status(400).json({ error: 'CallSid missing' });
      return;
    }

    const rows = await db.select().from(calls).where(eq(calls.callSid, callSid)).limit(1);
    if (!rows.length) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    const call = rows[0];
    const now = new Date();

    const buffered = finalizeTranscript(callSid);
    const webhookMessages = coerceMessagesFromPayload(payload);
    const metadataPayload =
      parseMaybeJson<Record<string, unknown>>(payload.Metadata) ||
      parseMaybeJson<Record<string, unknown>>(payload.metadata) ||
      undefined;

    let transcript = toTranscriptArray(call.transcript);
    if (buffered.length) {
      transcript = mergeTranscripts(transcript, buffered);
    }
    if (webhookMessages.length) {
      transcript = mergeTranscripts(transcript, webhookMessages);
    }

    const status = normalizeStatus(payload.CallStatus || payload.callStatus || payload.Status);
    const endDate =
      parseDate(payload.EndedAt || payload.endedAt || payload.EndTime || payload.endTime || payload.Timestamp) ||
      now;
    const startDate = call.startedAt || parseDate(payload.StartedAt || payload.startedAt || payload.StartTime);
    const durationSeconds =
      parseDuration(payload.CallDuration || payload.Duration || payload.CallDurationSeconds) ||
      (startDate && endDate ? Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000)) : null);

    let detection: DetectionResponse | null = null;
    if (transcript.length) {
      try {
        detection = await detectConversation({
          memberId: call.memberId ?? undefined,
          transcript,
          context: { requiredScreenings: 24, completedScreenings: 18 },
        });
      } catch (error) {
        console.error('[voice] detectConversation error', error);
      }
    }

    let summaryRecord: Record<string, unknown> | null = null;
    if (detection) {
      const recipients = collectSummaryRecipients();
      if (recipients.length) {
        try {
          const { text, html } = composeDetectionEmailContent({
            issues: detection.issues,
            documentation: detection.documentation,
            revenue: detection.revenue,
            compliance: detection.compliance,
          });
          const subject = `Care Coordination Summary • ${call.memberName ?? 'Member'} • ${new Date().toLocaleDateString()}`;
          const emailResult = await sendEmail({
            to: recipients,
            subject,
            text,
            html,
            categories: ['sdoh-summary', 'care-coordination'],
            customArgs: {
              callId: call.id,
              callSid,
            },
          });
          summaryRecord = {
            to: recipients,
            delivered: emailResult.delivered,
            provider: emailResult.provider,
            sentAt: new Date().toISOString(),
            status: emailResult.status,
            messageId: emailResult.messageId,
            preview: emailResult.preview,
            error: emailResult.error,
          };
        } catch (error) {
          console.error('[voice] summary email error', error);
        }
      }
    }

    const updates: Record<string, unknown> = {
      status,
      endedAt: endDate,
      durationSeconds,
      updatedAt: now,
      metadata: mergeMetadata(call.metadata, {
        ...metadataPayload,
        statusCallback: {
          status,
          receivedAt: now.toISOString(),
        },
      }),
    };

    if (!call.startedAt && startDate) {
      updates.startedAt = startDate;
    }

    if (transcript.length) {
      updates.transcript = transcript;
    }

    if (detection) {
      updates.detectionResult = detection;
      updates.analysis = detection;
      updates.analysisRunAt = now;
    }

    if (summaryRecord) {
      updates.summaryEmail = summaryRecord;
    }

    await db.update(calls).set(updates).where(eq(calls.id, call.id));

    const [fresh] = await db.select().from(calls).where(eq(calls.id, call.id)).limit(1);

    res.json({
      ok: true,
      call: serializeCall(fresh),
      detection,
    });
  } catch (error) {
    next(error);
  }
});

export default r;

