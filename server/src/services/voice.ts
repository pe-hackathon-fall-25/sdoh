import { URLSearchParams } from 'url';

type VoiceCallRequest = {
  to: string;
  from?: string | null;
  twimlUrl: string;
  statusCallbackUrl?: string;
  machineDetection?: 'Enable' | 'DetectMessageEnd';
};

type VoiceCallResult = {
  sid?: string;
  status?: string;
  accountSid?: string;
  preview?: {
    to: string;
    from?: string | null;
    twimlUrl: string;
    statusCallbackUrl?: string;
  };
  error?: string;
};

function missingCredentials(): boolean {
  return !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN;
}

export async function initiateVoiceCall(params: VoiceCallRequest): Promise<VoiceCallResult> {
  const from = params.from || process.env.TWILIO_FROM_NUMBER || null;
  if (missingCredentials() || !from) {
    const preview = {
      to: params.to,
      from,
      twimlUrl: params.twimlUrl,
      statusCallbackUrl: params.statusCallbackUrl,
    };
    console.info('[voice] Twilio credentials missing – returning preview', preview);
    return { preview };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID as string;
  const authToken = process.env.TWILIO_AUTH_TOKEN as string;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;

  const payload = new URLSearchParams({
    To: params.to,
    From: from,
    Url: params.twimlUrl,
  });

  if (params.statusCallbackUrl) {
    payload.append('StatusCallback', params.statusCallbackUrl);
    payload.append('StatusCallbackMethod', 'POST');
    payload.append('StatusCallbackEvent', 'initiated ringing answered completed');
  }

  if (params.machineDetection) {
    payload.append('MachineDetection', params.machineDetection);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[voice] Twilio API error', response.status, errorText);
    return { error: `Twilio request failed: ${errorText}` };
  }

  const data = (await response.json()) as { sid?: string; status?: string; account_sid?: string };
  return {
    sid: data.sid,
    status: data.status,
    accountSid: data.account_sid,
  };
}
