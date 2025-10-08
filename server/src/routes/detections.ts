import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { aiDetections } from '../db/schema';
import { db } from '../util/db';
import { desc } from 'drizzle-orm';

const r = Router();

const alertSchema = z.object({
  message: z.string(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
});

const issueSchema = z.object({
  code: z.string(),
  label: z.string(),
  severity: z.string(),
  urgency: z.string(),
  confidence: z.number(),
  status: z.string().optional(),
  rationale: z.string().optional(),
});

const detectionPayloadSchema = z.object({
  scenarioId: z.string(),
  scenarioName: z.string(),
  memberId: z.string(),
  memberName: z.string().optional(),
  detection: z.object({
    issues: z.array(issueSchema).default([]),
    documentation: z
      .object({ narrative: z.string().optional() })
      .passthrough()
      .optional(),
    revenue: z
      .object({ potentialRevenue: z.number().optional() })
      .passthrough()
      .optional(),
    compliance: z
      .object({
        completionRate: z.number().optional(),
        alerts: z.array(alertSchema).optional(),
      })
      .passthrough()
      .optional(),
  }),
});

r.post('/', async (req, res, next) => {
  try {
    const body = detectionPayloadSchema.parse(req.body);
    const id = randomUUID();
    await db.insert(aiDetections).values({
      id,
      scenarioId: body.scenarioId,
      scenarioName: body.scenarioName,
      memberId: body.memberId,
      memberName: body.memberName,
      issues: body.detection.issues as unknown as any,
      narrative: body.detection.documentation?.narrative,
      revenue: body.detection.revenue as unknown as any,
      compliance: body.detection.compliance as unknown as any,
    });
    res.json({ id });
  } catch (error) {
    next(error);
  }
});

r.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const rows = await db
      .select()
      .from(aiDetections)
      .orderBy(desc(aiDetections.createdAt))
      .limit(limit);
    res.json({
      detections: rows.map((row) => ({
        id: row.id,
        scenarioId: row.scenarioId,
        scenarioName: row.scenarioName,
        memberId: row.memberId,
        memberName: row.memberName,
        issues: (row.issues as unknown as z.infer<typeof issueSchema>[]) ?? [],
        narrative: row.narrative,
        revenue: row.revenue as Record<string, unknown> | null,
        compliance: row.compliance as Record<string, unknown> | null,
        createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default r;
