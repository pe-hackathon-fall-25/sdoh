import { URLSearchParams } from 'url';

type EmailPayload = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  categories?: string[];
  customArgs?: Record<string, string>;
  from?: string;
};

type EmailResult = {
  delivered: boolean;
  provider: 'sendgrid' | 'stub';
  messageId?: string;
  status?: number;
  preview?: {
    to: string[];
    subject: string;
    text: string;
    html?: string;
  };
  error?: string;
};

type SmsPayload = {
  to: string;
  body: string;
  from?: string;
};

type SmsResult = {
  delivered: boolean;
  provider: 'twilio' | 'stub';
  sid?: string;
  status?: number;
  preview?: {
    to: string;
    from?: string;
    body: string;
  };
  error?: string;
};

function normalizeRecipients(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const to = normalizeRecipients(payload.to);
  const fromEmail =
    payload.from || process.env.SENDGRID_FROM_EMAIL || 'sdoh-bridge@example.com';

  if (!process.env.SENDGRID_API_KEY) {
    const preview = { to, subject: payload.subject, text: payload.text, html: payload.html };
    console.info('[notifications] SENDGRID_API_KEY missing – returning preview', preview);
    return { delivered: false, provider: 'stub', preview, error: 'SENDGRID_API_KEY not configured' };
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: to.map((email) => ({ email })),
          custom_args: payload.customArgs,
          categories: payload.categories,
        },
      ],
      from: { email: fromEmail },
      subject: payload.subject,
      content: [
        { type: 'text/plain', value: payload.text },
        ...(payload.html ? [{ type: 'text/html', value: payload.html }] : []),
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const preview = { to, subject: payload.subject, text: payload.text, html: payload.html };
    console.error('[notifications] SendGrid API error', response.status, errorText);
    return {
      delivered: false,
      provider: 'sendgrid',
      status: response.status,
      preview,
      error: `SendGrid request failed: ${errorText}`,
    };
  }

  return {
    delivered: true,
    provider: 'sendgrid',
    status: response.status,
    messageId: response.headers.get('x-message-id') || undefined,
  };
}

export async function sendSms(payload: SmsPayload): Promise<SmsResult> {
  const fromNumber = payload.from || process.env.TWILIO_FROM_NUMBER;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !fromNumber) {
    const preview = { to: payload.to, from: fromNumber, body: payload.body };
    console.info('[notifications] Twilio env missing – returning preview', preview);
    return { delivered: false, provider: 'stub', preview, error: 'Twilio credentials not configured' };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const params = new URLSearchParams({
    To: payload.to,
    From: fromNumber,
    Body: payload.body,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const preview = { to: payload.to, from: fromNumber, body: payload.body };
    console.error('[notifications] Twilio API error', response.status, errorText);
    return {
      delivered: false,
      provider: 'twilio',
      status: response.status,
      preview,
      error: `Twilio request failed: ${errorText}`,
    };
  }

  const data = (await response.json()) as { sid?: string };
  return {
    delivered: true,
    provider: 'twilio',
    status: response.status,
    sid: data.sid,
  };
}

export type { EmailPayload, EmailResult, SmsPayload, SmsResult };
