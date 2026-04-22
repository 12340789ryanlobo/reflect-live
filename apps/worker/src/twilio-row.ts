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
}

export async function toRow(
  m: TwilioMessageLike,
  cache: PhoneCache,
  defaultTeamId: number,
): Promise<MessageRow> {
  const playerPhone = m.direction === 'inbound' ? m.from : m.to;
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
  };
}
