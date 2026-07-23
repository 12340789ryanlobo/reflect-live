// One-shot import of reflect's historical session data via reflect's
// production REST API. Use this when the SQLite snapshot route (railway
// ssh + sqlite3 .backup) is unavailable.
//
// Imports (swim team only, scoped by REFLECT_ADMIN_KEY):
//   - question_templates  (GET /admin/templates)
//   - sessions            (per-id GET /admin/sessions/{id}/summary)
//   - deliveries          (per-id GET /admin/sessions/{id}/summary)
//   - responses           (per-id GET /admin/sessions/{id}/responses)
//
// Session id discovery: every response in /admin/export/responses CSV
// carries its session_id, so the unique session_ids from that CSV give
// us the universe of sessions ever seen.
//
// What's NOT imported via the API: flags (no admin endpoint exposes
// them) and scheduled_sends (transient, irrelevant to backfill). Flags
// can be re-derived by running the engine over imported responses if
// needed later.
//
// Idempotency: same as backfill-sessions.ts —
//   - templates dedupe on (team_id, name)
//   - sessions stamp metadata_json.reflect_session_id; later runs skip
//   - deliveries dedupe on (session_id, player_id) unique index
//   - responses dedupe on (session, player, question_id, created_at)
//
// Run:
//   REFLECT_URL=https://reflectsalus.app \
//   REFLECT_ADMIN_KEY=... \
//   bun run scripts/backfill-sessions-via-api.ts [--dry-run]
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are read from
// apps/worker/.env.local (same pattern as the other backfill scripts).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync(join(import.meta.dir, '..', 'apps', 'worker', '.env.local'), 'utf8');
const get = (k: string): string => {
  const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'));
  if (!m) throw new Error(`missing ${k}`);
  return m[1].trim();
};
const sb = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

const DRY = process.argv.includes('--dry-run');
const SWIM_TEAM_CODE = 'uchicago-swim';
const REFLECT_URL = (process.env.REFLECT_URL ?? 'https://reflectsalus.app').replace(/\/$/, '');
const ADMIN_KEY = process.env.REFLECT_ADMIN_KEY;
if (!ADMIN_KEY) throw new Error('REFLECT_ADMIN_KEY required');

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${REFLECT_URL}${path}`, {
    headers: { 'X-Admin-Key': ADMIN_KEY! },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function apiText(path: string): Promise<string> {
  const res = await fetch(`${REFLECT_URL}${path}`, {
    headers: { 'X-Admin-Key': ADMIN_KEY! },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${res.statusText}`);
  return res.text();
}

interface ApiTemplate {
  id: number;
  team_id: number;
  name: string;
  session_type: string;
  questions_json: string;
  is_default: number;
  created_at: string;
}

interface ApiSessionRow {
  id: number;
  team_id: number;
  type: string;
  label: string;
  template_id: number | null;
  metadata_json: string | null;
  video_links_json: string | null;
  created_at: string;
  deleted_at: string | null;
}

interface ApiDelivery {
  id: number;
  session_id: number;
  player_id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  current_q_idx: number;
  reminder_sent_at: string | null;
  session_type: string | null;
  created_at: string;
  player_name: string;
}

interface ApiResponse {
  id: number;
  question_id: string;
  answer_raw: string;
  answer_num: number | null;
  created_at: string;
  player_name: string;
  player_phone: string;
}

/**
 * Pull every distinct session_id from the responses CSV. Reflect's API
 * caps /admin/sessions at 20 rows; the export endpoint gives us the
 * full universe instead.
 */
function uniqueSessionIdsFromCsv(csv: string): number[] {
  const lines = csv.split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = lines[0].split(',');
  const sessionIdCol = header.indexOf('session_id');
  if (sessionIdCol < 0) throw new Error('responses CSV missing session_id column');
  const ids = new Set<number>();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    // CSV is simple — no embedded commas in numeric session_id col
    const cols = lines[i].split(',');
    const id = Number(cols[sessionIdCol]);
    if (Number.isInteger(id)) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

async function main() {
  console.log(`[api] base=${REFLECT_URL}`);

  // ---- 1. resolve live team ----
  const { data: liveTeam } = await sb.from('teams').select('id').eq('code', SWIM_TEAM_CODE).maybeSingle();
  if (!liveTeam) throw new Error(`live team with code ${SWIM_TEAM_CODE} not found`);
  const liveTeamId = liveTeam.id as number;

  // ---- 2. live player roster (phone → live id) ----
  const { data: livePlayers } = await sb
    .from('players')
    .select('id, phone_e164')
    .eq('team_id', liveTeamId);
  const livePidByPhone = new Map<string, number>();
  for (const p of (livePlayers ?? []) as { id: number; phone_e164: string }[]) {
    livePidByPhone.set(p.phone_e164, p.id);
  }
  console.log(`[players] live=${livePlayers?.length ?? 0}`);

  // ---- 3. templates ----
  const tplResp = await api<{ templates: ApiTemplate[] }>('/admin/templates');
  const apiTemplates = tplResp.templates ?? [];
  const templateIdMap = new Map<number, number>();
  let tplImported = 0; let tplSkipped = 0;
  for (const t of apiTemplates) {
    const { data: existing } = await sb
      .from('question_templates')
      .select('id')
      .eq('team_id', liveTeamId)
      .eq('name', t.name)
      .maybeSingle();
    if (existing) {
      templateIdMap.set(t.id, existing.id as number);
      tplSkipped += 1;
      continue;
    }
    let questions: unknown = [];
    try { questions = JSON.parse(t.questions_json); } catch { questions = []; }
    if (DRY) { tplImported += 1; continue; }
    const { data: ins, error } = await sb.from('question_templates').insert({
      team_id: liveTeamId,
      name: t.name,
      session_type: t.session_type,
      questions_json: questions,
      is_default: !!t.is_default,
    }).select('id').single();
    if (error) {
      console.warn(`[templates] skip "${t.name}": ${error.message}`);
      continue;
    }
    templateIdMap.set(t.id, ins.id as number);
    tplImported += 1;
  }
  console.log(`[templates] imported=${tplImported} skipped=${tplSkipped}`);

  // ---- 4. authoritative reflect player roster via /admin/export/players ----
  // The responses endpoint only carries phones for players who actually replied,
  // so deriving the reflect.player_id → phone map from responses misses anyone
  // who got the survey but never answered. Pull the full player export to get
  // an authoritative map up front, independent of response activity.
  const playersCsv = await apiText('/admin/export/players');
  const phoneByReflectPid = new Map<number, string>();
  {
    const rows = playersCsv.split(/\r?\n/);
    if (rows.length > 0) {
      const head = rows[0].split(',');
      const idCol = head.indexOf('id');
      // /admin/export/players exposes the column as `phone` (E.164 values);
      // tolerate `phone_e164` too in case reflect renames it later.
      const phoneCol = head.indexOf('phone') >= 0 ? head.indexOf('phone') : head.indexOf('phone_e164');
      if (idCol >= 0 && phoneCol >= 0) {
        for (let i = 1; i < rows.length; i++) {
          if (!rows[i]) continue;
          const cols = rows[i].split(',');
          const pid = Number(cols[idCol]);
          const phone = cols[phoneCol]?.trim();
          if (Number.isInteger(pid) && phone) phoneByReflectPid.set(pid, phone);
        }
      }
    }
  }
  console.log(`[players] reflect roster from /admin/export/players: ${phoneByReflectPid.size}`);

  // ---- 5. discover all session ids via the responses CSV ----
  const csv = await apiText('/admin/export/responses');
  const sessionIds = uniqueSessionIdsFromCsv(csv);
  console.log(`[sessions] discovered ${sessionIds.length} session_ids in /admin/export/responses`);

  // ---- 5. for each session_id: fetch summary + responses, upsert ----
  let sImported = 0; let sSkipped = 0;
  let dImported = 0; let dSkipped = 0; let dOrphan = 0;
  let rImported = 0; let rSkipped = 0; let rOrphan = 0;

  for (const reflectSid of sessionIds) {
    let summary: { session: ApiSessionRow; deliveries: ApiDelivery[] };
    try {
      summary = await api<{ session: ApiSessionRow; deliveries: ApiDelivery[] }>(
        `/admin/sessions/${reflectSid}/summary`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[sessions] reflect.id=${reflectSid} summary failed: ${msg}`);
      continue;
    }
    const s = summary.session;

    // Already imported?
    const { data: existing } = await sb
      .from('sessions')
      .select('id')
      .eq('team_id', liveTeamId)
      .filter('metadata_json->>reflect_session_id', 'eq', String(s.id))
      .maybeSingle();

    let liveSid: number | null;
    if (existing) {
      liveSid = existing.id as number;
      sSkipped += 1;
    } else if (DRY) {
      // No insert in dry-run, but keep iterating so we can still count
      // the deliveries/responses we WOULD have created. We don't have
      // a liveSid to dedupe against, so the counts here are upper-bound.
      liveSid = null;
      sImported += 1;
    } else {
      let parsedMeta: Record<string, unknown> = {};
      if (s.metadata_json) {
        try { parsedMeta = JSON.parse(s.metadata_json) as Record<string, unknown>; } catch {/* */}
      }
      parsedMeta.reflect_session_id = s.id;
      let videoLinks: unknown = null;
      if (s.video_links_json) {
        try { videoLinks = JSON.parse(s.video_links_json); } catch {/* */}
      }
      const { data: ins, error } = await sb.from('sessions').insert({
        team_id: liveTeamId,
        type: s.type,
        label: s.label,
        template_id: s.template_id ? templateIdMap.get(s.template_id) ?? null : null,
        metadata_json: parsedMeta,
        video_links_json: videoLinks,
        created_at: s.created_at,
        deleted_at: s.deleted_at,
      }).select('id').single();
      if (error) {
        console.warn(`[sessions] skip reflect.id=${s.id}: ${error.message}`);
        continue;
      }
      liveSid = ins.id as number;
      sImported += 1;
    }

    // Responses for this session — used directly to insert into reflect-live's
    // responses table. Player→phone mapping no longer derives from these rows;
    // it lives in the global phoneByReflectPid map built from the player export.
    let respList: ApiResponse[] = [];
    try {
      const r = await api<{ responses: ApiResponse[] }>(`/admin/sessions/${reflectSid}/responses`);
      respList = r.responses ?? [];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[responses] reflect.session=${reflectSid} fetch failed: ${msg}`);
    }

    function mapPlayer(reflectPid: number): number | null {
      const phone = phoneByReflectPid.get(reflectPid);
      if (!phone) return null;
      return livePidByPhone.get(phone) ?? null;
    }

    // Deliveries
    for (const d of summary.deliveries) {
      const livePid = mapPlayer(d.player_id);
      if (livePid === null) { dOrphan += 1; continue; }
      if (DRY) { dImported += 1; continue; }
      const { data: dEx } = await sb
        .from('deliveries')
        .select('id')
        .eq('session_id', liveSid)
        .eq('player_id', livePid)
        .maybeSingle();
      if (dEx) { dSkipped += 1; continue; }
      const { error } = await sb.from('deliveries').insert({
        session_id: liveSid,
        player_id: livePid,
        status: d.status,
        started_at: d.started_at,
        completed_at: d.completed_at,
        current_q_idx: d.current_q_idx,
        reminder_sent_at: d.reminder_sent_at,
        session_type: d.session_type,
        created_at: d.created_at,
      });
      if (error) {
        console.warn(`[deliveries] skip session=${liveSid} player=${livePid}: ${error.message}`);
        continue;
      }
      dImported += 1;
    }

    // Responses
    for (const r of respList) {
      const livePid = livePidByPhone.get(r.player_phone);
      if (!livePid) { rOrphan += 1; continue; }
      if (DRY) { rImported += 1; continue; }
      const { data: rEx } = await sb
        .from('responses')
        .select('id')
        .eq('session_id', liveSid)
        .eq('player_id', livePid)
        .eq('question_id', r.question_id)
        .eq('created_at', r.created_at)
        .maybeSingle();
      if (rEx) { rSkipped += 1; continue; }
      const { error } = await sb.from('responses').insert({
        session_id: liveSid,
        player_id: livePid,
        question_id: r.question_id,
        answer_raw: r.answer_raw,
        answer_num: r.answer_num,
        created_at: r.created_at,
      });
      if (error) {
        console.warn(`[responses] skip session=${liveSid} player=${livePid} q=${r.question_id}: ${error.message}`);
        continue;
      }
      rImported += 1;
    }
  }

  console.log(`[sessions]   imported=${sImported} skipped(existing)=${sSkipped}`);
  console.log(`[deliveries] imported=${dImported} skipped=${dSkipped} orphan=${dOrphan}`);
  console.log(`[responses]  imported=${rImported} skipped=${rSkipped} orphan=${rOrphan}`);
  console.log(DRY ? '\nDRY RUN — no rows written.' : '\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
