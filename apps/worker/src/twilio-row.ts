import { categorize } from './categorize';
import type { PhoneCache } from './phone-cache';

export interface TwilioMessageLike {
  sid: string;
  direction: 'inbound' | 'outbound-api' | 'outbound-reply' | string;
  from: string | null;
  to: string | null;
  body: string | null;
  status: string | null;
  dateSent: Date;
  /** Twilio Media SIDs attached to this message. Populated upstream
   *  by the poll loop (an extra API call per message-with-media). */
  mediaSids?: string[];
}

export interface MessageRow {
  sid: string;
  direction: string;
  from_number: string | null;
  to_number: string | null;
  body: string | null;
  status: string | null;
  category: 'workout' | 'rehab' | 'survey' | 'chat';
  date_sent: string;
  player_id: number | null;
  team_id: number | null;
  media_sids: string[] | null;
}

export function normalizePhone(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/^(whatsapp|sms):/i, '');
}

export async function toRow(
  m: TwilioMessageLike,
  cache: PhoneCache,
  defaultTeamId: number,
): Promise<MessageRow> {
  const rawPhone = m.direction === 'inbound' ? m.from : m.to;
  const playerPhone = normalizePhone(rawPhone);
  const ref = playerPhone ? await cache.lookup(playerPhone) : null;
  return {
    sid: m.sid,
    direction: m.direction,
    from_number: m.from,
    to_number: m.to,
    body: m.body,
    status: m.status,
    category: categorize(m.body),
    date_sent: m.dateSent.toISOString(),
    player_id: ref?.id ?? null,
    team_id: ref?.team_id ?? defaultTeamId,
    media_sids: m.mediaSids && m.mediaSids.length > 0 ? m.mediaSids : null,
  };
}
