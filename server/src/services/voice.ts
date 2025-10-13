import { URLSearchParams } from 'url';

type VoiceCallRequest = {
  to: string;
  from?: string;
  url?: string;
  twiml?: string;
  record?: boolean;
  statusCallback?: string;
};

type VoiceCallResult = {
  provider: 'twilio' | 'stub';
  sid: string;
  status: string;
  delivered: boolean;
  preview?: {
    to: string;
    from?: string;
    url?: string;
    twiml?: string;
  };
  error?: string;
};

export async function initiateVoiceCall(payload: VoiceCallRequest): Promise<VoiceCallResult> {
  const fromNumber = payload.from || process.env.TWILIO_FROM_NUMBER || undefined;

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !fromNumber) {
    const sid = `preview-${Date.now().toString(36)}`;
    const preview = { to: payload.to, from: fromNumber, url: payload.url, twiml: payload.twiml };
    console.info('[voice] Twilio env missing – returning preview', preview);
    return { provider: 'stub', sid, status: 'queued', delivered: false, preview, error: 'Twilio credentials not configured' };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls.json`;
  const params = new URLSearchParams({
    To: payload.to,
    From: fromNumber,
  });

  if (payload.url) {
    params.set('Url', payload.url);
  }

  if (payload.twiml) {
    params.set('Twiml', payload.twiml);
  }

  if (payload.record) {
    params.set('Record', 'true');
  }

  if (payload.statusCallback) {
    params.set('StatusCallback', payload.statusCallback);
  }

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
    console.error('[voice] Twilio call error', response.status, errorText);
    const sid = `preview-${Date.now().toString(36)}`;
    return {
      provider: 'twilio',
      sid,
      status: 'failed',
      delivered: false,
      error: `Twilio call failed: ${errorText}`,
    };
  }

  const data = (await response.json()) as { sid?: string; status?: string };
  return {
    provider: 'twilio',
    sid: data.sid || `twilio-${Date.now().toString(36)}`,
    status: data.status || 'queued',
    delivered: true,
  };
}

export type { VoiceCallRequest, VoiceCallResult };
