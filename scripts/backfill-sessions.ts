// One-shot import of reflect's historical session data into reflect-live.
//
// What it imports (for the swim team only):
//   - question_templates (matched on team_id + name)
//   - sessions             — stamped with metadata_json.reflect_session_id
//   - deliveries           — for swim players we already have on the live roster
//   - responses            — linked to mapped session_id + player_id
//   - flags                — linked to mapped session_id + player_id
//
// Idempotency: re-runs are safe. Each reflect session_id is recorded in
// reflect-live's metadata_json.reflect_session_id; subsequent runs skip
// sessions already present. Templates dedupe by (team_id, name).
// Deliveries dedupe via the session_id+player_id unique index.
// Responses/flags dedupe via (session, player, question_id|flag_type, created_at).
//
// scheduled_sends are NOT imported — they're transient operational events
// that already fired in reflect; importing past rows would just clutter
// the dashboard.
//
// Run: bun run scripts/backfill-sessions.ts [--dry-run]
// Requires: REFLECT_DB_COPY_PATH env (path to a *copy* of reflect's SQLite
// outside reflect/data/ — the path-guard refuses paths inside reflect/data/).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import { assertSafeReflectDbPath } from './path-guard';

const env = readFileSync(join(import.meta.dir, '..', 'apps', 'worker', '.env.local'), 'utf8');
const get = (k: string): string => {
  const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'));
  if (!m) throw new Error(`missing ${k}`);
  return m[1].trim();
};
const sb = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

const DRY = process.argv.includes('--dry-run');
const SWIM_TEAM_CODE = 'uchicago-swim';

interface ReflectSession {
  id: number;
  team_id: number;
  type: string;
  label: string;
  created_at: string;
  metadata_json: string | null;
  template_id: number | null;
  video_links_json: string | null;
  deleted_at: string | null;
}

interface ReflectDelivery {
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
}

interface ReflectResponse {
  id: number;
  session_id: number;
  player_id: number;
  question_id: string;
  answer_raw: string;
  answer_num: number | null;
  created_at: string;
}

interface ReflectFlag {
  id: number;
  session_id: number;
  player_id: number;
  flag_type: string;
  severity: string;
  details: string | null;
  created_at: string;
}

interface ReflectTemplate {
  id: number;
  team_id: number;
  name: string;
  session_type: string;
  questions_json: string;
  is_default: number;
  created_at: string;
}

async function main() {
  const reflectDbPath = process.env.REFLECT_DB_COPY_PATH;
  if (!reflectDbPath) throw new Error('REFLECT_DB_COPY_PATH not set');
  assertSafeReflectDbPath(reflectDbPath);
  if (!existsSync(reflectDbPath)) throw new Error(`copy missing: ${reflectDbPath}`);

  console.log(`[reflect] opening (read-only): ${reflectDbPath}`);
  const sqlite = new Database(reflectDbPath, { readonly: true, fileMustExist: true });

  try {
    // ---- 1. resolve team ids on both sides ----
    const { data: liveTeam } = await sb.from('teams').select('id, code').eq('code', SWIM_TEAM_CODE).maybeSingle();
    if (!liveTeam) throw new Error(`live team with code ${SWIM_TEAM_CODE} not found`);
    const liveTeamId = liveTeam.id as number;

    const reflectTeam = sqlite.prepare(
      `SELECT id, name, code FROM teams WHERE code = ? OR name LIKE '%swim%' OR code LIKE '%swim%' LIMIT 1`,
    ).get(SWIM_TEAM_CODE) as { id: number; name: string; code: string } | undefined;
    if (!reflectTeam) throw new Error('reflect team for swim not found');
    const reflectTeamId = reflectTeam.id;
    console.log(`[teams] reflect.id=${reflectTeamId} (${reflectTeam.code}) → live.id=${liveTeamId}`);

    // ---- 2. player phone map (reflect.id → phone → live.id) ----
    const reflectPlayers = sqlite.prepare(
      `SELECT id, phone_e164 FROM players WHERE team_id = ?`,
    ).all(reflectTeamId) as { id: number; phone_e164: string }[];
    const phoneByReflectPid = new Map<number, string>();
    for (const p of reflectPlayers) phoneByReflectPid.set(p.id, p.phone_e164);

    const { data: livePlayers } = await sb
      .from('players')
      .select('id, phone_e164')
      .eq('team_id', liveTeamId);
    const livePidByPhone = new Map<string, number>();
    for (const p of (livePlayers ?? []) as { id: number; phone_e164: string }[]) {
      livePidByPhone.set(p.phone_e164, p.id);
    }

    function mapPlayer(reflectPid: number): number | null {
      const phone = phoneByReflectPid.get(reflectPid);
      if (!phone) return null;
      return livePidByPhone.get(phone) ?? null;
    }

    console.log(`[players] reflect=${reflectPlayers.length} live=${livePlayers?.length ?? 0}`);

    // ---- 3. import question_templates (dedupe on team+name) ----
    const reflectTemplates = sqlite.prepare(
      `SELECT id, team_id, name, session_type, questions_json, is_default, created_at
         FROM question_templates WHERE team_id = ?`,
    ).all(reflectTeamId) as ReflectTemplate[];

    const templateIdMap = new Map<number, number>();
    let tplImported = 0; let tplSkipped = 0;
    for (const t of reflectTemplates) {
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
      if (DRY) {
        tplImported += 1;
        continue;
      }
      const { data: ins, error } = await sb
        .from('question_templates')
        .insert({
          team_id: liveTeamId,
          name: t.name,
          session_type: t.session_type,
          questions_json: questions,
          is_default: !!t.is_default,
        })
        .select('id')
        .single();
      if (error) {
        console.warn(`[templates] skip "${t.name}": ${error.message}`);
        continue;
      }
      templateIdMap.set(t.id, ins.id as number);
      tplImported += 1;
    }
    console.log(`[templates] imported=${tplImported} skipped=${tplSkipped}`);

    // ---- 4. import sessions (idempotent via metadata_json.reflect_session_id) ----
    const reflectSessions = sqlite.prepare(
      `SELECT id, team_id, type, label, created_at, metadata_json, template_id, video_links_json, deleted_at
         FROM sessions WHERE team_id = ? ORDER BY id ASC`,
    ).all(reflectTeamId) as ReflectSession[];

    const sessionIdMap = new Map<number, number>();
    let sImported = 0; let sSkipped = 0;
    for (const s of reflectSessions) {
      // Already imported?
      const { data: existing } = await sb
        .from('sessions')
        .select('id')
        .eq('team_id', liveTeamId)
        .filter('metadata_json->>reflect_session_id', 'eq', String(s.id))
        .maybeSingle();
      if (existing) {
        sessionIdMap.set(s.id, existing.id as number);
        sSkipped += 1;
        continue;
      }

      let parsedMeta: Record<string, unknown> = {};
      if (s.metadata_json) {
        try { parsedMeta = JSON.parse(s.metadata_json) as Record<string, unknown>; } catch {/* ignore */}
      }
      parsedMeta.reflect_session_id = s.id;
      let videoLinks: unknown = null;
      if (s.video_links_json) {
        try { videoLinks = JSON.parse(s.video_links_json); } catch {/* ignore */}
      }

      if (DRY) { sImported += 1; continue; }
      const { data: ins, error } = await sb
        .from('sessions')
        .insert({
          team_id: liveTeamId,
          type: s.type,
          label: s.label,
          template_id: s.template_id ? templateIdMap.get(s.template_id) ?? null : null,
          metadata_json: parsedMeta,
          video_links_json: videoLinks,
          created_at: s.created_at,
          deleted_at: s.deleted_at,
        })
        .select('id')
        .single();
      if (error) {
        console.warn(`[sessions] skip reflect.id=${s.id}: ${error.message}`);
        continue;
      }
      sessionIdMap.set(s.id, ins.id as number);
      sImported += 1;
    }
    console.log(`[sessions] imported=${sImported} skipped(existing)=${sSkipped}`);

    // ---- 5. deliveries — for sessions we just inserted (or already had) ----
    let dImported = 0; let dSkipped = 0; let dOrphan = 0;
    for (const [reflectSid, liveSid] of sessionIdMap) {
      const rows = sqlite.prepare(
        `SELECT * FROM deliveries WHERE session_id = ?`,
      ).all(reflectSid) as ReflectDelivery[];
      for (const d of rows) {
        const livePid = mapPlayer(d.player_id);
        if (livePid === null) { dOrphan += 1; continue; }
        // Dedupe via (session_id, player_id) unique index
        const { data: existing } = await sb
          .from('deliveries')
          .select('id')
          .eq('session_id', liveSid)
          .eq('player_id', livePid)
          .maybeSingle();
        if (existing) { dSkipped += 1; continue; }
        if (DRY) { dImported += 1; continue; }
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
    }
    console.log(`[deliveries] imported=${dImported} skipped=${dSkipped} orphan(player)=${dOrphan}`);

    // ---- 6. responses ----
    let rImported = 0; let rSkipped = 0; let rOrphan = 0;
    for (const [reflectSid, liveSid] of sessionIdMap) {
      const rows = sqlite.prepare(
        `SELECT * FROM responses WHERE session_id = ? ORDER BY id ASC`,
      ).all(reflectSid) as ReflectResponse[];
      for (const r of rows) {
        const livePid = mapPlayer(r.player_id);
        if (livePid === null) { rOrphan += 1; continue; }
        // Dedupe: same (session, player, question, created_at) is treated as a duplicate
        const { data: existing } = await sb
          .from('responses')
          .select('id')
          .eq('session_id', liveSid)
          .eq('player_id', livePid)
          .eq('question_id', r.question_id)
          .eq('created_at', r.created_at)
          .maybeSingle();
        if (existing) { rSkipped += 1; continue; }
        if (DRY) { rImported += 1; continue; }
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
    console.log(`[responses] imported=${rImported} skipped=${rSkipped} orphan(player)=${rOrphan}`);

    // ---- 7. flags ----
    let fImported = 0; let fSkipped = 0; let fOrphan = 0;
    for (const [reflectSid, liveSid] of sessionIdMap) {
      const rows = sqlite.prepare(
        `SELECT * FROM flags WHERE session_id = ? ORDER BY id ASC`,
      ).all(reflectSid) as ReflectFlag[];
      for (const f of rows) {
        const livePid = mapPlayer(f.player_id);
        if (livePid === null) { fOrphan += 1; continue; }
        const { data: existing } = await sb
          .from('flags')
          .select('id')
          .eq('session_id', liveSid)
          .eq('player_id', livePid)
          .eq('flag_type', f.flag_type)
          .eq('created_at', f.created_at)
          .maybeSingle();
        if (existing) { fSkipped += 1; continue; }
        if (DRY) { fImported += 1; continue; }
        const { error } = await sb.from('flags').insert({
          session_id: liveSid,
          player_id: livePid,
          flag_type: f.flag_type,
          severity: f.severity,
          details: f.details,
          created_at: f.created_at,
        });
        if (error) {
          console.warn(`[flags] skip session=${liveSid} player=${livePid}: ${error.message}`);
          continue;
        }
        fImported += 1;
      }
    }
    console.log(`[flags] imported=${fImported} skipped=${fSkipped} orphan(player)=${fOrphan}`);

    console.log(DRY ? '\nDRY RUN — no rows written.' : '\nDone.');
  } finally {
    sqlite.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
