import twilio from 'twilio';
import { createServiceClient } from './supabase';
import { PhoneCache } from './phone-cache';
import { pollOnce } from './poll';
import { pollWeatherOnce } from './poll-weather';
import { pollNewsOnce } from './poll-news';
import { updateWorkerState } from './state';
import { pollScheduledSends, pollReminders } from './survey-scheduler';

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 15000);
const WEATHER_INTERVAL_MS = Number(process.env.WEATHER_INTERVAL_MS ?? 600000);
const NEWS_INTERVAL_MS = Number(process.env.NEWS_INTERVAL_MS ?? 1800000); // 30 min
const SURVEY_INTERVAL_MS = Number(process.env.SURVEY_INTERVAL_MS ?? 60000); // 1 min
const BACKFILL_DAYS = Number(process.env.BACKFILL_DAYS ?? 90);
const DEFAULT_TEAM_ID = 1;

let running = true;
let twilioErrors = 0;
let weatherErrors = 0;
let newsErrors = 0;
let surveyErrors = 0;

async function loadPhones(sb: ReturnType<typeof createServiceClient>) {
  return async () => {
    const { data, error } = await sb.from('players').select('phone_e164,id,team_id');
    if (error) throw error;
    const map = new Map<string, { id: number; team_id: number }>();
    for (const row of data ?? []) map.set(row.phone_e164, { id: row.id, team_id: row.team_id });
    return map;
  };
}

function backoff(base: number, errors: number): number {
  if (errors < 1) return base;
  return Math.min(base * 2 ** Math.min(errors, 5), 5 * 60 * 1000);
}

async function twilioLoop(sb: ReturnType<typeof createServiceClient>, tw: ReturnType<typeof twilio>, cache: PhoneCache) {
  while (running) {
    try {
      const n = await pollOnce({ sb, twilio: tw, cache, defaultTeamId: DEFAULT_TEAM_ID, backfillDays: BACKFILL_DAYS });
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

async function newsLoop(sb: ReturnType<typeof createServiceClient>) {
  while (running) {
    try {
      const n = await pollNewsOnce(sb);
      console.log('[news] polled, %d items', n);
      newsErrors = 0;
    } catch (err) {
      newsErrors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[news] error (%d): %s', newsErrors, msg);
    }
    await new Promise((r) => setTimeout(r, backoff(NEWS_INTERVAL_MS, newsErrors)));
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

  process.on('SIGTERM', () => { running = false; });
  process.on('SIGINT', () => { running = false; });

  const outboundEnabled = process.env.TWILIO_OUTBOUND_ENABLED === 'true';
  console.log(
    '[worker] starting. twilio=%dms weather=%dms news=%dms survey=%dms outbound=%s',
    POLL_INTERVAL_MS, WEATHER_INTERVAL_MS, NEWS_INTERVAL_MS, SURVEY_INTERVAL_MS,
    outboundEnabled ? 'enabled' : 'shadow',
  );

  await Promise.all([
    twilioLoop(sb, tw, cache),
    weatherLoop(sb),
    newsLoop(sb),
    surveyLoop(sb, tw),
  ]);

  console.log('[worker] shutdown');
}

main().catch((e) => {
  console.error('[worker] fatal', e);
  process.exit(1);
});
