# Score Trends — Calendar Heatmap

**Status:** approved 2026-05-02
**Scope:** replace the current Score Trends card on the individual athlete page (`/dashboard/players/[id]`) with a calendar-heatmap layout.
**Files affected:** `apps/web/src/components/v3/survey-trends-card.tsx` (rewrite), `apps/web/src/lib/survey-trends.ts` (small additions for stats; data layer largely unchanged).

## Why this exists

We've iterated four times on chart-shaped visualizations of athlete survey data and each one fights itself: 5+ overlapping lines, sparse irregular sampling, lone outliers stretching the time axis, label collisions. The data fundamentally has these properties:

- 3–8 distinct questions per athlete (mix of 0–10 score, binary yes/no, and free-text-with-numbers)
- 7–26 replies per question over weeks/months
- Irregular cadence — some metrics daily, some weekly
- Lone outliers (one reply weeks after the rest)

A calendar heatmap (one cell per athlete-day per metric) is the canonical answer to this shape: each reply becomes one fixed-width colored cell, dates align trivially, gaps become visible (compliance signal), and cross-metric correlation is a vertical scan at any column.

## Layout

Two-column rows inside the existing card:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Score trends                                    3 score · 2 y/n     │
├─────────────────────────────────────────────────────────────────────┤
│ Body readiness            last 6.5 │ ░ ▒ ░ ▓ ▒   ▓     ▓     ▓     │
│ avg 6.1 · 12 replies               │                                │
│                                                                     │
│ One thing to work on      last 5.5 │ ▒ ▒ ▒ ▓ ░ ▒        ▓           │
│ avg 5.5 · 18 replies               │                                │
│                                                                     │
│ Body area severity        last 8.5 │       ▒   ▓     ▒              │
│ avg 6.2 · 7 replies                │                                │
├─────────────────────────────────────────────────────────────────────┤
│ Did pain start?            8/26 yes│   ● ● ●   ●  ● ● ●   ●         │
│ 31% yes                            │                                │
│                                                                     │
│ Did stress affect?         2/9 yes │               ●     ●          │
│ 22% yes                            │                                │
│                                    │                                │
│                                    │ Mar 1                  Apr 30  │
└─────────────────────────────────────────────────────────────────────┘
```

- Score rows on top, binary rows below, separator between the two groups.
- Stats column (left): question label, secondary stat (`avg X.X · N replies` or `X% yes`), and a big inline `last <value>` colored by tone.
- Heatmap strip (right): one column per calendar day in the active window.
- Single date axis at the bottom of the panel; columns align across rows.

## Time window

Driven by the page's existing period toggle (`7D` / `14D` / `30D` / `ALL`), which already drives the rest of the page's data fetch. No new filter UI on the card.

When period = `ALL` and data spans more than 90 days, clamp the heatmap window to the most recent 90 days so cells remain ≥4px wide on a 760px-viewbox SVG. (Older replies are not lost — they just don't appear in this card. The unified timeline below still shows them.)

## Cell encoding

**Score rows** (questions whose `kind === 'score'`):

| Reply value | Cell |
|---|---|
| `< 1` or no reply | faint background dot (very low opacity) |
| `1–4` | red square |
| `5–6` | amber square |
| `7–10` | green square |

Tones are discrete (4 buckets), not a continuous gradient. Discrete tones read better at ≤8px cell width.

**Binary rows** (questions whose `kind === 'binary'`, set by text-pattern match `0 = no, 1 = yes`):

| Reply value | Cell |
|---|---|
| no reply that day | faint background dot |
| `0` (or `<0.5`) | small hollow ring (cadence visible — they replied "no") |
| `1` (or `≥0.5`) | solid red filled circle |

The "hollow no" treatment matters: it lets a coach distinguish "they didn't reply" from "they replied no", which is genuinely different information.

## Daily aggregation

Same as the current lib code — keep as is:
- `score` rows: mean of the day's replies
- `binary` rows: max (any yes wins)

This collapses the spike pattern from athletes answering the same survey twice within minutes (timeout → reminder → second send).

## Stats column

Per row:

- **Line 1**: question label (smart-truncated to ~32 chars, full text on hover via `title`)
- **Line 2**: secondary stat
  - score → `avg X.X · N replies`
  - binary → `M/N yes` and `X% yes`
- **Right-aligned** within the stats column: `last <value>` colored by tone (green/amber/red for scores; red for "yes", muted for "no")

## Date axis

A single x-axis under the entire grid:

- 5 evenly-spaced tick labels (e.g. `Mar 1`, `Mar 15`, `Apr 1`, `Apr 15`, `Apr 30`)
- Tick anchor: leftmost = `start`, rightmost = `end`, middle three = `middle`
- Format: `MMM d` via `Intl.DateTimeFormat`

## Question selection

No aggressive filter — keep all paired questions:

- Text-based binary detection (`0 = no, 1 = yes` / `1 = yes, 0 = no`) wins for classification (a "Did pain start?" question stays binary even when athletes typed severity numbers).
- Everything else paired and numeric becomes a score row, including "free-text" questions that athletes happen to answer with numbers ("One thing to work on?", "Body area severity?"). Plotting numeric replies is more useful than dropping them — coaches can still spot patterns.

## Sorting within groups

Score rows: descending by reply count (most-data row first).
Binary rows: descending by reply count.

## Empty state

Card already handles `trends.length === 0` — keep that path. New: if `trends.length > 0` but every series has 0 points within the active window, show a "no replies in this window — try a longer period" message.

## Hover behavior

Each cell has an SVG `<title>` showing date + exact value. No custom tooltip overlay (keeps the implementation small; native browser tooltip is good enough for this card).

## Mobile / narrow viewports

Heatmap strip becomes horizontally scrollable when it overflows. Stats column stays as left content within the scroll container — no sticky behavior needed (it's not that wide).

## Accessibility

- Each row has a heading for screen readers (`<h3>` already present).
- Each cell's `<title>` is read on hover/focus.
- Colors are not the only signal — exact values are in `<title>` and last-value text.

## Out of scope

- Click-to-filter / drill-down on a cell (could come later)
- Adjustable time window beyond the page period toggle
- Cross-athlete comparison (coach-only feature, separate scope)
- Persisting a "default visible" set of questions (no longer needed; card shows all)

## File structure

`apps/web/src/components/v3/survey-trends-card.tsx`:
- `SurveyTrendsCard` (default export, props unchanged)
- `Header`, `Card` (existing helpers)
- `HeatmapRow` (new): renders one row's heatmap strip + stats column
- `DateAxis` (existing, kept)
- `daysInWindow(tMin, tMax)` (new helper): array of calendar-day timestamps

`apps/web/src/lib/survey-trends.ts`:
- No new exports needed. Existing `QuestionTrend` shape is sufficient.
- Keep the daily-aggregation step; it's still correct for cell semantics.

## Testing

Manual visual check on the live athlete page after deploy. The data shape is well-understood from the diagnostic script (`scripts/diagnose-trends.ts`); we know what should render for Ryan Lobo (player #46) and can verify by eye.

No unit tests needed — the component is presentational and the data layer is unchanged.
