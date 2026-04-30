# Individual Athlete Page — Design

> **Spec for C1 in `docs/superpowers/plans/2026-04-29-ideas-md-roadmap.md`.**
> Sets the design language anchor for the polish wave (C2 athlete grid and C3 dashboard+live redesign inherit from this).

## 1. Goal

One unified personal-dashboard page used both by an athlete viewing their own data and by a coach/captain/admin viewing that athlete. The page sets the visual language for the rest of the polish wave. C1 also folds in D3's "Athlete view feature parity" — there is no longer a separate `/dashboard/athlete` shape.

## 2. Routing

- Canonical URL: `/dashboard/players/[id]`. Already moved in commit `ff42282`; "Athletes" sidebar entry highlights correctly.
- `/dashboard/athlete` becomes a thin redirector:
  - If `prefs.impersonate_player_id` is set → redirect to `/dashboard/players/[that-id]`.
  - If unset (admin without impersonation) → keep the existing "Athlete simulator" picker UI; clicking a player navigates to the canonical URL.
- `dashboard-shell.tsx` continues to redirect athletes who hit other paths to `/dashboard/athlete`. Fast follow keeps them landing on the canonical URL via the redirector above.

## 3. Page structure

Top to bottom, three full-width sections (the hero splits 2 columns at `lg+` only):

```
HERO            readiness number + AI sentence + identity caption + period toggle + inline action row
HEATMAP         tabbed body map (Injury / Activity / Rehab) + side list
TIMELINE        merged feed of activity_logs + twilio_messages, chip filter (All / Activity / Messages / Survey)
```

### 3.1 Hero (readiness-led, AI-supported)

The page opens with the readiness number — that's what the eye should land on first.

- Big readiness value (e.g. `7.4`) and a status word (`on wire` / `watch` / `quiet`) in the dominant slot.
- AI sentence (one or two lines) directly underneath, with the freshness chip "Generated 4h ago" and a refresh icon.
- Name, group, and ID render as a smaller caption to the side. Phone is shown when the viewer is a coach/captain/admin or is the athlete themselves.
- `<PeriodToggle>` (the existing 7d / 14d / 30d / All component) lives in the hero, not the page header.
- Inline action row (one row of small buttons under the hero):
  - **Coach viewing athlete:** *Text · Log session · Mark injury resolved*
  - **Athlete viewing self:** *Self-report · Log workout · Report injury*
  - Verbs that don't have a built flow yet route to existing pages or stub a TODO; this spec does not build new flows.

### 3.2 Heatmap card (3-mode toggle)

- Single rounded-2xl card. Card header: title "Body map" on the left, a small pill toggle on the right with three options: **Injury · Activity · Rehab**.
- The card body splits into the silhouette (left) and a side list (right).
- The side list shows the top items for the active tab:
  - **Injury** → active injury rows (region pills + severity + relative time)
  - **Activity** → top regions hit by workouts in the period (e.g. `shoulder · 8 sessions`)
  - **Rehab** → top regions hit by rehab in the period
- Heatmap defaults to **Injury**; the user can flip tabs without leaving the page.
- On `<md` widths the silhouette stacks above the side list.

### 3.3 Timeline card (merged feed + chip filter)

- Single card. Card header: title "Activity & messages", chip row aligned right: **All · Activity · Messages · Survey**.
- Default chip is **All** — the feed interleaves `activity_logs` and `twilio_messages` rows by timestamp desc.
- One row shape regardless of source: small category pill, body text, relative timestamp on the right.
- Categories: `workout` (green), `rehab` (amber), `survey` (blue), `inbound` (mute), `outbound` (mute).
- Chip filter narrows in place (no separate route). Day separators (TODAY / YESTERDAY) are a deferred polish — not in this spec.

## 4. Components

### 4.1 New (under `apps/web/src/components/v3/`)

- `<AthleteHero>` — props: `player`, `derived` (readiness, status, flags), `aiSummary` (text + freshness ts + loading state), `period`, `onPeriodChange`, `viewerIsSelf`, `onAction(verb)`. Renders the hero block and its inline action row. The action-row verbs come from `viewerIsSelf`.
- `<HeatmapTabs>` — props: `injuryCounts`, `activityCounts`, `rehabCounts`, `gender`, `injurySideList`, `activitySideList`, `rehabSideList`. Internal state for the active tab. Wraps the existing `<BodyHeatmap>` and swaps `counts` per tab.
- `<UnifiedTimeline>` — props: `entries: TimelineEntry[]`, `period`. Internal state for active filter chip. One row component with a switch on `entry.kind`.

### 4.2 Existing components reused unchanged

- `<BodyHeatmap>`, `<Pill>`, `<ReadinessBar>`, `<PeriodToggle>`, `<PageHeader>`. The page header is kept but trimmed (period toggle moves into the hero).

### 4.3 Existing components retired or absorbed

- `<PlayerSummaryCard>` — its sentence becomes a prop into `<AthleteHero>`. The card chrome is removed; the AI sentence is no longer a separate card.
- The current Identity-card + Readiness-card hero in `apps/web/src/app/dashboard/players/[id]/page.tsx` lines 156–218 — fully replaced by `<AthleteHero>`.
- The current separate Messages and Activity-log sections (lines 274–372) — fully replaced by `<UnifiedTimeline>`.

### 4.4 New utility

- `apps/web/src/lib/timeline.ts` — `TimelineEntry` type (`{ id, kind, ts, body, meta }`) and `buildTimeline(logs, msgs)` that interleaves and sorts by timestamp desc.

### 4.5 Existing utility extended

- `apps/web/src/lib/injury-aliases.ts` already exports `parseInjuryRegions(text)` (regions ported from `reflect/app/heatmap.py`). Use it on `activity_logs.description` for the Activity and Rehab heatmap counts. No new util required.

## 5. Data flow

The page (`apps/web/src/app/dashboard/players/[id]/page.tsx`) becomes a thin orchestrator. It fetches data via the supabase client and the existing summary endpoint, derives view state, and passes shaped props to the three components.

```
useEffect(playerId, period) {
  parallel:
    SELECT players WHERE id=playerId
    SELECT twilio_messages WHERE player_id=playerId AND date_sent >= since
    SELECT activity_logs WHERE player_id=playerId AND logged_at >= since
    SELECT injury_reports WHERE player_id=playerId AND reported_at >= since
  POST /api/players/[id]/summary?days=${periodKey(period)}     // fires on page load (auto-fetch)
}

derived:
  readiness, status, flags         ← computed from messages (existing logic, unchanged)
  injuryCounts                     ← from injury_reports.regions (existing logic)
  activityCounts                   ← parseInjuryRegions(log.description) for kind='workout'
  rehabCounts                      ← parseInjuryRegions(log.description) for kind='rehab'
  timeline: TimelineEntry[]        ← buildTimeline(logs, messages) sorted desc

permissions:
  viewerIsSelf =
    currentUser.team_memberships.player_id === playerId
    && !currentUser.is_platform_admin
```

No new API endpoints. No new schema migrations beyond §6's TTL throttle.

## 6. Token efficiency (LLM cache TTL)

The hero auto-fetches the AI summary on every page visit. Without a TTL, a busy day with new surveys would shift the data hash and trigger a fresh LLM call on every visit. Add a TTL throttle on top of the existing data-hash cache.

### 6.1 Migration `0020_llm_cache_throttle.sql`

```sql
alter table public.llm_cache
  add column if not exists throttle_key text;

create index if not exists idx_llm_cache_throttle
  on public.llm_cache (throttle_key, created_at desc);
```

`throttle_key` for player summaries is `player:{id}:days:{period}` (no data hash). The existing `cache_key` (full hash) stays as the primary key.

### 6.2 Lookup order in `POST /api/players/[id]/summary`

1. **Exact key match** — `cache_key = ${full_hash}` → return cached. Same as today.
2. **TTL throttle** — newest row where `throttle_key = ${player_id}:${days}` and `created_at > now() - LLM_CACHE_TTL` → return that row, even if data has shifted. New behaviour.
3. **Else** → call LLM, then upsert with both `cache_key` and `throttle_key`.

Default TTL is 24 hours. Configurable via `LLM_CACHE_TTL_HOURS` env var.

### 6.3 Force regenerate

The existing "Regenerate" button passes `?force=1`, which skips both lookups (1) and (2) and writes a fresh row. Power users keep their override.

### 6.4 UI freshness

The hero's AI-sentence block shows "Generated Xh ago" using the cached row's `created_at`. A small refresh icon next to it triggers force-regen.

### 6.5 Trade-off

If a critical flag fires inside the TTL window, the AI sentence won't pick it up until a force-regen or the window expires. Acceptable: live readiness, the active-injury list in the heatmap card, and the top of the timeline already surface flags independently of the AI sentence.

## 7. Mobile / narrow widths

- Hero: identity caption stacks below the readiness number on `<lg`. Inline action row wraps.
- Heatmap card: silhouette stacks above the side list on `<md`. Tab pill stays in the card header.
- Timeline card: already single-column. Chip row scrolls horizontally if needed.

## 8. Out of scope (deferred)

- MMS photo rendering inline in messages (D1).
- "New since last visit" highlight on timeline rows (D1).
- Position-change alerts (D1).
- Coach event editing on Schedule (D2).
- Trends / charts tab (the deferred "reflective deep-dive" — a future C-bucket item).
- Athlete-side compose / outbound message UI (D3 follow-up).
- Manual self-report form on web — the *Self-report* button stubs to a TODO route or toast for now (D3).
- Day separators (TODAY / YESTERDAY) inside the timeline. Add later if density becomes an issue.
- Action verbs that don't have a built flow yet — *Log session*, *Self-report*, *Log workout*, *Report injury* — stub to existing pages or a TODO route. C1 does not build new flows.

## 9. Done when

- Visiting `/dashboard/players/[id]` shows the hero with the readiness number, AI sentence, identity caption, period toggle, and inline action row.
- The heatmap card's pill toggle flips between Injury / Activity / Rehab without a page reload.
- The timeline merges activity_logs and twilio_messages by timestamp; chip filter narrows in place.
- Token usage for repeated visits to the same athlete within 24 hours is one LLM call (or zero if the exact hash matches).
- "Athletes" sidebar entry stays highlighted on the player profile route.
- Athlete (no impersonation override) lands on `/dashboard/players/[their-player-id]`, sees their own page, no admin surfaces leak.

## 10. Non-goals

- Real-time updates inside this page (no Supabase Realtime subscriptions added). The page is a snapshot; navigating away and back refreshes.
- New backend tables or endpoints beyond the TTL migration.
- Any visual change to other pages — those land in C2 and C3, which inherit the language set here.
