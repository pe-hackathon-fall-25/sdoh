import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../util/db';
import {
  calls,
  callTranscripts,
  callDetections,
  members,
} from '../db/schema';
import { env } from '../env';
import { initiateVoiceCall } from '../services/voice';
import { detectConversation } from '../services/sdohEngine';
import { sendEmail } from '../services/notifications';

const router = Router();

const transcriptMessageSchema = z.object({
  speaker: z.string(),
  text: z.string(),
  language: z.string().optional(),
  timestamp: z.string().optional(),
});

const createCallSchema = z.object({
  memberId: z.string(),
  to: z.string(),
  from: z.string().optional(),
  direction: z.enum(['outbound', 'inbound']).default('outbound'),
  metadata: z.record(z.unknown()).optional(),
  transcript: z.array(transcriptMessageSchema).optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  durationSeconds: z.number().int().positive().optional(),
});

const appendTranscriptSchema = z.object({
  segments: z.array(transcriptMessageSchema).nonempty(),
  replace: z.boolean().default(false).optional(),
});

const detectionRunSchema = z.object({
  context: z.record(z.unknown()).optional(),
});

const sendSummarySchema = z.object({
  to: z.array(z.string().email()).nonempty(),
  detectionId: z.string().optional(),
  subject: z.string().optional(),
  intro: z.string().optional(),
});

type TranscriptMessage = z.infer<typeof transcriptMessageSchema>;

type DetectionRecord = {
  id: string;
  engine?: string | null;
  issues: TranscriptIssue[];
  documentation?: Record<string, unknown> | null;
  revenue?: Record<string, unknown> | null;
  compliance?: Record<string, unknown> | null;
  narrative?: string | null;
  createdAt: string;
};

type TranscriptIssue = {
  code: string;
  label: string;
  domain?: string;
  severity: string;
  urgency: string;
  status?: string;
  confidence: number;
  rationale?: string;
  evidence?: TranscriptMessage[];
};

type CallRow = typeof calls.$inferSelect;

type CallSummary = {
  id: string;
  memberId: string;
  memberName?: string | null;
  direction: string;
  fromNumber?: string | null;
  toNumber?: string | null;
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  transcriptMessageCount: number;
  lastDetection?: Pick<DetectionRecord, 'id' | 'createdAt'> & { issueCount: number } | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function parseTranscriptMessages(value: unknown): TranscriptMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const parsed = transcriptMessageSchema.safeParse(item);
      return parsed.success ? parsed.data : null;
    })
    .filter((msg): msg is TranscriptMessage => msg !== null);
}

function serializeCall(row: CallRow, memberName?: string | null, transcriptCount = 0, lastDetection?: DetectionRecord | null): CallSummary {
  return {
    id: row.id,
    memberId: row.memberId,
    memberName: memberName ?? null,
    direction: row.direction,
    fromNumber: row.fromNumber,
    toNumber: row.toNumber,
    status: row.status,
    startedAt: row.startedAt?.toISOString?.() ?? null,
    endedAt: row.endedAt?.toISOString?.() ?? null,
    durationSeconds: row.durationSeconds ?? null,
    transcriptMessageCount: transcriptCount,
    lastDetection: lastDetection
      ? { id: lastDetection.id, createdAt: lastDetection.createdAt, issueCount: lastDetection.issues.length }
      : null,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  };
}

async function fetchCallDetail(callId: string) {
  const rows = await db
    .select()
    .from(calls)
    .leftJoin(members, eq(members.id, calls.memberId))
    .where(and(eq(calls.id, callId), eq(calls.tenantId, env.TENANT_ID)));

  const row = rows[0];
  if (!row) return null;

  const transcriptRows = await db
    .select()
    .from(callTranscripts)
    .where(eq(callTranscripts.callId, callId))
    .orderBy(desc(callTranscripts.updatedAt))
    .limit(1);

  const detectionRows = await db
    .select()
    .from(callDetections)
    .where(eq(callDetections.callId, callId))
    .orderBy(desc(callDetections.createdAt));

  const transcriptMessages = parseTranscriptMessages(transcriptRows[0]?.messages);
  const detections: DetectionRecord[] = detectionRows.map((det) => ({
    id: det.id,
    engine: det.engine,
    issues: parseDetectionIssues(det.issues),
    documentation: det.documentation as Record<string, unknown> | null,
    revenue: det.revenue as Record<string, unknown> | null,
    compliance: det.compliance as Record<string, unknown> | null,
    narrative: det.narrative,
    createdAt: det.createdAt?.toISOString?.() ?? new Date().toISOString(),
  }));

  return {
    call: serializeCall(row.calls, formatMemberName(row.members), transcriptMessages.length, detections[0] ?? null),
    transcript: {
      messages: transcriptMessages,
      updatedAt: transcriptRows[0]?.updatedAt?.toISOString?.() ?? null,
    },
    detections,
    metadata: row.calls.metadata as Record<string, unknown> | null,
  };
}

function parseDetectionIssues(value: unknown): TranscriptIssue[] {
  if (!Array.isArray(value)) return [];
  const issues: TranscriptIssue[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || !item) continue;
    const base = item as Record<string, unknown>;
    if (
      typeof base.code !== 'string' ||
      typeof base.label !== 'string' ||
      typeof base.severity !== 'string' ||
      typeof base.urgency !== 'string'
    ) {
      continue;
    }
    issues.push({
      code: base.code,
      label: base.label,
      domain: typeof base.domain === 'string' ? base.domain : undefined,
      severity: base.severity,
      urgency: base.urgency,
      status: typeof base.status === 'string' ? base.status : undefined,
      confidence: typeof base.confidence === 'number' ? base.confidence : Number(base.confidence) || 0,
      rationale: typeof base.rationale === 'string' ? base.rationale : undefined,
      evidence: parseTranscriptMessages(base.evidence),
    });
  }
  return issues;
}

function formatMemberName(member: typeof members.$inferSelect | null): string | null {
  if (!member) return null;
  const parts = [member.firstName, member.lastName].filter(Boolean);
  return parts.join(' ') || null;
}

router.post('/', async (req, res, next) => {
  try {
    const body = createCallSchema.parse(req.body);
    const id = randomUUID();
    const now = new Date();
    const fromNumber = body.from || process.env.TWILIO_FROM_NUMBER || null;

    await db.insert(calls).values({
      id,
      tenantId: env.TENANT_ID,
      memberId: body.memberId,
      direction: body.direction,
      fromNumber,
      toNumber: body.to,
      status: 'initiated',
      metadata: body.metadata as any,
      startedAt: body.startedAt ? new Date(body.startedAt) : now,
      createdAt: now,
      updatedAt: now,
    });

    if (body.transcript?.length) {
      await db.insert(callTranscripts).values({
        id: randomUUID(),
        callId: id,
        messages: body.transcript as any,
        createdAt: now,
        updatedAt: now,
      });
    }

    const baseUrl =
      process.env.VOICE_WEBHOOK_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const twimlUrl = `${baseUrl}/api/calls/${id}/twiml`;
    const statusUrl = `${baseUrl}/api/calls/${id}/status`;

    const voiceResult = await initiateVoiceCall({
      to: body.to,
      from: fromNumber,
      twimlUrl,
      statusCallbackUrl: statusUrl,
    });

    const updates: Partial<CallRow> = {
      status: voiceResult.status || (voiceResult.sid ? 'initiated' : 'completed'),
      updatedAt: new Date(),
    };

    if (voiceResult.sid) {
      updates.twilioCallSid = voiceResult.sid;
    }

    if (!voiceResult.sid && body.transcript?.length) {
      const end = body.endedAt ? new Date(body.endedAt) : new Date();
      updates.endedAt = end;
      updates.durationSeconds = body.durationSeconds ?? Math.max(1, body.transcript.length * 8);
    }

    if (body.durationSeconds && !updates.durationSeconds) {
      updates.durationSeconds = body.durationSeconds;
    }

    if (body.endedAt && !updates.endedAt) {
      updates.endedAt = new Date(body.endedAt);
    }

    await db.update(calls).set(updates as any).where(eq(calls.id, id));

    const detail = await fetchCallDetail(id);
    res.json({
      call: detail?.call,
      transcript: detail?.transcript,
      detections: detail?.detections ?? [],
      voice: voiceResult,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const rows = await db
      .select()
      .from(calls)
      .leftJoin(members, eq(members.id, calls.memberId))
      .where(eq(calls.tenantId, env.TENANT_ID))
      .orderBy(desc(calls.startedAt))
      .limit(limit);

    const callIds = rows.map((row) => row.calls.id);
    let transcriptsMap = new Map<string, TranscriptMessage[]>();
    if (callIds.length) {
      const transcriptRows = await db
        .select()
        .from(callTranscripts)
        .where(inArray(callTranscripts.callId, callIds));
      transcriptsMap = new Map(
        transcriptRows.map((row) => [row.callId, parseTranscriptMessages(row.messages)])
      );
    }

    let lastDetectionMap = new Map<string, DetectionRecord>();
    if (callIds.length) {
      const detectionRows = await db
        .select()
        .from(callDetections)
        .where(inArray(callDetections.callId, callIds))
        .orderBy(desc(callDetections.createdAt));

      for (const det of detectionRows) {
        if (!lastDetectionMap.has(det.callId)) {
          lastDetectionMap.set(det.callId, {
            id: det.id,
            engine: det.engine,
            issues: parseDetectionIssues(det.issues),
            documentation: det.documentation as Record<string, unknown> | null,
            revenue: det.revenue as Record<string, unknown> | null,
            compliance: det.compliance as Record<string, unknown> | null,
            narrative: det.narrative,
            createdAt: det.createdAt?.toISOString?.() ?? new Date().toISOString(),
          });
        }
      }
    }

    const payload: CallSummary[] = rows.map((row) =>
      serializeCall(
        row.calls,
        formatMemberName(row.members),
        transcriptsMap.get(row.calls.id)?.length ?? 0,
        lastDetectionMap.get(row.calls.id) ?? null
      )
    );

    res.json({ calls: payload });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const detail = await fetchCallDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    res.json(detail);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/transcript', async (req, res, next) => {
  try {
    const body = appendTranscriptSchema.parse(req.body);
    const detail = await fetchCallDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    const existingMessages = body.replace
      ? []
      : detail.transcript?.messages ?? [];
    const updatedMessages = [...existingMessages, ...body.segments];

    const now = new Date();
    if (detail.transcript?.messages?.length) {
      await db
        .update(callTranscripts)
        .set({ messages: updatedMessages as any, updatedAt: now })
        .where(eq(callTranscripts.callId, req.params.id));
    } else {
      await db.insert(callTranscripts).values({
        id: randomUUID(),
        callId: req.params.id,
        messages: updatedMessages as any,
        createdAt: now,
        updatedAt: now,
      });
    }

    await db
      .update(calls)
      .set({ updatedAt: now })
      .where(eq(calls.id, req.params.id));

    res.json({ ok: true, messages: updatedMessages });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/status', async (req, res, next) => {
  try {
    const detail = await fetchCallDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    const status = typeof req.body.CallStatus === 'string' ? req.body.CallStatus : req.body.status;
    const durationRaw = req.body.CallDuration || req.body.durationSeconds;
    const durationSeconds = typeof durationRaw === 'string' ? Number(durationRaw) : Number(durationRaw || 0);
    const now = new Date();

    const updates: Partial<CallRow> = {
      status: status || detail.call.status,
      updatedAt: now,
    };

    if (!detail.call.startedAt && (status === 'in-progress' || status === 'answered')) {
      updates.startedAt = now;
    }

    if (['completed', 'canceled', 'failed', 'busy', 'no-answer'].includes(String(status || '').toLowerCase())) {
      updates.endedAt = now;
      if (!Number.isNaN(durationSeconds) && durationSeconds > 0) {
        updates.durationSeconds = durationSeconds;
      } else if (detail.call.startedAt) {
        const start = new Date(detail.call.startedAt);
        updates.durationSeconds = Math.max(0, Math.round((now.getTime() - start.getTime()) / 1000));
      }
    } else if (!Number.isNaN(durationSeconds) && durationSeconds > 0) {
      updates.durationSeconds = durationSeconds;
    }

    await db.update(calls).set(updates as any).where(eq(calls.id, req.params.id));

    res.json({ ok: true, status: updates.status });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/run-detection', async (req, res, next) => {
  try {
    const detail = await fetchCallDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    if (!detail.transcript?.messages?.length) {
      res.status(400).json({ error: 'No transcript available for detection' });
      return;
    }

    const body = detectionRunSchema.parse(req.body || {});
    const detection = await detectConversation({
      memberId: detail.call.memberId,
      transcript: detail.transcript.messages,
      context: body.context ?? undefined,
    });

    const detectionId = randomUUID();
    const now = new Date();

    await db.insert(callDetections).values({
      id: detectionId,
      callId: detail.call.id,
      engine: detection.engine,
      issues: detection.issues as any,
      documentation: detection.documentation as any,
      revenue: detection.revenue as any,
      compliance: detection.compliance as any,
      narrative: detection.documentation?.narrative,
      createdAt: now,
    });

    await db
      .update(calls)
      .set({ lastDetectionId: detectionId, updatedAt: now })
      .where(eq(calls.id, detail.call.id));

    res.json({ detectionId, detection });
  } catch (error) {
    next(error);
  }
});

function buildIssuesTable(issues: TranscriptIssue[]): { text: string; html: string } {
  if (!issues.length) {
    const message = 'No active SDOH risks detected.';
    return { text: message, html: `<p><strong>${message}</strong></p>` };
  }

  const text = issues
    .map(
      (issue) =>
        `${issue.label} (${issue.code}) — severity ${issue.severity}, urgency ${issue.urgency}, confidence ${Math.round(issue.confidence * 100) / 100}`
    )
    .join('\n');

  const rows = issues
    .map(
      (issue) =>
        `<tr><td>${issue.code}</td><td>${issue.label}</td><td>${issue.severity}</td><td>${issue.urgency}</td><td>${issue.confidence.toFixed(2)}</td></tr>`
    )
    .join('');

  const html = `
    <table border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr>
          <th>Code</th>
          <th>Description</th>
          <th>Severity</th>
          <th>Urgency</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  return { text, html };
}

router.post('/:id/send-summary', async (req, res, next) => {
  try {
    const detail = await fetchCallDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    const body = sendSummarySchema.parse(req.body);

    const detection =
      (body.detectionId
        ? detail.detections.find((det) => det.id === body.detectionId)
        : detail.detections[0]) ?? null;

    if (!detection) {
      res.status(400).json({ error: 'No detection results available' });
      return;
    }

    const { text, html } = buildIssuesTable(detection.issues);
    const narrative = detection.narrative ?? detection.documentation?.narrative;
    const revenue = detection.revenue && typeof detection.revenue.potentialRevenue === 'number'
      ? (detection.revenue.potentialRevenue as number)
      : undefined;
    const compliance = detection.compliance && typeof detection.compliance.completionRate === 'number'
      ? (detection.compliance.completionRate as number)
      : undefined;
    const alerts = Array.isArray(detection.compliance?.alerts)
      ? (detection.compliance?.alerts as { message?: string }[])
          .map((alert) => alert?.message)
          .filter((msg): msg is string => Boolean(msg))
      : [];

    const narrativeText = narrative ? `Narrative Summary:\n${narrative}\n\n` : '';
    const revenueText = typeof revenue === 'number' ? `Potential Revenue Impact: $${revenue.toLocaleString()}\n` : '';
    const complianceText = typeof compliance === 'number' ? `Compliance Completion Rate: ${Math.round(compliance * 100) / 100}%\n` : '';
    const alertsText = alerts.length ? `Alerts:\n${alerts.map((alert) => `• ${alert}`).join('\n')}\n\n` : '';

    const emailText = `${body.intro ? `${body.intro}\n\n` : ''}${narrativeText}${revenueText}${complianceText}${alertsText}${text}`.trim();
    const emailHtml = `
      <div>
        ${body.intro ? `<p>${body.intro}</p>` : ''}
        ${narrative ? `<p><strong>Narrative Summary</strong><br/>${narrative}</p>` : ''}
        ${typeof revenue === 'number' ? `<p><strong>Potential Revenue Impact:</strong> $${revenue.toLocaleString()}</p>` : ''}
        ${typeof compliance === 'number' ? `<p><strong>Compliance Completion Rate:</strong> ${compliance}%</p>` : ''}
        ${alerts.length ? `<ul>${alerts.map((alert) => `<li>${alert}</li>`).join('')}</ul>` : ''}
        ${html}
      </div>
    `;

    const subject =
      body.subject ||
      `SDOH Call Summary • ${detail.call.memberName ?? detail.call.memberId} • ${new Date().toLocaleDateString()}`;

    const result = await sendEmail({
      to: body.to,
      subject,
      text: emailText,
      html: emailHtml,
      categories: ['sdoh-call-summary'],
      customArgs: {
        callId: detail.call.id,
        memberId: detail.call.memberId,
      },
    });

    const now = new Date();
    await db
      .update(calls)
      .set({ summaryEmailSentAt: now, updatedAt: now })
      .where(eq(calls.id, detail.call.id));

    res.json(result);
  } catch (error) {
    next(error);
  }
});

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

router.all('/:id/twiml', async (req, res, next) => {
  try {
    const detail = await fetchCallDetail(req.params.id);
    if (!detail) {
      res.status(404).type('text/xml').send('<Response><Say>Call not found.</Say></Response>');
      return;
    }

    const greeting = process.env.TWILIO_CONNECT_GREETING || 'Connecting your Care Coordination call.';
    const streamBase = process.env.TWILIO_STREAM_WEBSOCKET_URL;
    const fromNumber = detail.call.fromNumber || process.env.TWILIO_FROM_NUMBER || '';

    const streamTag = streamBase
      ? `<Start><Stream url="${escapeXml(streamBase.replace('{CALL_ID}', detail.call.id))}" track="both_tracks" /></Start>`
      : '';

    const dialTarget = detail.call.toNumber
      ? `<Dial callerId="${escapeXml(fromNumber)}">${escapeXml(detail.call.toNumber)}</Dial>`
      : '<Pause length="5" />';

    const response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${escapeXml(greeting)}</Say>
  ${streamTag}
  ${dialTarget}
</Response>`;

    res.type('text/xml').send(response);
  } catch (error) {
    next(error);
  }
});

export default router;
