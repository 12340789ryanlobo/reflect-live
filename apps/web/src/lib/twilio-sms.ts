/**
 * Minimal Twilio REST client for sending SMS from the Next.js runtime.
 * Avoids pulling the full `twilio` npm package into the web bundle —
 * we're only sending one SMS per OTP, REST is fine.
 *
 * Credentials come from per-team config (teams.twilio_*) when set, else
 * fall back to the TWILIO_* env vars shared with the worker.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export async function getTwilioConfigForTeam(sb: SupabaseClient, teamId: number): Promise<TwilioConfig> {
  const { data: team } = await sb
    .from('teams')
    .select('twilio_account_sid,twilio_auth_token,twilio_phone_number')
    .eq('id', teamId)
    .maybeSingle();

  const accountSid = team?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = team?.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = team?.twilio_phone_number || process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      'Twilio is not configured for this team or globally. Set team credentials in Admin → Teams, or TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER env vars.',
    );
  }
  return { accountSid, authToken, fromNumber };
}

export async function sendSms(cfg: TwilioConfig, toE164: string, body: string): Promise<void> {
  const authHeader = 'Basic ' + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
  const params = new URLSearchParams({
    To: toE164,
    From: cfg.fromNumber,
    Body: body,
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    },
  );
  if (!res.ok) {
    const text = await res.text();
    let msg = `Twilio responded ${res.status}`;
    try {
      const j = JSON.parse(text);
      msg = j.message ?? msg;
    } catch {
      msg = `${msg}: ${text.slice(0, 200)}`;
    }
    throw new Error(msg);
  }
}

/**
 * Normalize a user-supplied phone to E.164. Accepts common formats:
 *  - "(321) 406-2958" → "+13214062958" (assumes US if 10 digits)
 *  - "+61 452 543 234" → "+61452543234"
 *  - "13214062958" → "+13214062958"
 */
export function toE164(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  }
  if (cleaned.length === 10) return '+1' + cleaned;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return '+' + cleaned;
  if (cleaned.length >= 8) return '+' + cleaned;
  return null;
}
