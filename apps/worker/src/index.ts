import twilio from 'twilio';
import { createServiceClient } from './supabase';
import { PhoneCache, type PlayerRef } from './phone-cache';
import { normalizePhone } from './twilio-row';
import { pollOnce } from './poll';
import { pollWeatherOnce } from './poll-weather';
import { updateWorkerState } from './state';
import { pollScheduledSends, pollReminders } from './survey-scheduler';

// Parse a positive-integer env var, falling back on missing/malformed values.
// Bare Number('15s') is NaN, and setTimeout(NaN) fires immediately — a tight
// loop hammering Twilio/Supabase every tick — so guard against it.
function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const POLL_INTERVAL_MS = envInt('POLL_INTERVAL_MS', 15000);
const WEATHER_INTERVAL_MS = envInt('WEATHER_INTERVAL_MS', 600000);
const SURVEY_INTERVAL_MS = envInt('SURVEY_INTERVAL_MS', 60000); // 1 min
const BACKFILL_DAYS = envInt('BACKFILL_DAYS', 90);

let running = true;
let twilioErrors = 0;
let weatherErrors = 0;
let surveyErrors = 0;

async function loadPhones(sb: ReturnType<typeof createServiceClient>) {
  return async () => {
    // Pull phones from player_phones (includes alternates for international
    // students with US + home-country numbers). Joining to players lets us
    // surface team_id without a second query. Falls back to the legacy
    // players.phone_e164 column for any players who don't yet have a
    // player_phones row (defensive — the migration backfills these).
    //
    // A phone maps to a *list* of refs: an athlete on more than one team
    // (same number) contributes one ref per team, so a shared number no
    // longer silently overwrites down to a single team.
    const map = new Map<string, PlayerRef[]>();
    const add = (e164: string, ref: PlayerRef) => {
      const list = map.get(e164);
      if (!list) map.set(e164, [ref]);
      else if (!list.some((r) => r.id === ref.id)) list.push(ref);
    };
    const { data: pp, error: ppErr } = await sb
      .from('player_phones')
      .select('e164, players!inner(id,team_id)');
    if (ppErr) throw ppErr;
    for (const row of (pp ?? []) as Array<{ e164: string; players: { id: number; team_id: number } }>) {
      if (row.e164 && row.players) add(row.e164, { id: row.players.id, team_id: row.players.team_id });
    }
    // Defensive fallback for any players that somehow have a phone_e164 but
    // no player_phones row. Deduped by player id, so it's a no-op when the
    // player already came through player_phones.
    const { data: legacy } = await sb.from('players').select('phone_e164,id,team_id');
    for (const row of (legacy ?? []) as Array<{ phone_e164: string | null; id: number; team_id: number }>) {
      if (row.phone_e164) add(row.phone_e164, { id: row.id, team_id: row.team_id });
    }
    return map;
  };
}

// team_id → that team's normalized Twilio number. Used to disambiguate a
// message from a multi-team athlete: the message's team-side number tells
// us which team it belongs to. Loaded once at startup — a team's Twilio
// number is effectively static config, and single-team athletes (the
// common case) don't need it at all.
async function loadTeamNumbers(sb: ReturnType<typeof createServiceClient>): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const { data, error } = await sb.from('teams').select('id, twilio_phone_number');
  if (error) throw error;
  for (const t of (data ?? []) as Array<{ id: number; twilio_phone_number: string | null }>) {
    const n = normalizePhone(t.twilio_phone_number);
    if (n) map.set(t.id, n);
  }
  return map;
}

function backoff(base: number, errors: number): number {
  if (errors < 1) return base;
  // Never back off to *less* than the base interval: for the weather (10m) and
  // news (30m) loops a bare 5-minute cap sat below base, so errors sped them up
  // — hammering a failing upstream. Grow from base, cap at max(base, 5m).
  return Math.max(base, Math.min(base * 2 ** Math.min(errors, 5), 5 * 60 * 1000));
}

async function twilioLoop(
  sb: ReturnType<typeof createServiceClient>,
  tw: ReturnType<typeof twilio>,
  cache: PhoneCache,
  teamNumbers: Map<number, string>,
) {
  while (running) {
    try {
      const n = await pollOnce({ sb, twilio: tw, cache, teamNumbers, backfillDays: BACKFILL_DAYS });
      console.log('[twilio] polled, %d messages', n);
      twilioErrors = 0;
    } catch (err) {
      twilioErrors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[twilio] error (%d): %s', twilioErrors, msg);
      try {
        await updateWorkerState(sb, {
          last_error: msg,
          consecutive_errors: twilioErrors,
          last_twilio_poll_at: new Date().toISOString(),
        });
      } catch {/* swallow */}
    }
    await new Promise((r) => setTimeout(r, backoff(POLL_INTERVAL_MS, twilioErrors)));
  }
}

async function weatherLoop(sb: ReturnType<typeof createServiceClient>) {
  while (running) {
    try {
      const n = await pollWeatherOnce(sb);
      console.log('[weather] polled, %d snapshots', n);
      weatherErrors = 0;
    } catch (err) {
      weatherErrors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[weather] error (%d): %s', weatherErrors, msg);
      try {
        await updateWorkerState(sb, {
          last_error: msg,
          last_weather_poll_at: new Date().toISOString(),
        });
      } catch {/* swallow */}
    }
    await new Promise((r) => setTimeout(r, backoff(WEATHER_INTERVAL_MS, weatherErrors)));
  }
}

async function surveyLoop(
  sb: ReturnType<typeof createServiceClient>,
  tw: ReturnType<typeof twilio>,
) {
  while (running) {
    try {
      const sent = await pollScheduledSends(sb, tw);
      const rem = await pollReminders(sb, tw);
      if (sent.processed > 0 || rem.processed > 0) {
        console.log(
          '[survey] sends processed=%d dispatched=%d errors=%d · reminders processed=%d errors=%d',
          sent.processed, sent.dispatched, sent.errors, rem.processed, rem.errors,
        );
      }
      surveyErrors = 0;
    } catch (err) {
      surveyErrors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[survey] error (%d): %s', surveyErrors, msg);
    }
    await new Promise((r) => setTimeout(r, backoff(SURVEY_INTERVAL_MS, surveyErrors)));
  }
}

async function main() {
  const sb = createServiceClient();
  const tw = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  const cache = new PhoneCache(await loadPhones(sb), 5 * 60 * 1000);
  const teamNumbers = await loadTeamNumbers(sb);

  process.on('SIGTERM', () => { running = false; });
  process.on('SIGINT', () => { running = false; });

  const outboundEnabled = process.env.TWILIO_OUTBOUND_ENABLED === 'true';
  console.log(
    '[worker] starting. twilio=%dms weather=%dms survey=%dms outbound=%s',
    POLL_INTERVAL_MS, WEATHER_INTERVAL_MS, SURVEY_INTERVAL_MS,
    outboundEnabled ? 'enabled' : 'shadow',
  );

  await Promise.all([
    twilioLoop(sb, tw, cache, teamNumbers),
    weatherLoop(sb),
    surveyLoop(sb, tw),
  ]);

  console.log('[worker] shutdown');
}

main().catch((e) => {
  console.error('[worker] fatal', e);
  process.exit(1);
});
