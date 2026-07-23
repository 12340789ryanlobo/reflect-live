// Cross-check: are there any phone numbers in twilio_messages that DON'T
// match a player in our reflect-live DB? Those would be people who texted
// reflect's Twilio number but aren't on our roster — i.e. potentially missed
// legacy athletes.
//
// We only have read access to twilio_messages (which the worker has been
// pulling all along). reflect's prod API would give the authoritative
// answer but we need REFLECT_ADMIN_KEY for that.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('apps/web/.env.local', 'utf8');
const get = (k: string) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))![1].trim();
const sb = createClient(
  get('NEXT_PUBLIC_SUPABASE_URL'),
  get('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

// Normalize: strip whatsapp: prefix; everything compared by E.164 only.
const norm = (raw: string | null): string | null => {
  if (!raw) return null;
  return raw.replace(/^whatsapp:/, '');
};

// All player phones we know about (keyed by normalized E.164).
const { data: players } = await sb
  .from('players')
  .select('id,name,phone_e164,team_id,gender,active');
const phoneToPlayer = new Map<string, { id: number; name: string; team_id: number; gender: string | null; active: boolean }>();
for (const p of players ?? []) {
  const ph = norm(p.phone_e164);
  if (ph) phoneToPlayer.set(ph, p as never);
}

// Pull every distinct inbound from_number from twilio_messages.
// Page through — supabase caps individual selects at 1000 rows.
const inboundFromCounts = new Map<string, { count: number; firstSeen: string; lastSeen: string; sample: string }>();
const PAGE = 1000;
let off = 0;
let pages = 0;
while (true) {
  const { data: msgs } = await sb
    .from('twilio_messages')
    .select('from_number,direction,body,date_sent,player_id')
    .eq('direction', 'inbound')
    .order('date_sent', { ascending: false })
    .range(off, off + PAGE - 1);
  if (!msgs || msgs.length === 0) break;
  pages++;
  for (const m of msgs) {
  const phone = norm(m.from_number);
  if (!phone) continue;
  const cur = inboundFromCounts.get(phone);
  if (cur) {
    cur.count += 1;
    if (m.date_sent < cur.firstSeen) cur.firstSeen = m.date_sent;
    if (m.date_sent > cur.lastSeen) cur.lastSeen = m.date_sent;
  } else {
    inboundFromCounts.set(phone, {
      count: 1,
      firstSeen: m.date_sent,
      lastSeen: m.date_sent,
      sample: (m.body ?? '').slice(0, 60),
    });
  }
  }
  if (msgs.length < PAGE) break;
  off += PAGE;
}
console.log(`scanned ${pages} pages of inbound twilio_messages`);

console.log(`distinct inbound phones in twilio_messages: ${inboundFromCounts.size}`);
console.log(`our player roster: ${phoneToPlayer.size} phones\n`);

const orphan: Array<{ phone: string; count: number; firstSeen: string; lastSeen: string; sample: string }> = [];
for (const [phone, info] of inboundFromCounts) {
  if (!phoneToPlayer.has(phone)) {
    orphan.push({ phone, ...info });
  }
}

console.log(`=== ORPHAN PHONES (texted reflect but not in our roster): ${orphan.length} ===`);
orphan.sort((a, b) => b.count - a.count);
for (const o of orphan) {
  console.log(`  ${o.phone}  msgs=${String(o.count).padStart(4)}  ${o.firstSeen.slice(0, 10)} → ${o.lastSeen.slice(0, 10)}  sample: ${o.sample}`);
}

// Filter: anything with ≥5 messages spanning ≥7 days is plausibly an athlete
// (one-off "wrong number" testers don't sustain that). Show only those.
const interesting = orphan.filter((o) => {
  const daysSpan = (Date.parse(o.lastSeen) - Date.parse(o.firstSeen)) / 86_400_000;
  return o.count >= 5 && daysSpan >= 7;
});
console.log(`\n=== INTERESTING ORPHANS (≥5 msgs spanning ≥7 days, not in roster): ${interesting.length} ===`);
for (const o of interesting) {
  console.log(`  ${o.phone.padEnd(18)}  msgs=${String(o.count).padStart(4)}  ${o.firstSeen.slice(0, 10)} → ${o.lastSeen.slice(0, 10)}  sample: ${o.sample}`);
}

// Inverse: players who never texted (could have been auto-deactivated, or never used).
console.log('\n=== PLAYERS WITH NO INBOUND MESSAGES IN TWILIO ===');
const phonesWithMsgs = new Set(inboundFromCounts.keys());
for (const [phone, p] of phoneToPlayer) {
  if (!phonesWithMsgs.has(phone)) {
    console.log(`  ${phone}  #${p.id} ${p.name.padEnd(28)} team=${p.team_id} gender=${p.gender} active=${p.active}`);
  }
}
