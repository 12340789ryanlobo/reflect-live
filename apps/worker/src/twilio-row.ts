import { categorize } from './categorize';
import type { PhoneCache, PlayerRef } from './phone-cache';

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

// Choose which roster row a message belongs to when a phone maps to more
// than one team (a multi-team athlete). Disambiguate by the team-side
// Twilio number the message used; fall back to the lowest team_id so a
// tie is at least stable across polls (never the non-deterministic
// "whichever team loaded last" the map used to give). Unknown → null.
export function pickTeam(
  candidates: PlayerRef[],
  teamSideNumber: string | null,
  teamNumbers: Map<number, string>,
): PlayerRef | null {
  if (candidates.length <= 1) return candidates[0] ?? null;
  if (teamSideNumber) {
    const match = candidates.find((c) => teamNumbers.get(c.team_id) === teamSideNumber);
    if (match) return match;
  }
  return [...candidates].sort((a, b) => a.team_id - b.team_id)[0];
}

export async function toRow(
  m: TwilioMessageLike,
  cache: PhoneCache,
  teamNumbers: Map<number, string>,
): Promise<MessageRow> {
  const rawPhone = m.direction === 'inbound' ? m.from : m.to;
  const playerPhone = normalizePhone(rawPhone);
  const candidates = playerPhone ? await cache.lookupAll(playerPhone) : [];
  // The team-side number is the other end of the message: an inbound text
  // arrives AT the team's Twilio number (m.to); an outbound is sent FROM
  // it (m.from).
  const teamSideNumber = normalizePhone(m.direction === 'inbound' ? m.to : m.from);
  const ref = pickTeam(candidates, teamSideNumber, teamNumbers);
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
    // Unknown senders (on no roster) stay unassigned rather than defaulting
    // onto team 1, which used to leak wrong-number/spam texts into team 1's
    // dashboard.
    team_id: ref?.team_id ?? null,
    media_sids: m.mediaSids && m.mediaSids.length > 0 ? m.mediaSids : null,
  };
}
