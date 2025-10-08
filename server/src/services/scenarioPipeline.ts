import { detectConversation, type DetectionRequest, type DetectionResponse } from './sdohEngine';
import { sendEmail, sendSms, type EmailResult, type SmsResult } from './notifications';

type ConversationMessage = DetectionRequest['transcript'][number];

type CareCoordinationCallRequest = {
  memberId: string;
  caseManagerEmail: string;
  workerName?: string;
  workerEmail?: string;
  encounterId?: string;
  transcript: ConversationMessage[];
  context?: DetectionRequest['context'];
};

type CareCoordinationCallResponse = {
  detection: DetectionResponse;
  email: EmailResult;
  taskSummary: {
    memberId: string;
    workerName?: string;
    encounterId?: string;
    nextActions: string[];
  };
};

type SmsScreeningRequest = {
  memberId: string;
  outreachPrompt: string;
  memberReply: string;
  memberPhone: string;
  coordinatorEmail: string;
  fromNumber?: string;
};

type SmsScreeningResponse = {
  detection: DetectionResponse;
  autoReply: string;
  sms: SmsResult;
  email: EmailResult;
};

type EhrIntakeRequest = {
  memberId: string;
  encounterId?: string;
  responses: Record<string, string | number | boolean | null | undefined>;
  additionalNote?: string;
  destinationEmail: string;
};

type EhrIntakeResponse = {
  detection: DetectionResponse;
  fhirBundle: Record<string, unknown>;
  email: EmailResult;
};

type MonitoringRequest = {
  memberId: string;
  checkInId?: string;
  responses: {
    prompt: string;
    reply: string;
    channel: 'voice' | 'sms';
    timestamp?: string;
  }[];
  notifyEmails: string[];
};

type MonitoringResponse = {
  detection: DetectionResponse;
  priority: 'routine' | 'needs_follow_up' | 'urgent';
  alerts: string[];
  email: EmailResult;
};

type CareTeamAlertRequest = {
  memberId: string;
  transcript: ConversationMessage[];
  dashboardUrl?: string;
  notifyEmails: string[];
};

type CareTeamAlertResponse = {
  detection: DetectionResponse;
  alert: {
    severity: 'info' | 'warning' | 'critical';
    summary: string;
    dashboardUrl?: string;
  };
  email: EmailResult;
};

type PopulationHealthRequest = {
  tenantId?: string;
  cohort: {
    memberId: string;
    transcript: ConversationMessage[];
    context?: DetectionRequest['context'];
  }[];
};

type PopulationHealthResponse = {
  tenantId?: string;
  detections: DetectionResponse[];
  metrics: {
    highRiskMembers: number;
    totalMembers: number;
    potentialRevenue: number;
    topIssues: {
      code: string;
      label: string;
      count: number;
    }[];
  };
};

type PostDischargeRequest = {
  memberId: string;
  memberPhone: string;
  careTeamEmail: string;
  encounterId?: string;
  dischargeSummary?: string;
  memberReply: string;
  fromNumber?: string;
};

type PostDischargeResponse = {
  detection: DetectionResponse;
  autoReply: string;
  sms: SmsResult;
  email: EmailResult;
};

function buildActionPlan(detection: DetectionResponse): string[] {
  if (detection.issues.length === 0) {
    return ['Document as no active SDOH risk. Maintain standard outreach cadence.'];
  }

  return detection.issues.map((issue) => {
    if (issue.urgency === 'high' || issue.severity === 'high') {
      return `${issue.label}: escalate to care manager within 24 hours and document interventions.`;
    }
    if (issue.severity === 'moderate') {
      return `${issue.label}: queue resource referral and schedule follow-up in 3-5 days.`;
    }
    return `${issue.label}: monitor and address during next monthly touchpoint.`;
  });
}

function buildEmailTable(detection: DetectionResponse): string {
  if (detection.issues.length === 0) {
    return '<p><strong>No active SDOH issues detected.</strong></p>';
  }

  const rows = detection.issues
    .map(
      (issue) =>
        `<tr><td>${issue.code}</td><td>${issue.label}</td><td>${issue.severity}</td><td>${issue.urgency}</td><td>${issue.confidence}</td></tr>`
    )
    .join('');

  return `
    <table border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr>
          <th>Code</th>
          <th>Label</th>
          <th>Severity</th>
          <th>Urgency</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildSummaryText(detection: DetectionResponse): string {
  if (detection.issues.length === 0) {
    return 'No active SDOH risks identified. Maintain routine screening cadence.';
  }

  return detection.issues
    .map((issue) => `${issue.label} (${issue.code}) — severity ${issue.severity}, urgency ${issue.urgency}.`)
    .join('\n');
}

function createFhirBundle(request: EhrIntakeRequest, detection: DetectionResponse): Record<string, unknown> {
  const issued = new Date().toISOString();
  return {
    resourceType: 'Bundle',
    type: 'collection',
    id: `bundle-${request.memberId}-${Date.now()}`,
    meta: {
      lastUpdated: issued,
      tag: [{ system: 'https://sdoh-bridge.example.com', code: 'intake-ai-summary' }],
    },
    entry: [
      {
        resource: {
          resourceType: 'QuestionnaireResponse',
          id: `qr-${request.memberId}-${Date.now()}`,
          status: 'completed',
          authored: issued,
          subject: { reference: `Patient/${request.memberId}` },
          item: Object.entries(request.responses).map(([linkId, answer]) => ({
            linkId,
            text: linkId,
            answer: [{ valueString: String(answer) }],
          })),
        },
      },
      ...detection.issues.map((issue, index) => ({
        resource: {
          resourceType: 'Condition',
          id: `condition-${index}`,
          subject: { reference: `Patient/${request.memberId}` },
          code: {
            coding: [
              {
                system: 'http://hl7.org/fhir/sid/icd-10',
                code: issue.code,
                display: issue.label,
              },
            ],
            text: issue.label,
          },
          clinicalStatus: { text: issue.status },
          recordedDate: issued,
          extension: [
            { url: 'https://sdoh-bridge.example.com/severity', valueString: issue.severity },
            { url: 'https://sdoh-bridge.example.com/urgency', valueString: issue.urgency },
          ],
        },
      })),
    ],
  };
}

function pickPriority(detection: DetectionResponse): 'routine' | 'needs_follow_up' | 'urgent' {
  if (detection.issues.some((issue) => issue.urgency === 'high')) {
    return 'urgent';
  }
  if (detection.issues.some((issue) => issue.severity !== 'low')) {
    return 'needs_follow_up';
  }
  return 'routine';
}

export async function processCareCoordinationCall(
  request: CareCoordinationCallRequest
): Promise<CareCoordinationCallResponse> {
  const detection = await detectConversation({
    memberId: request.memberId,
    transcript: request.transcript,
    context: request.context ?? { encounterId: request.encounterId },
  });

  const actions = buildActionPlan(detection);
  const html = `
    <h2>SDOH Summary for ${request.memberId}</h2>
    <p>Worker: ${request.workerName ?? 'Unknown'} (${request.workerEmail ?? 'n/a'})</p>
    ${buildEmailTable(detection)}
    <h3>Next steps</h3>
    <ul>${actions.map((action) => `<li>${action}</li>`).join('')}</ul>
  `;

  const email = await sendEmail({
    to: request.caseManagerEmail,
    subject: `SDOH summary for ${request.memberId}`,
    text: buildSummaryText(detection),
    html,
    customArgs: {
      memberId: request.memberId,
      scenario: 'care-coordination-call',
    },
  });

  return {
    detection,
    email,
    taskSummary: {
      memberId: request.memberId,
      workerName: request.workerName,
      encounterId: request.encounterId,
      nextActions: actions,
    },
  };
}

export async function processSmsScreening(
  request: SmsScreeningRequest
): Promise<SmsScreeningResponse> {
  const transcript: ConversationMessage[] = [
    { speaker: 'system', text: request.outreachPrompt },
    { speaker: 'member', text: request.memberReply },
  ];

  const detection = await detectConversation({ memberId: request.memberId, transcript });
  const reply = detection.issues.length
    ? 'Thanks for sharing. A care coordinator will reach out shortly with food and housing resources.'
    : 'Thank you for the update! We are here if you need any support.';

  const sms = await sendSms({ to: request.memberPhone, from: request.fromNumber, body: reply });
  const email = await sendEmail({
    to: request.coordinatorEmail,
    subject: `SMS screening update for ${request.memberId}`,
    text: buildSummaryText(detection),
    html: `
      <p>Member response:</p>
      <blockquote>${request.memberReply}</blockquote>
      ${buildEmailTable(detection)}
    `,
    customArgs: {
      memberId: request.memberId,
      scenario: 'sms-screening',
    },
  });

  return { detection, autoReply: reply, sms, email };
}

export async function processEhrIntake(request: EhrIntakeRequest): Promise<EhrIntakeResponse> {
  const transcript: ConversationMessage[] = Object.entries(request.responses).map(([key, value]) => ({
    speaker: 'intake_form',
    text: `${key}: ${value}`,
  }));
  if (request.additionalNote) {
    transcript.push({ speaker: 'staff_note', text: request.additionalNote });
  }

  const detection = await detectConversation({
    memberId: request.memberId,
    transcript,
    context: { encounterId: request.encounterId },
  });

  const fhirBundle = createFhirBundle(request, detection);
  const email = await sendEmail({
    to: request.destinationEmail,
    subject: `EHR intake SDOH bundle for ${request.memberId}`,
    text: buildSummaryText(detection),
    html: `
      <p>Attached SDOH bundle for encounter ${request.encounterId ?? 'n/a'}.</p>
      ${buildEmailTable(detection)}
      <pre>${JSON.stringify(fhirBundle, null, 2)}</pre>
    `,
    categories: ['ehr-intake'],
    customArgs: {
      memberId: request.memberId,
      scenario: 'ehr-intake',
    },
  });

  return { detection, fhirBundle, email };
}

export async function processMonitoringCheckIn(
  request: MonitoringRequest
): Promise<MonitoringResponse> {
  const transcript: ConversationMessage[] = request.responses.map((entry) => ({
    speaker: entry.channel === 'voice' ? 'member_voice' : 'member_sms',
    text: `${entry.prompt} ${entry.reply}`,
    timestamp: entry.timestamp,
  }));

  const detection = await detectConversation({ memberId: request.memberId, transcript });
  const priority = pickPriority(detection);
  const alerts = buildActionPlan(detection);
  const email = await sendEmail({
    to: request.notifyEmails,
    subject: `Check-in ${request.checkInId ?? ''} status for ${request.memberId}`.trim(),
    text: buildSummaryText(detection),
    html: `
      <p>Priority: <strong>${priority}</strong></p>
      ${buildEmailTable(detection)}
      <h3>Actions</h3>
      <ul>${alerts.map((alert) => `<li>${alert}</li>`).join('')}</ul>
    `,
    customArgs: {
      memberId: request.memberId,
      scenario: 'monitoring',
    },
  });

  return { detection, priority, alerts, email };
}

export async function processCareTeamAlert(
  request: CareTeamAlertRequest
): Promise<CareTeamAlertResponse> {
  const detection = await detectConversation({ memberId: request.memberId, transcript: request.transcript });
  const highRisk = detection.issues.filter((issue) => issue.urgency === 'high' || issue.severity === 'high');
  const severity = highRisk.length >= 2 ? 'critical' : highRisk.length === 1 ? 'warning' : 'info';
  const summary =
    highRisk.length > 0
      ? `Multiple high-risk SDOH issues detected: ${highRisk.map((issue) => issue.label).join(', ')}.`
      : 'No high-risk SDOH findings in latest review.';

  const email = await sendEmail({
    to: request.notifyEmails,
    subject: `Care team alert for ${request.memberId}`,
    text: `${summary}\n${buildSummaryText(detection)}`,
    html: `
      <p>Severity: <strong>${severity}</strong></p>
      ${buildEmailTable(detection)}
      ${request.dashboardUrl ? `<p><a href="${request.dashboardUrl}">Open in dashboard</a></p>` : ''}
    `,
    customArgs: {
      memberId: request.memberId,
      scenario: 'care-team-alert',
    },
  });

  return {
    detection,
    alert: {
      severity,
      summary,
      dashboardUrl: request.dashboardUrl,
    },
    email,
  };
}

export async function processPopulationHealth(
  request: PopulationHealthRequest
): Promise<PopulationHealthResponse> {
  const detections: DetectionResponse[] = [];
  for (const cohortMember of request.cohort) {
    const detection = await detectConversation({
      memberId: cohortMember.memberId,
      transcript: cohortMember.transcript,
      context: cohortMember.context,
    });
    detections.push(detection);
  }

  const issueCounts = new Map<string, { code: string; label: string; count: number }>();
  let potentialRevenue = 0;
  for (const detection of detections) {
    for (const issue of detection.issues) {
      potentialRevenue += issue.estimatedRevenue;
      const current = issueCounts.get(issue.code) ?? { code: issue.code, label: issue.label, count: 0 };
      current.count += 1;
      issueCounts.set(issue.code, current);
    }
  }

  const topIssues = Array.from(issueCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const highRiskMembers = detections.filter((detection) =>
    detection.issues.some((issue) => issue.severity === 'high' || issue.urgency === 'high')
  ).length;

  return {
    tenantId: request.tenantId,
    detections,
    metrics: {
      highRiskMembers,
      totalMembers: request.cohort.length,
      potentialRevenue: parseFloat(potentialRevenue.toFixed(2)),
      topIssues,
    },
  };
}

export async function processPostDischarge(
  request: PostDischargeRequest
): Promise<PostDischargeResponse> {
  const transcript: ConversationMessage[] = [
    ...(request.dischargeSummary ? [{ speaker: 'summary', text: request.dischargeSummary }] : []),
    { speaker: 'member', text: request.memberReply },
  ];

  const detection = await detectConversation({
    memberId: request.memberId,
    transcript,
    context: { encounterId: request.encounterId },
  });

  const reply = detection.issues.length
    ? 'We will connect you with our social work team right away to help with medications and groceries.'
    : 'Thank you for the update. Let us know if anything changes.';

  const sms = await sendSms({ to: request.memberPhone, from: request.fromNumber, body: reply });
  const email = await sendEmail({
    to: request.careTeamEmail,
    subject: `Post-discharge SDOH follow-up for ${request.memberId}`,
    text: buildSummaryText(detection),
    html: `
      <p>Member reply:</p>
      <blockquote>${request.memberReply}</blockquote>
      ${buildEmailTable(detection)}
    `,
    customArgs: {
      memberId: request.memberId,
      scenario: 'post-discharge',
    },
  });

  return { detection, autoReply: reply, sms, email };
}

export type {
  CareCoordinationCallRequest,
  CareCoordinationCallResponse,
  SmsScreeningRequest,
  SmsScreeningResponse,
  EhrIntakeRequest,
  EhrIntakeResponse,
  MonitoringRequest,
  MonitoringResponse,
  CareTeamAlertRequest,
  CareTeamAlertResponse,
  PopulationHealthRequest,
  PopulationHealthResponse,
  PostDischargeRequest,
  PostDischargeResponse,
};
