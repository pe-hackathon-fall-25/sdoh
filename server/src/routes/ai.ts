import { Router } from 'express';
import { z } from 'zod';
import { detectConversation } from '../services/sdohEngine';
import { sendEmail } from '../services/notifications';

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

function buildIssuesTable(
  issues: z.infer<typeof sendSummarySchema>['detection']['issues']
): { text: string; html: string } {
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
        `<tr><td>${issue.code}</td><td>${issue.label}</td><td>${issue.severity}</td><td>${issue.urgency}</td><td>${issue.confidence.toFixed(
          2
        )}</td></tr>`
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

r.post('/send-summary', async (req, res, next) => {
  try {
    const body = sendSummarySchema.parse(req.body);
    const { text, html } = buildIssuesTable(body.detection.issues);
    const narrative = body.detection.documentation?.narrative;
    const revenue = body.detection.revenue?.potentialRevenue;
    const completionRate = body.detection.compliance?.completionRate;
    const alerts = body.detection.compliance?.alerts ?? [];

    const narrativeText = narrative ? `Narrative Summary:\n${narrative}\n\n` : '';
    const revenueText = typeof revenue === 'number' ? `Potential Revenue Impact: $${revenue.toLocaleString()}\n` : '';
    const complianceText = typeof completionRate === 'number' ? `Compliance Completion Rate: ${Math.round(completionRate * 100) / 100}%\n` : '';
    const alertsText = alerts.length
      ? `Alerts:\n${alerts.map((alert) => `• ${alert.message}`).join('\n')}\n\n`
      : '';

    const emailText = `${narrativeText}${revenueText}${complianceText}${alertsText}${text}`.trim();
    const emailHtml = `
      <div>
        ${narrative ? `<p><strong>Narrative Summary</strong><br/>${narrative}</p>` : ''}
        ${typeof revenue === 'number' ? `<p><strong>Potential Revenue Impact:</strong> $${revenue.toLocaleString()}</p>` : ''}
        ${typeof completionRate === 'number' ? `<p><strong>Compliance Completion Rate:</strong> ${completionRate}%</p>` : ''}
        ${alerts.length ? `<ul>${alerts.map((alert) => `<li>${alert.message}</li>`).join('')}</ul>` : ''}
        ${html}
      </div>
    `;

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
