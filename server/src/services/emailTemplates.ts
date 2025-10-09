import type { DetectionResponse } from './sdohEngine';

type EmailIssue = {
  code: string;
  label: string;
  severity: string;
  urgency: string;
  confidence: number;
};

type DetectionForEmail = {
  issues: EmailIssue[];
  documentation?: Partial<DetectionResponse['documentation']> | null;
  revenue?: Partial<DetectionResponse['revenue']> | null;
  compliance?: Partial<DetectionResponse['compliance']> | null;
};

export function buildIssuesTable(issues: DetectionForEmail['issues']): { text: string; html: string } {
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

export function composeDetectionEmailContent(detection: DetectionForEmail): { text: string; html: string } {
  const issuesTable = buildIssuesTable(detection.issues ?? []);
  const narrative = detection.documentation?.narrative;
  const revenue = detection.revenue?.potentialRevenue;
  const completionRate = detection.compliance?.completionRate;
  const alerts = detection.compliance?.alerts ?? [];

  const narrativeText = narrative ? `Narrative Summary:\n${narrative}\n\n` : '';
  const revenueText = typeof revenue === 'number' ? `Potential Revenue Impact: $${revenue.toLocaleString()}\n` : '';
  const complianceText =
    typeof completionRate === 'number' ? `Compliance Completion Rate: ${Math.round(completionRate * 100) / 100}%\n` : '';
  const alertsText = alerts.length ? `Alerts:\n${alerts.map((alert) => `• ${alert.message}`).join('\n')}\n\n` : '';

  const emailText = `${narrativeText}${revenueText}${complianceText}${alertsText}${issuesTable.text}`.trim();
  const emailHtml = `
      <div>
        ${narrative ? `<p><strong>Narrative Summary</strong><br/>${narrative}</p>` : ''}
        ${typeof revenue === 'number' ? `<p><strong>Potential Revenue Impact:</strong> $${revenue.toLocaleString()}</p>` : ''}
        ${typeof completionRate === 'number' ? `<p><strong>Compliance Completion Rate:</strong> ${completionRate}%</p>` : ''}
        ${alerts.length ? `<ul>${alerts.map((alert) => `<li>${alert.message}</li>`).join('')}</ul>` : ''}
        ${issuesTable.html}
      </div>
    `;

  return { text: emailText, html: emailHtml };
}

export type { DetectionForEmail };
