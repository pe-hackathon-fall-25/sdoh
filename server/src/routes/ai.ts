import { Router } from 'express';
import { z } from 'zod';
import { detectConversation } from '../services/sdohEngine';
import { sendEmail } from '../services/notifications';
import { composeDetectionEmailContent } from '../services/emailTemplates';

const r = Router();

r.post('/detect', async (req, res, next) => {
  try {
    const result = await detectConversation(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

const sendSummarySchema = z.object({
  to: z.array(z.string().email()).nonempty(),
  scenarioName: z.string(),
  scenarioId: z.string().optional(),
  memberId: z.string(),
  memberName: z.string().optional(),
  detection: z.object({
    issues: z
      .array(
        z.object({
          code: z.string(),
          label: z.string(),
          severity: z.string(),
          urgency: z.string(),
          confidence: z.number(),
        })
      )
      .default([]),
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
        alerts: z
          .array(
            z.object({
              message: z.string(),
              severity: z.enum(['info', 'warning', 'critical']).optional(),
            })
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  }),
});

r.post('/send-summary', async (req, res, next) => {
  try {
    const body = sendSummarySchema.parse(req.body);
    const detectionForEmail = {
      issues: body.detection.issues,
      documentation: body.detection.documentation ?? null,
      revenue: body.detection.revenue ?? null,
      compliance: body.detection.compliance
        ? {
            ...body.detection.compliance,
            alerts: body.detection.compliance.alerts?.map((alert) => ({
              ...alert,
              severity: alert.severity ?? 'info',
            })),
          }
        : null,
    };

    const { text: emailText, html: emailHtml } = composeDetectionEmailContent(detectionForEmail);

    const result = await sendEmail({
      to: body.to,
      subject: `SDOH Summary • ${body.scenarioName} • ${body.memberName ?? body.memberId}`,
      text: emailText,
      html: emailHtml,
      categories: ['sdoh-summary', body.scenarioId ?? 'sdoh-scenarios'],
      customArgs: {
        scenario: body.scenarioName,
        memberId: body.memberId,
      },
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default r;
