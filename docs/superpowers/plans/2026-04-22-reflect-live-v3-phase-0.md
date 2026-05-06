# Phase 0 — Visual Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip reflect-live from the dark instrument-panel aesthetic to a clean light "Reflect 2.0" look — warm off-white ground, white cards, blue primary, Montserrat + JetBrains Mono, plain-English names — across all 21 pages with zero new functionality.

**Architecture:** Replace `globals.css` token system, drop Fraunces, build six new primitive components under `components/v3/`, refit the existing 11 display components and 21 pages to use them, then delete the five obsolete decorative components (`brand-mark`, `readiness-dial`, `stamp`, `section-tag`, `stat-readout`).

**Tech Stack:** Next.js 16 (App Router) · Tailwind v4 · Montserrat + JetBrains Mono via `next/font/google` · Supabase (data layer unchanged) · Clerk (auth unchanged).

**Verification model:** No unit tests for visual work. Each task gates on `bun run build` (TypeScript + Next compile) succeeding. After all tasks, full visual check on the running app via Vercel preview.

**Commits:** Per-milestone commits (every 4–6 tasks) so the diff is reviewable and rollbackable. The final task is the canonical "ship Phase 0" commit + push.

---

## File Structure

**Create (new):**
- `apps/web/src/components/v3/page-header.tsx`
- `apps/web/src/components/v3/stat-cell.tsx`
- `apps/web/src/components/v3/readiness-bar.tsx`
- `apps/web/src/components/v3/pill.tsx`
- `apps/web/src/components/v3/message-row.tsx`
- `apps/web/src/components/v3/brand.tsx`

**Rewrite (full):**
- `apps/web/src/app/globals.css`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx` (landing)
- `apps/web/src/app/sign-in/[[...sign-in]]/page.tsx`
- `apps/web/src/app/sign-up/[[...sign-up]]/page.tsx`
- `apps/web/src/app/onboarding/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/dashboard/players/page.tsx`
- `apps/web/src/app/dashboard/player/[id]/page.tsx`
- `apps/web/src/app/dashboard/fitness/page.tsx`
- `apps/web/src/app/dashboard/events/page.tsx`
- `apps/web/src/app/dashboard/athlete/page.tsx`
- `apps/web/src/app/dashboard/captain/page.tsx`
- `apps/web/src/app/dashboard/captain/follow-ups/page.tsx`
- `apps/web/src/app/dashboard/admin/page.tsx`
- `apps/web/src/app/dashboard/admin/users/page.tsx`
- `apps/web/src/app/dashboard/admin/teams/page.tsx`
- `apps/web/src/app/dashboard/admin/system/page.tsx`
- `apps/web/src/app/dashboard/admin/database/page.tsx`
- `apps/web/src/app/dashboard/settings/page.tsx`
- `apps/web/src/components/dashboard-shell.tsx`
- `apps/web/src/components/app-sidebar.tsx`
- `apps/web/src/components/command-palette.tsx`
- `apps/web/src/components/live-feed.tsx`
- `apps/web/src/components/watchlist-panel.tsx`
- `apps/web/src/components/weather-grid.tsx`
- `apps/web/src/components/news-feed.tsx`
- `apps/web/src/components/activity-log-timeline.tsx`
- `apps/web/src/components/worker-health-card.tsx`
- `apps/web/src/components/metric-card.tsx`
- `apps/web/src/components/star-button.tsx`

**Delete** (move to `~/.Trash/`, after no longer imported):
- `apps/web/src/components/brand-mark.tsx`
- `apps/web/src/components/readiness-dial.tsx`
- `apps/web/src/components/stamp.tsx`
- `apps/web/src/components/section-tag.tsx`
- `apps/web/src/components/stat-readout.tsx`

**Untouched:**
- All API routes (`apps/web/src/app/api/`)
- All worker code (`apps/worker/`)
- All migrations (`supabase/migrations/`)
- All shared types (`packages/shared/`)
- shadcn primitives (`apps/web/src/components/ui/`)
- `sparkline.tsx`

---

## Task 1: Foundation — new globals.css

**Files:**
- Modify: `apps/web/src/app/globals.css` (full rewrite)

- [ ] **Step 1: Replace globals.css with Reflect 2.0 token system**

```css
@import "tailwindcss";
@import "tw-animate-css";

/* =========================================================
   reflect-live v3 — "Reflect 2.0" light theme
   Warm off-white ground, white cards, blue primary,
   Montserrat + JetBrains Mono. Plain. Calm. Friendly.
   ========================================================= */

:root {
  /* Surfaces */
  --paper: #FAF8F3;
  --paper-2: #F4F0E6;
  --card: #FFFFFF;
  --card-hover: #FBF9F4;

  /* Ink */
  --ink: #141923;
  --ink-soft: #475264;
  --ink-mute: #8D94A2;
  --ink-dim: #B5BAC4;

  /* Borders */
  --border: #EAE5D9;
  --border-2: #D7D1C2;

  /* Brand */
  --blue: #1F5FB0;
  --blue-2: #3F7AC4;
  --blue-soft: #E8F0F9;
  --blue-soft-2: #D7E3F2;

  /* Signal */
  --green: #148759;
  --green-soft: #E5F2EC;
  --amber: #B9741A;
  --amber-soft: #F7ECD4;
  --red: #B73B36;
  --red-soft: #F6DDDB;

  /* Shadcn semantic tokens — remap onto new palette */
  --background: var(--paper);
  --foreground: var(--ink);
  --card-foreground: var(--ink);
  --popover: var(--card);
  --popover-foreground: var(--ink);
  --primary: var(--blue);
  --primary-foreground: #FFFFFF;
  --secondary: var(--paper-2);
  --secondary-foreground: var(--ink);
  --muted: var(--paper-2);
  --muted-foreground: var(--ink-mute);
  --accent: var(--blue-soft);
  --accent-foreground: var(--blue);
  --destructive: var(--red);
  --destructive-foreground: #FFFFFF;
  --success: var(--green);
  --success-foreground: #FFFFFF;
  --warning: var(--amber);
  --warning-foreground: #FFFFFF;
  --input: var(--border);
  --ring: var(--blue);
  --radius: 14px;

  /* Sidebar */
  --sidebar: var(--card);
  --sidebar-foreground: var(--ink);
  --sidebar-primary: var(--blue);
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: var(--blue-soft);
  --sidebar-accent-foreground: var(--blue);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--blue);

  /* Typography */
  --font-sans: var(--font-montserrat), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, "SF Mono", Menlo, monospace;

  /* Shadow */
  --shadow-sm: 0 1px 2px hsl(28 12% 20% / 0.04);
  --shadow: 0 4px 14px hsl(28 12% 20% / 0.06);
  --shadow-lg: 0 14px 38px hsl(28 12% 20% / 0.08);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-blue: var(--blue);
  --color-blue-soft: var(--blue-soft);
  --color-paper: var(--paper);
  --color-ink: var(--ink);
  --color-ink-soft: var(--ink-soft);
  --color-ink-mute: var(--ink-mute);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

*, *::before, *::after { box-sizing: border-box; }

html, body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  line-height: 1.55;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

html { color-scheme: light; }

/* Tabular numerics utility */
.tabular { font-variant-numeric: tabular-nums slashed-zero lining-nums; }
.mono { font-family: var(--font-mono); }

/* Reveal animation — light, restrained */
@keyframes revealUp {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
.reveal { animation: revealUp 0.4s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.reveal-1 { animation-delay: 0.04s; }
.reveal-2 { animation-delay: 0.10s; }
.reveal-3 { animation-delay: 0.18s; }
.reveal-4 { animation-delay: 0.28s; }

/* Slide-in for new realtime rows */
@keyframes slideIn {
  0% { opacity: 0; transform: translateY(-4px); background: var(--blue-soft); }
  60% { opacity: 1; }
  100% { opacity: 1; transform: translateY(0); background: transparent; }
}
.slide-in-row { animation: slideIn 0.6s ease-out; }

/* Live dot — small, simple, no pulsing aura */
.live-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--green);
}

/* ==========================================================
   Legacy rl-* classes — kept (untouched) so any straggler
   that still uses them doesn't crash. They are NOT used in
   v3-redesigned pages.
   ========================================================== */
.rl-card { background: var(--card); border-radius: 8px; box-shadow: var(--shadow-sm); padding: 1.5rem; }
.rl-stat-card { background: var(--card); border-radius: 8px; padding: 1.25rem; box-shadow: var(--shadow-sm); }
```

- [ ] **Step 2: Build to verify CSS parses**

Run from repo root:
```bash
cd "apps/web" && bun run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully`. No CSS parse errors. The build will still succeed because all the old `var(--bone)` etc. tokens still exist in component code — but those will resolve to undefined CSS variables, rendering as blank/transparent. Pages will look broken at this point. That's expected — we fix it in subsequent tasks.

- [ ] **Step 3: Don't commit yet** — bundling commits with subsequent tasks for cleaner diff history.

---

## Task 2: Foundation — layout.tsx font swap

**Files:**
- Modify: `apps/web/src/app/layout.tsx` (full rewrite)

- [ ] **Step 1: Replace layout.tsx**

```tsx
import { ClerkProvider } from '@clerk/nextjs';
import { Montserrat, JetBrains_Mono } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';
import type { ReactNode } from 'react';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata = {
  title: 'reflect — team check-ins, dashboard, the works',
  description:
    'Coach dashboard for team check-ins, fitness, schedule, AI assistant, and more.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${montserrat.variable} ${jetbrains.variable}`}>
        <body>
          <TooltipProvider delayDuration={120}>{children}</TooltipProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully`. Fonts now load Montserrat + JetBrains Mono.

- [ ] **Step 3: Commit foundation**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live"
git add apps/web/src/app/globals.css apps/web/src/app/layout.tsx
git commit -m "phase-0: foundation — Reflect 2.0 tokens + Montserrat/JetBrains Mono"
```

---

## Task 3: New primitive — Brand wordmark

**Files:**
- Create: `apps/web/src/components/v3/brand.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { cn } from '@/lib/utils';

/**
 * The reflect wordmark — blue square with white "R" + "reflect" in Montserrat.
 * Used in the sidebar, landing masthead, and auth split panels.
 */
export function Brand({
  className,
  size = 'md',
  showText = true,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}) {
  const dim = size === 'sm' ? 24 : size === 'lg' ? 36 : 30;
  const fontSize = size === 'sm' ? '0.6rem' : size === 'lg' ? '0.85rem' : '0.78rem';
  const textSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base';

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className="grid place-items-center rounded-md font-bold text-white"
        style={{
          width: dim,
          height: dim,
          background: 'var(--blue)',
          fontSize,
          letterSpacing: '-0.02em',
        }}
      >
        R
      </span>
      {showText && (
        <span
          className={cn('font-semibold tracking-tight text-[color:var(--ink)]', textSize)}
        >
          reflect
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`.

---

## Task 4: New primitive — Pill

**Files:**
- Create: `apps/web/src/components/v3/pill.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export type PillTone = 'blue' | 'green' | 'amber' | 'red' | 'mute';

const TONE: Record<PillTone, { color: string; bg: string }> = {
  blue:  { color: 'var(--blue)',  bg: 'var(--blue-soft)' },
  green: { color: 'var(--green)', bg: 'var(--green-soft)' },
  amber: { color: 'var(--amber)', bg: 'var(--amber-soft)' },
  red:   { color: 'var(--red)',   bg: 'var(--red-soft)' },
  mute:  { color: 'var(--ink-mute)', bg: 'var(--paper-2)' },
};

/**
 * Soft-filled status pill. 10.5px bold uppercase with 0.5px tracking.
 * Use for category tags (Survey/Workout/Rehab), status badges, role markers.
 */
export function Pill({
  tone = 'mute',
  children,
  className,
}: {
  tone?: PillTone;
  children: React.ReactNode;
  className?: string;
}) {
  const { color, bg } = TONE[tone];
  return (
    <span
      className={cn(
        'inline-block px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-wide rounded-md',
        className,
      )}
      style={{ color, background: bg }}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

---

## Task 5: New primitive — StatCell

**Files:**
- Create: `apps/web/src/components/v3/stat-cell.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export type StatTone = 'default' | 'blue' | 'green' | 'amber' | 'red';

const TONE_COLOR: Record<StatTone, string> = {
  default: 'var(--ink)',
  blue: 'var(--blue)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  red: 'var(--red)',
};

/**
 * StatCell — uppercase label + big tabular value + optional sub line + optional trend chip.
 * Used in dashboard hero rows and admin overview pages.
 */
export function StatCell({
  label,
  value,
  sub,
  tone = 'default',
  trend,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: StatTone;
  trend?: { dir: 'up' | 'down' | 'flat'; text: string };
  className?: string;
}) {
  const valueColor = TONE_COLOR[tone];
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-[color:var(--ink-mute)]">
        {label}
      </div>
      <div
        className="text-[36px] font-bold leading-none tabular tracking-[-0.02em]"
        style={{ color: valueColor }}
      >
        {value}
      </div>
      {trend && (
        <div className="mt-1">
          <span
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold rounded-md px-2 py-0.5"
            style={{
              color: trend.dir === 'up' ? 'var(--green)' : trend.dir === 'down' ? 'var(--red)' : 'var(--ink-mute)',
              background: trend.dir === 'up' ? 'var(--green-soft)' : trend.dir === 'down' ? 'var(--red-soft)' : 'var(--paper-2)',
            }}
          >
            {trend.dir === 'up' ? '↑' : trend.dir === 'down' ? '↓' : '→'} {trend.text}
          </span>
        </div>
      )}
      {sub && <div className="text-[12px] text-[color:var(--ink-mute)]">{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

---

## Task 6: New primitive — ReadinessBar

**Files:**
- Create: `apps/web/src/components/v3/readiness-bar.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { cn } from '@/lib/utils';

/**
 * Horizontal readiness gauge 0–10. Replaces the SVG dial.
 * Color shifts by value: <4 red, 4–6 amber, ≥6 green.
 * Big tabular value above the bar; thin scale labels below.
 */
export function ReadinessBar({
  value,
  max = 10,
  responses,
  flagged,
  size = 'md',
  className,
}: {
  value: number | null;
  max?: number;
  responses?: number;
  flagged?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const tone =
    value == null
      ? { color: 'var(--ink-dim)', label: 'No data' }
      : value < 4
      ? { color: 'var(--red)', label: 'Flag' }
      : value < 6
      ? { color: 'var(--amber)', label: 'Watch' }
      : { color: 'var(--green)', label: 'Healthy' };

  const fillPct = value == null ? 0 : Math.min(100, (value / max) * 100);
  const valueSize = size === 'sm' ? 'text-3xl' : size === 'lg' ? 'text-6xl' : 'text-5xl';
  const barHeight = size === 'sm' ? 6 : size === 'lg' ? 12 : 10;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between">
        <div>
          <div
            className="text-[11.5px] font-semibold uppercase tracking-[0.5px]"
            style={{ color: tone.color }}
          >
            Team readiness
          </div>
          <div className={cn('font-bold tabular leading-none mt-2', valueSize)} style={{ color: tone.color }}>
            {value != null ? value.toFixed(1) : '—'}
            <span className="text-base text-[color:var(--ink-mute)] font-medium ml-1">/ {max}</span>
          </div>
        </div>
        {flagged != null && flagged > 0 && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold"
            style={{ color: 'var(--red)', background: 'var(--red-soft)' }}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {flagged} flag{flagged === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div
        className="w-full overflow-hidden rounded-full"
        style={{ height: barHeight, background: 'var(--border)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${fillPct}%`, background: tone.color }}
        />
      </div>

      <div className="flex justify-between text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
        <span>0</span>
        <span>{tone.label}</span>
        <span>{responses != null ? `${responses} responses` : ''}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

---

## Task 7: New primitive — MessageRow

**Files:**
- Create: `apps/web/src/components/v3/message-row.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Pill, type PillTone } from './pill';

/**
 * Single row in a message list — time / category pill / name / body / optional score.
 * Used in dashboard messages, profile messages, athlete view messages.
 */
export function MessageRow({
  time,
  category,
  categoryTone = 'mute',
  name,
  body,
  score,
  scoreTone,
  meta,
  highlight,
  onClick,
  className,
}: {
  time: string;
  category: string;
  categoryTone?: PillTone;
  name: React.ReactNode;
  body?: React.ReactNode;
  score?: React.ReactNode;
  scoreTone?: 'green' | 'amber' | 'red';
  meta?: React.ReactNode;
  highlight?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const scoreColor =
    scoreTone === 'red'
      ? 'var(--red)'
      : scoreTone === 'amber'
      ? 'var(--amber)'
      : 'var(--green)';
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-start gap-4 px-6 py-3.5 border-b border-[color:var(--border)] last:border-b-0 transition',
        highlight && 'slide-in-row',
        onClick && 'cursor-pointer hover:bg-[color:var(--card-hover)]',
        className,
      )}
    >
      <div className="mono text-[12px] font-semibold text-[color:var(--ink-mute)] tabular min-w-[52px] pt-[3px]">
        {time}
      </div>
      <div className="pt-[3px]">
        <Pill tone={categoryTone}>{category}</Pill>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-[color:var(--ink)]">{name}</div>
        {body && (
          <div className="mt-0.5 text-[13px] text-[color:var(--ink-soft)] leading-relaxed">
            {body}
          </div>
        )}
        {meta && (
          <div className="mt-1 text-[11.5px] text-[color:var(--ink-mute)]">{meta}</div>
        )}
      </div>
      {score != null && (
        <div
          className="text-[26px] font-bold tabular leading-none pt-[3px]"
          style={{ color: scoreColor }}
        >
          {score}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

---

## Task 8: New primitive — PageHeader

**Files:**
- Create: `apps/web/src/components/v3/page-header.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

/**
 * The standard page header: eyebrow + big sans title + thin meta line + right-side actions.
 * Sticky to the top, white-with-subtle-shadow surface.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  live,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  live?: boolean;
}) {
  return (
    <header
      className="sticky top-0 z-20 border-b bg-[color:var(--card)]/90 backdrop-blur"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-3 px-4 md:px-8 py-4">
        <SidebarTrigger className="text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            {eyebrow && (
              <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[color:var(--ink-mute)]">
                {eyebrow}
              </span>
            )}
            {live && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--green)]">
                <span className="live-dot" />
                Live
              </span>
            )}
          </div>
          <h1
            className={cn(
              'text-2xl md:text-3xl font-bold leading-tight tracking-[-0.01em] text-[color:var(--ink)] truncate',
              eyebrow && 'mt-0.5',
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <div className="mt-1 text-[13px] text-[color:var(--ink-mute)] truncate">{subtitle}</div>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit primitives**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live"
git add apps/web/src/components/v3
git commit -m "phase-0: add v3 primitives — Brand, Pill, StatCell, ReadinessBar, MessageRow, PageHeader"
```

---

## Task 9: Refit dashboard-shell — use v3 PageHeader

**Files:**
- Modify: `apps/web/src/components/dashboard-shell.tsx` (full rewrite of PageHeader export and update DashboardShell skeleton)

- [ ] **Step 1: Rewrite dashboard-shell.tsx**

```tsx
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AppSidebar } from './app-sidebar';
import { CommandPalette } from './command-palette';
import { useSupabase } from '@/lib/supabase-browser';
import type { UserPreferences, Team, UserRole } from '@reflect-live/shared';

// Re-export the v3 PageHeader so existing imports `from '@/components/dashboard-shell'` keep working.
export { PageHeader } from './v3/page-header';

interface DashboardCtx {
  prefs: UserPreferences;
  team: Team;
  role: UserRole;
  refresh: () => Promise<void>;
}

const Context = createContext<DashboardCtx | null>(null);

export function useDashboard(): DashboardCtx {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useDashboard must be used inside <DashboardShell>');
  return ctx;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const sb = useSupabase();
  const router = useRouter();
  const pathname = usePathname();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchAll() {
    const { data: pref } = await sb.from('user_preferences').select('*').maybeSingle();
    if (!pref) {
      router.push('/onboarding');
      return null;
    }
    const p = pref as UserPreferences;
    setPrefs(p);
    const { data: teamData } = await sb.from('teams').select('*').eq('id', p.team_id).single();
    setTeam(teamData as Team);
    return p;
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await fetchAll();
      if (!alive || !p) return;
      const role = (p.role ?? 'coach') as UserRole;
      const isAdminPath = pathname.startsWith('/dashboard/admin');
      const isAthletePath = pathname.startsWith('/dashboard/athlete');
      const isCaptainPath = pathname.startsWith('/dashboard/captain');
      const isSettings = pathname === '/dashboard/settings';
      if (isAdminPath && role !== 'admin') {
        router.replace('/dashboard');
        return;
      }
      if (role === 'athlete' && !isAthletePath && !isSettings) {
        router.replace('/dashboard/athlete');
        return;
      }
      if (role === 'captain' && !isCaptainPath && !isSettings) {
        router.replace('/dashboard/captain');
        return;
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const role: UserRole = (prefs?.role as UserRole) ?? 'coach';

  if (loading || !prefs || !team) {
    return (
      <SidebarProvider>
        <AppSidebar role="coach" />
        <SidebarInset>
          <header className="flex h-16 items-center gap-2 border-b border-[color:var(--border)] bg-[color:var(--card)] px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mx-2 h-4 bg-[color:var(--border)]" />
            <Skeleton className="h-5 w-48" />
          </header>
          <main className="flex-1 p-6 space-y-4">
            <Skeleton className="h-10 w-72" />
            <div className="grid grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-80" />
          </main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <Context.Provider value={{ prefs, team, role, refresh: async () => { await fetchAll(); } }}>
      <SidebarProvider>
        <AppSidebar role={role} teamName={team.name} hasLinkedAthlete={Boolean(prefs.impersonate_player_id)} />
        <SidebarInset>{children}</SidebarInset>
        <CommandPalette teamId={prefs.team_id} isAdmin={role === 'admin'} />
      </SidebarProvider>
    </Context.Provider>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully`. Some pages will fail at runtime because they pass `live` / `subtitle` / etc. that the new PageHeader handles, but TS compile is clean (extra props like `code` and `italic` don't cause TS errors in JSX since the new component just doesn't accept them and they'll be… actually wait — extra props ARE a TS error). 

Inspect the build output. If TS errors arise about old `code=` / `italic=` props, note them — they'll be cleaned up in the page tasks (12–28).

**If build fails because of legacy props on PageHeader:**

Make `PageHeader` accept (and ignore) `code` and `italic` as deprecated props during the migration. Open `apps/web/src/components/v3/page-header.tsx` and modify the prop types:

```tsx
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  live,
  // Deprecated props from v2 — silently ignored, removed in page rewrites
  code: _code,
  italic: _italic,
  right,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  live?: boolean;
  /** @deprecated v2 prop */
  code?: React.ReactNode;
  /** @deprecated v2 prop */
  italic?: React.ReactNode;
  /** @deprecated use `actions` */
  right?: React.ReactNode;
}) {
```

And use `actions ?? right` where `actions` is rendered. This lets old call sites compile until we rewrite each page in tasks 12–28.

Re-run build:
```bash
cd apps/web && bun run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`.

---

## Task 10: Refit app-sidebar — light, plain labels, no codes

**Files:**
- Modify: `apps/web/src/components/app-sidebar.tsx` (full rewrite)

- [ ] **Step 1: Rewrite app-sidebar.tsx**

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import {
  LayoutDashboard,
  Users,
  Dumbbell,
  Calendar,
  Settings,
  Shield,
  Database,
  Activity,
  User as UserIcon,
  MessageSquareText,
  Search,
  LogOut,
  ChevronsUpDown,
  Building2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Brand } from './v3/brand';
import { Pill } from './v3/pill';
import type { UserRole } from '@reflect-live/shared';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const COACH_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/players', label: 'Athletes', icon: Users },
  { href: '/dashboard/fitness', label: 'Activity', icon: Dumbbell },
  { href: '/dashboard/events', label: 'Schedule', icon: Calendar },
];

const ATHLETE_NAV: NavItem[] = [
  { href: '/dashboard/athlete', label: 'My view', icon: UserIcon },
  { href: '/dashboard/athlete#messages', label: 'My messages', icon: MessageSquareText },
];

const CAPTAIN_NAV: NavItem[] = [
  { href: '/dashboard/captain', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/captain/follow-ups', label: 'Follow-ups', icon: Users },
  { href: '/dashboard/events', label: 'Schedule', icon: Calendar },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/dashboard/admin', label: 'Admin', icon: Shield },
  { href: '/dashboard/admin/users', label: 'Users', icon: Users },
  { href: '/dashboard/admin/teams', label: 'Teams', icon: Building2 },
  { href: '/dashboard/admin/system', label: 'System', icon: Activity },
  { href: '/dashboard/admin/database', label: 'Database', icon: Database },
];

const ROLE_PILL: Record<UserRole, { tone: 'red' | 'blue' | 'amber' | 'green'; label: string }> = {
  admin:   { tone: 'red',   label: 'Admin' },
  coach:   { tone: 'blue',  label: 'Coach' },
  captain: { tone: 'amber', label: 'Captain' },
  athlete: { tone: 'green', label: 'Athlete' },
};

function NavGroupBlock({ group }: { group: NavGroup }) {
  const pathname = usePathname();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href.split('#')[0]));
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                  <Link href={item.href}>
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar({
  role,
  teamName,
  hasLinkedAthlete,
}: {
  role: UserRole;
  teamName?: string;
  hasLinkedAthlete?: boolean;
}) {
  const groups: NavGroup[] = [];

  if (role === 'coach' || role === 'admin') groups.push({ label: 'Team', items: COACH_NAV });
  if (role === 'captain') groups.push({ label: 'Captain', items: CAPTAIN_NAV });
  if (role === 'athlete') groups.push({ label: 'Your view', items: ATHLETE_NAV });
  if (hasLinkedAthlete && role !== 'athlete') {
    groups.push({
      label: 'Also you',
      items: [{ href: '/dashboard/athlete', label: 'My view', icon: UserIcon }],
    });
  }
  if (role === 'admin') groups.push({ label: 'Administration', items: ADMIN_NAV });

  const rolePill = ROLE_PILL[role];

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-1.5 transition hover:opacity-90">
          <Brand size="md" />
        </Link>
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <Pill tone={rolePill.tone}>{rolePill.label}</Pill>
          {teamName && (
            <span className="truncate text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">
              {teamName}
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((g) => <NavGroupBlock key={g.label} group={g} />)}

        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={usePathname() === '/dashboard/settings'} tooltip="Settings">
                  <Link href="/dashboard/settings">
                    <Settings className="size-4" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UserMenuBlock />
      </SidebarFooter>
    </Sidebar>
  );
}

function UserMenuBlock() {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const name = user?.fullName ?? user?.firstName ?? 'Account';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const avatarUrl = user?.imageUrl;
  const initials = (name ?? '')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <Avatar className="h-8 w-8 rounded-md">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                <AvatarFallback className="rounded-md bg-[color:var(--blue-soft)] text-[color:var(--blue)] font-bold text-[10.5px]">
                  {initials || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-[11.5px] text-[color:var(--ink-mute)]">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-60">
            <DropdownMenuLabel className="flex items-center gap-2">
              <Avatar className="h-8 w-8 rounded-md">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                <AvatarFallback className="rounded-md">{initials || 'U'}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-[11.5px] text-[color:var(--ink-mute)]">{email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openUserProfile()}>
              <UserIcon className="size-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <Settings className="size-4" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
                document.dispatchEvent(ev);
              }}
            >
              <Search className="size-4" />
              <span>Command menu</span>
              <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => signOut({ redirectUrl: '/' })}>
              <LogOut className="size-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

---

## Task 11: Refit display components — bulk pass

**Files:**
- Modify: `apps/web/src/components/live-feed.tsx`
- Modify: `apps/web/src/components/watchlist-panel.tsx`
- Modify: `apps/web/src/components/weather-grid.tsx`
- Modify: `apps/web/src/components/news-feed.tsx`
- Modify: `apps/web/src/components/activity-log-timeline.tsx`
- Modify: `apps/web/src/components/worker-health-card.tsx`
- Modify: `apps/web/src/components/metric-card.tsx`
- Modify: `apps/web/src/components/star-button.tsx`

This is the longest task — eight component refits. Each is a wholesale swap from dark-theme tokens to v3 tokens, removing references to `bone`, `signal`, `panel`, `panel-raised`, `panel-over`, `hairline`, `station-code`, `eyebrow`, `eyebrow-signal`, `mono`, `Stamp`, `SectionTag`. Replace with v3 primitives (`Pill`, `MessageRow`, plain Tailwind classes referring to `var(--card)`, `var(--ink)`, `var(--border)`, etc.).

- [ ] **Step 1: live-feed.tsx**

Replace contents with:

```tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { TwilioMessage, Category, Player } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pill, type PillTone } from './v3/pill';
import { buildPhoneIndex, prettyCategory, prettyPhone, relativeTime } from '@/lib/format';

const CATS: Array<{ value: Category | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'workout', label: 'Workouts' },
  { value: 'rehab', label: 'Rehabs' },
  { value: 'survey', label: 'Check-ins' },
  { value: 'chat', label: 'Chat' },
];

const CAT_TONE: Record<Category, PillTone> = {
  workout: 'green',
  rehab: 'amber',
  survey: 'blue',
  chat: 'mute',
};

function clockHM(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function LiveFeed({ teamId }: { teamId: number }) {
  const sb = useSupabase();
  const [msgs, setMsgs] = useState<TwilioMessage[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());
  const mountedRef = useRef(true);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      const [{ data: m }, { data: p }] = await Promise.all([
        sb.from('twilio_messages').select('*').eq('team_id', teamId).order('date_sent', { ascending: false }).limit(100),
        sb.from('players').select('*').eq('team_id', teamId),
      ]);
      if (!cancelled) {
        if (m) setMsgs(m as TwilioMessage[]);
        if (p) setPlayers(p as Player[]);
      }
    })();
    const ch = sb
      .channel('messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'twilio_messages', filter: `team_id=eq.${teamId}` },
        (pl) => {
          const next = pl.new as TwilioMessage;
          setMsgs((prev) => [next, ...prev].slice(0, 200));
          setNewIds((prev) => new Set(prev).add(next.sid));
          setTimeout(() => {
            if (!mountedRef.current) return;
            setNewIds((prev) => {
              const n = new Set(prev);
              n.delete(next.sid);
              return n;
            });
          }, 2400);
        },
      )
      .subscribe();
    return () => {
      mountedRef.current = false;
      cancelled = true;
      sb.removeChannel(ch);
    };
  }, [sb, teamId]);

  const phoneIndex = useMemo(() => buildPhoneIndex(players), [players]);
  const playerByIdMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const filtered = filter === 'all' ? msgs : msgs.filter((m) => m.category === filter);

  function resolvePlayer(m: TwilioMessage): Player | null {
    if (m.player_id) return playerByIdMap.get(m.player_id) ?? null;
    const raw = m.direction === 'inbound' ? m.from_number : m.to_number;
    const clean = (raw ?? '').replace(/^(whatsapp|sms):/i, '');
    return phoneIndex.get(clean) ?? null;
  }

  function otherPartyPhone(m: TwilioMessage): string | null {
    const raw = m.direction === 'inbound' ? m.from_number : m.to_number;
    return raw ? raw.replace(/^(whatsapp|sms):/i, '') : null;
  }

  return (
    <section
      className="rounded-2xl bg-[color:var(--card)] border"
      style={{ borderColor: 'var(--border)' }}
    >
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-[color:var(--ink)]">Messages</h2>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Category | 'all')}>
          <TabsList className="h-9 bg-[color:var(--paper)] border" style={{ borderColor: 'var(--border)' }}>
            {CATS.map((c) => (
              <TabsTrigger
                key={c.value}
                value={c.value}
                className="text-[12px] font-semibold data-[state=active]:bg-[color:var(--card)] data-[state=active]:text-[color:var(--blue)]"
              >
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      {filtered.length === 0 ? (
        <div className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">
          — no messages in this filter —
        </div>
      ) : (
        <ScrollArea className="h-[460px]">
          {filtered.map((m) => {
            const player = resolvePlayer(m);
            const otherPhone = otherPartyPhone(m);
            const senderLabel = player ? player.name : 'Unknown';
            const tone = CAT_TONE[m.category] ?? 'mute';
            const isHighlight = newIds.has(m.sid);
            return (
              <div
                key={m.sid}
                className={`flex items-start gap-4 px-6 py-3.5 border-b last:border-b-0 transition ${isHighlight ? 'slide-in-row' : ''}`}
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="mono text-[12px] font-semibold text-[color:var(--ink-mute)] tabular min-w-[52px] pt-[3px]">
                  {clockHM(m.date_sent)}
                </div>
                <div className="pt-[3px]">
                  <Pill tone={tone}>{prettyCategory(m.category)}</Pill>
                </div>
                <div className="min-w-0 flex-1">
                  {player ? (
                    <Link href={`/dashboard/player/${player.id}`} className="text-[14px] font-semibold text-[color:var(--ink)] hover:text-[color:var(--blue)] transition">
                      {senderLabel}
                    </Link>
                  ) : (
                    <span className="text-[14px] font-semibold text-[color:var(--ink-mute)]">{senderLabel}</span>
                  )}
                  {!player && otherPhone && (
                    <span className="ml-2 text-[11.5px] text-[color:var(--ink-mute)]">{prettyPhone(otherPhone)}</span>
                  )}
                  {m.body && (
                    <div className="mt-0.5 text-[13px] text-[color:var(--ink-soft)] leading-relaxed">{m.body}</div>
                  )}
                  <div className="mt-1 text-[11.5px] text-[color:var(--ink-mute)]">{relativeTime(m.date_sent, now)}</div>
                </div>
              </div>
            );
          })}
        </ScrollArea>
      )}
    </section>
  );
}
```

- [ ] **Step 2: watchlist-panel.tsx**

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Player } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from './v3/pill';
import { relativeTime } from '@/lib/format';

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function statusOf(iso: string | undefined): { tone: 'green' | 'amber' | 'mute'; label: string } {
  if (!iso) return { tone: 'mute', label: 'Quiet' };
  const hrs = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (hrs < 1) return { tone: 'green', label: 'On wire' };
  if (hrs < 24) return { tone: 'green', label: 'Today' };
  if (hrs < 72) return { tone: 'amber', label: 'Watch' };
  return { tone: 'mute', label: 'Quiet' };
}

export function WatchlistPanel({ teamId, watchlist }: { teamId: number; watchlist: number[] }) {
  const sb = useSupabase();
  const [players, setPlayers] = useState<Player[]>([]);
  const [lastSeen, setLastSeen] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!watchlist.length) {
      setPlayers([]);
      setLastSeen({});
      return;
    }
    (async () => {
      const [{ data: ps }, { data: msgs }] = await Promise.all([
        sb.from('players').select('*').in('id', watchlist).eq('team_id', teamId),
        sb.from('twilio_messages').select('player_id,date_sent').in('player_id', watchlist).eq('direction', 'inbound').order('date_sent', { ascending: false }),
      ]);
      if (ps) setPlayers(ps as Player[]);
      const seen: Record<number, string> = {};
      for (const m of (msgs ?? []) as Array<{ player_id: number; date_sent: string }>) {
        if (m.player_id != null && !seen[m.player_id]) seen[m.player_id] = m.date_sent;
      }
      setLastSeen(seen);
    })();
  }, [sb, teamId, watchlist]);

  const sorted = useMemo(() => {
    return [...players].sort((a, b) => {
      const ta = lastSeen[a.id] ? new Date(lastSeen[a.id]).getTime() : 0;
      const tb = lastSeen[b.id] ? new Date(lastSeen[b.id]).getTime() : 0;
      return tb - ta;
    });
  }, [players, lastSeen]);

  return (
    <section className="rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-[color:var(--ink)]">Starred athletes</h2>
        <span className="text-[11.5px] text-[color:var(--ink-mute)]">{players.length}</span>
      </header>

      {!players.length ? (
        <p className="text-[13px] text-[color:var(--ink-mute)]">— star an athlete to track them here —</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((p) => {
            const ts = lastSeen[p.id];
            const status = statusOf(ts);
            return (
              <li key={p.id}>
                <Link
                  href={`/dashboard/player/${p.id}`}
                  className="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition hover:bg-[color:var(--card-hover)] hover:border-[color:var(--blue-soft-2)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="grid size-8 place-items-center rounded-md border bg-[color:var(--paper)] text-[10.5px] font-bold text-[color:var(--ink-soft)]" style={{ borderColor: 'var(--border)' }}>
                    {initials(p.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-[color:var(--ink)] truncate">{p.name}</div>
                    <div className="text-[11.5px] text-[color:var(--ink-mute)] truncate">
                      {p.group ?? 'No group'}{ts ? ` · ${relativeTime(ts)}` : ''}
                    </div>
                  </div>
                  <Pill tone={status.tone}>{status.label}</Pill>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: weather-grid.tsx**

```tsx
'use client';
import { useEffect, useState } from 'react';
import type { Location, WeatherSnapshot } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from './v3/pill';

const WMO_LABEL: Record<number, string> = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 95: 'Thunderstorm',
};

function clockHM(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function WeatherGrid({ teamId }: { teamId: number }) {
  const sb = useSupabase();
  const [locs, setLocs] = useState<Location[]>([]);
  const [latest, setLatest] = useState<Record<number, WeatherSnapshot>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: locsData } = await sb
        .from('locations')
        .select('*')
        .eq('team_id', teamId)
        .order('kind')
        .order('event_date');
      if (!alive || !locsData) return;
      setLocs(locsData as Location[]);
      const ids = (locsData as Location[]).map((l) => l.id);
      if (ids.length) {
        const { data: snaps } = await sb
          .from('weather_snapshots')
          .select('*')
          .in('location_id', ids)
          .order('fetched_at', { ascending: false });
        if (snaps) {
          const byLoc: Record<number, WeatherSnapshot> = {};
          for (const s of snaps as WeatherSnapshot[]) if (!byLoc[s.location_id]) byLoc[s.location_id] = s;
          setLatest(byLoc);
        }
      }
    })();
    const ch = sb
      .channel('weather')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'weather_snapshots', filter: `team_id=eq.${teamId}` },
        (p) => {
          const s = p.new as WeatherSnapshot;
          setLatest((prev) => ({ ...prev, [s.location_id]: s }));
        },
      )
      .subscribe();
    return () => {
      alive = false;
      sb.removeChannel(ch);
    };
  }, [sb, teamId]);

  if (!locs.length) {
    return <p className="text-[13px] text-[color:var(--ink-mute)]">— no venues configured —</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {locs.map((l) => {
        const s = latest[l.id];
        const tone = l.kind === 'training' ? 'green' : 'blue';
        return (
          <div
            key={l.id}
            className="rounded-xl bg-[color:var(--card)] border p-4"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-[14px] font-semibold text-[color:var(--ink)]">{l.name}</div>
              <Pill tone={tone}>{l.kind}</Pill>
            </div>
            {s ? (
              <>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-[34px] font-bold tabular leading-none text-[color:var(--ink)]">
                    {s.temp_c != null ? Math.round(s.temp_c) : '—'}
                  </span>
                  <span className="text-[14px] text-[color:var(--ink-mute)]">°C</span>
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--ink-mute)]">
                  {s.condition_code != null ? WMO_LABEL[s.condition_code] ?? `code ${s.condition_code}` : '—'}
                  {s.wind_kph != null && ` · wind ${Math.round(s.wind_kph)} kph`}
                  {s.precip_mm != null && s.precip_mm > 0 && ` · ${s.precip_mm} mm`}
                </div>
                <div className="mt-3 mono text-[11px] text-[color:var(--ink-mute)] tabular">updated {clockHM(s.fetched_at)}</div>
              </>
            ) : (
              <div className="mt-3 text-[13px] text-[color:var(--ink-mute)]">— waiting for first reading —</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: news-feed.tsx**

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/lib/supabase-browser';
import type { NewsItem } from '@reflect-live/shared';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExternalLink } from 'lucide-react';
import { relativeTime } from '@/lib/format';

const SOURCE_LABEL: Record<string, string> = { swimswam: 'SwimSwam' };

export function NewsFeed() {
  const sb = useSupabase();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const [now, setNow] = useState(Date.now());
  const mountedRef = useRef(true);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      const { data } = await sb.from('news_items').select('*').order('published_at', { ascending: false, nullsFirst: false }).limit(25);
      if (!cancelled && data) setItems(data as NewsItem[]);
    })();
    const ch = sb
      .channel('news')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news_items' }, (p) => {
        const next = p.new as NewsItem;
        setItems((prev) => [next, ...prev].slice(0, 50));
        setNewIds((prev) => new Set(prev).add(next.id));
        setTimeout(() => {
          if (!mountedRef.current) return;
          setNewIds((prev) => {
            const n = new Set(prev);
            n.delete(next.id);
            return n;
          });
        }, 2200);
      })
      .subscribe();
    return () => {
      mountedRef.current = false;
      cancelled = true;
      sb.removeChannel(ch);
    };
  }, [sb]);

  return (
    <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-base font-bold text-[color:var(--ink)]">News</h2>
        <span className="text-[11.5px] text-[color:var(--ink-mute)]">{items.length} · 30m cycle</span>
      </header>
      {!items.length ? (
        <div className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">— no stories yet —</div>
      ) : (
        <ScrollArea className="h-[460px]">
          {items.map((it) => (
            <a
              key={it.id}
              href={it.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-start gap-4 px-6 py-3.5 border-b last:border-b-0 transition hover:bg-[color:var(--card-hover)] ${newIds.has(it.id) ? 'slide-in-row' : ''}`}
              style={{ borderColor: 'var(--border)' }}
            >
              {it.image_url && (
                <img src={it.image_url} alt="" className="size-14 shrink-0 rounded-md object-cover border" style={{ borderColor: 'var(--border)' }} loading="lazy" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">
                  <span>{SOURCE_LABEL[it.source] ?? it.source}</span>
                  <span>·</span>
                  <span className="tabular">{relativeTime(it.published_at ?? it.ingested_at, now)}</span>
                </div>
                <div className="mt-1 text-[14px] font-semibold text-[color:var(--ink)] hover:text-[color:var(--blue)] transition">{it.title}</div>
                {it.summary && <p className="mt-1 text-[12.5px] text-[color:var(--ink-mute)] line-clamp-2 leading-snug">{it.summary}</p>}
              </div>
              <ExternalLink className="size-3.5 text-[color:var(--ink-mute)]" />
            </a>
          ))}
        </ScrollArea>
      )}
    </section>
  );
}
```

- [ ] **Step 5: activity-log-timeline.tsx**

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ActivityLog, Player } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { Pill } from './v3/pill';
import { prettyDate } from '@/lib/format';

export function ActivityLogTimeline({ teamId }: { teamId: number }) {
  const sb = useSupabase();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: l }, { data: p }] = await Promise.all([
        sb.from('activity_logs').select('*').eq('team_id', teamId).order('logged_at', { ascending: false }).limit(20),
        sb.from('players').select('*').eq('team_id', teamId),
      ]);
      if (l) setLogs(l as ActivityLog[]);
      if (p) setPlayers(p as Player[]);
    })();
  }, [sb, teamId]);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  return (
    <section className="rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-[color:var(--ink)]">Activity</h2>
        <span className="text-[11.5px] text-[color:var(--ink-mute)]">{logs.length}</span>
      </header>
      {!logs.length ? (
        <p className="text-[13px] text-[color:var(--ink-mute)]">— no recent activity —</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {logs.map((l) => {
            const player = l.player_id ? byId.get(l.player_id) : null;
            const tone = l.kind === 'workout' ? 'green' : 'amber';
            return (
              <li key={l.id} className="flex items-start gap-4 py-3 border-[color:var(--border)]">
                <div className="text-[12px] font-semibold text-[color:var(--ink-mute)] tabular min-w-[64px] pt-0.5">
                  {prettyDate(l.logged_at)}
                </div>
                <div className="pt-0.5">
                  <Pill tone={tone}>{l.kind}</Pill>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-[color:var(--ink)]">{player?.name ?? 'Unknown'}</div>
                  <div className="text-[13px] text-[color:var(--ink-soft)] leading-relaxed">{l.description}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 6: worker-health-card.tsx**

```tsx
'use client';
import { useEffect, useState } from 'react';
import type { WorkerState } from '@reflect-live/shared';
import { useSupabase } from '@/lib/supabase-browser';
import { StatCell } from './v3/stat-cell';

export function WorkerHealthCard() {
  const sb = useSupabase();
  const [state, setState] = useState<WorkerState | null>(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      const { data } = await sb.from('worker_state').select('*').eq('id', 1).maybeSingle();
      if (alive && data) setState(data as WorkerState);
    }
    tick();
    const id = setInterval(tick, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [sb]);

  const lastTwilio = state?.last_twilio_poll_at ? new Date(state.last_twilio_poll_at) : null;
  const ago = lastTwilio ? Math.round((Date.now() - lastTwilio.getTime()) / 1000) : null;
  const errors = state?.consecutive_errors ?? 0;
  const healthy = errors === 0 && ago !== null && ago < 900;

  const tone = errors > 0 ? 'red' : healthy ? 'green' : 'amber';
  const status = errors > 0 ? 'Errored' : healthy ? 'Healthy' : 'Stale';

  return (
    <StatCell
      label="Worker"
      value={status}
      tone={tone}
      sub={ago != null ? `last poll ${ago}s ago${errors ? ` · ${errors} err` : ''}` : 'no data'}
    />
  );
}
```

- [ ] **Step 7: metric-card.tsx — thin wrapper**

```tsx
'use client';

import * as React from 'react';
import { StatCell, type StatTone } from './v3/stat-cell';

export type MetricTone = 'default' | 'primary' | 'success' | 'warning' | 'danger';

const MAP: Record<MetricTone, StatTone> = {
  default: 'default',
  primary: 'blue',
  success: 'green',
  warning: 'amber',
  danger: 'red',
};

/**
 * Compat wrapper. Existing pages use `<Metric>`; new pages prefer `<StatCell>` directly.
 */
export function Metric({
  label,
  value,
  sub,
  tone = 'default',
  icon: _icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: MetricTone;
  icon?: React.ReactNode;
  spark?: number[];
}) {
  return <StatCell label={label} value={value} sub={sub} tone={MAP[tone]} />;
}
```

- [ ] **Step 8: star-button.tsx**

```tsx
'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { useSupabase } from '@/lib/supabase-browser';
import { cn } from '@/lib/utils';

export function StarButton({ playerId, initial }: { playerId: number; initial: boolean }) {
  const sb = useSupabase();
  const [starred, setStarred] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const { data: pref } = await sb.from('user_preferences').select('clerk_user_id, watchlist').maybeSingle();
    if (!pref) {
      setBusy(false);
      return;
    }
    const current: number[] = pref.watchlist ?? [];
    const next = starred ? current.filter((id) => id !== playerId) : [...current, playerId];
    await sb
      .from('user_preferences')
      .update({ watchlist: next, updated_at: new Date().toISOString() })
      .eq('clerk_user_id', pref.clerk_user_id);
    setStarred(!starred);
    setBusy(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-60',
        starred
          ? 'bg-[color:var(--blue-soft)] border-[color:var(--blue-soft-2)] text-[color:var(--blue)] hover:bg-[color:var(--blue-soft-2)]'
          : 'border-[color:var(--border)] text-[color:var(--ink-soft)] hover:border-[color:var(--blue)] hover:text-[color:var(--blue)]',
      )}
    >
      <Star className={cn('size-3.5', starred && 'fill-current')} />
      {starred ? 'Starred' : 'Star'}
    </button>
  );
}
```

- [ ] **Step 9: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully`. Some pages may still have TS errors referencing dropped components; that's resolved in the page tasks.

- [ ] **Step 10: Commit display refits**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live"
git add apps/web/src/components/dashboard-shell.tsx apps/web/src/components/app-sidebar.tsx apps/web/src/components/live-feed.tsx apps/web/src/components/watchlist-panel.tsx apps/web/src/components/weather-grid.tsx apps/web/src/components/news-feed.tsx apps/web/src/components/activity-log-timeline.tsx apps/web/src/components/worker-health-card.tsx apps/web/src/components/metric-card.tsx apps/web/src/components/star-button.tsx
git commit -m "phase-0: refit display components to v3 (light, plain, primitives)"
```

---

## Task 12: Refit command-palette

**Files:**
- Modify: `apps/web/src/components/command-palette.tsx`

The current file already uses plain English nav names from the previous pass. The remaining work: it inherits dark styling from globals — but since shadcn's command primitive uses CSS vars, it auto-light-themes. Verify and minor cleanup.

- [ ] **Step 1: Open and audit the file**

Read `apps/web/src/components/command-palette.tsx`. Check it has no references to `bone`, `signal`, `panel`, `mono` Tailwind classes, station codes. Should already be clean from previous work.

- [ ] **Step 2: Replace any `mono` className references with explicit `font-mono`** (if any remain)

If the file has classes like `mono text-[0.7rem]`, they still work because we kept a `.mono` utility in globals.css. No change needed.

- [ ] **Step 3: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`.

---

## Task 13: Landing page rewrite

**Files:**
- Modify: `apps/web/src/app/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite landing page**

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { Brand } from '@/components/v3/brand';

export default async function Landing() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard');

  return (
    <main className="min-h-screen bg-[color:var(--paper)] text-[color:var(--ink)]">
      {/* Masthead */}
      <header className="border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-5 md:px-10">
          <Brand size="md" />
          <Link
            href="/sign-in"
            className="text-[13px] font-semibold text-[color:var(--ink-soft)] hover:text-[color:var(--blue)] transition"
          >
            Sign in →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1280px] px-6 py-20 md:px-10 md:py-32 reveal reveal-1">
        <h1 className="max-w-[18ch] text-5xl md:text-7xl font-bold tracking-[-0.02em] leading-[1.05] text-[color:var(--ink)]">
          Team check-ins, on every channel — visible to coaches in real time.
        </h1>
        <p className="mt-8 max-w-[55ch] text-lg md:text-xl text-[color:var(--ink-soft)] leading-relaxed">
          Athletes text. The dashboard updates live. Workouts, rehabs, readiness, fitness scoring,
          AI assistant — all in one place. No app to install.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-[14px] font-bold text-white transition hover:opacity-90"
            style={{ background: 'var(--blue)' }}
          >
            Open the dashboard
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-[14px] font-bold border transition hover:border-[color:var(--blue)] hover:text-[color:var(--blue)]"
            style={{ borderColor: 'var(--border-2)', color: 'var(--ink-soft)' }}
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Feature grid */}
      <section
        className="border-y"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
      >
        <div className="mx-auto max-w-[1280px] px-6 py-20 md:px-10">
          <h2 className="text-2xl md:text-3xl font-bold text-[color:var(--ink)] mb-10">What's inside</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
            {FEATURES.map((f) => (
              <article key={f.title}>
                <h3 className="text-[18px] font-bold text-[color:var(--ink)] mb-2">{f.title}</h3>
                <p className="text-[14px] text-[color:var(--ink-soft)] leading-relaxed">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[920px] px-6 py-24 md:px-10 md:py-32 text-center">
        <h2 className="text-3xl md:text-5xl font-bold tracking-[-0.02em] text-[color:var(--ink)]">
          Your team is already on the wire.
        </h2>
        <p className="mt-4 text-[15px] text-[color:var(--ink-mute)]">The dashboard is three clicks away.</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 px-7 py-4 rounded-xl text-[14px] font-bold text-white transition hover:opacity-90"
            style={{ background: 'var(--blue)' }}
          >
            Open the dashboard
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      {/* Colophon */}
      <footer className="border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-6 md:px-10 text-[12px] text-[color:var(--ink-mute)]">
          <Brand size="sm" />
          <span>MPCS 51238 · Spring 2026 · UChicago</span>
        </div>
      </footer>
    </main>
  );
}

const FEATURES = [
  { title: 'Messages', body: 'Every reply tagged and time-stamped. Workouts, rehabs, check-ins, chat — sorted on arrival.' },
  { title: 'Readiness', body: 'Daily 0–10 surveys roll into a team gauge. Flags when anyone dips below four.' },
  { title: 'Activity', body: 'Workouts and rehabs logged via SMS. Fitness scoring and weekly leaderboard.' },
  { title: 'Schedule', body: 'Send surveys on a schedule. Cadence: once or weekly. Reminders at 60 minutes.' },
  { title: 'Heatmap', body: 'Where the team is hurting. Body-region density across any time window.' },
  { title: 'AI Assistant', body: 'Ask questions about your team. Pulls real data, no hedging, cites the numbers.' },
];
```

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

---

## Task 14: Auth pages — sign-in, sign-up, onboarding

**Files:**
- Modify: `apps/web/src/app/sign-in/[[...sign-in]]/page.tsx`
- Modify: `apps/web/src/app/sign-up/[[...sign-up]]/page.tsx`
- Modify: `apps/web/src/app/onboarding/page.tsx`

- [ ] **Step 1: sign-in/[[...sign-in]]/page.tsx**

```tsx
import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { Brand } from '@/components/v3/brand';

export default function Page() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[color:var(--paper)]">
      <div className="mb-10">
        <Link href="/"><Brand size="lg" /></Link>
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: 'w-full max-w-[440px]',
            card: 'bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl shadow-[var(--shadow)]',
            headerTitle: 'font-bold tracking-tight',
            formButtonPrimary: 'bg-[color:var(--blue)] hover:bg-[color:var(--blue-2)] rounded-xl font-semibold',
            footerActionLink: 'text-[color:var(--blue)]',
          },
          variables: {
            colorPrimary: '#1F5FB0',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
          },
        }}
      />
      <Link href="/" className="mt-8 text-[12px] text-[color:var(--ink-mute)] hover:text-[color:var(--blue)] transition">
        ← Back to home
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: sign-up/[[...sign-up]]/page.tsx**

Same structure as sign-in but importing `SignUp` from `@clerk/nextjs` instead of `SignIn`. Copy the template above and swap the import + component name.

```tsx
import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { Brand } from '@/components/v3/brand';

export default function Page() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[color:var(--paper)]">
      <div className="mb-10">
        <Link href="/"><Brand size="lg" /></Link>
      </div>
      <SignUp
        appearance={{
          elements: {
            rootBox: 'w-full max-w-[440px]',
            card: 'bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl shadow-[var(--shadow)]',
            headerTitle: 'font-bold tracking-tight',
            formButtonPrimary: 'bg-[color:var(--blue)] hover:bg-[color:var(--blue-2)] rounded-xl font-semibold',
            footerActionLink: 'text-[color:var(--blue)]',
          },
          variables: {
            colorPrimary: '#1F5FB0',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
          },
        }}
      />
      <Link href="/" className="mt-8 text-[12px] text-[color:var(--ink-mute)] hover:text-[color:var(--blue)] transition">
        ← Back to home
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: onboarding/page.tsx**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brand } from '@/components/v3/brand';

interface TeamPub { id: number; name: string; code: string; description: string | null; }

export default function Onboarding() {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamPub[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/teams-public');
      const j = await r.json();
      const ts = j.teams ?? [];
      setTeams(ts);
      if (ts.length === 1) setPickedId(ts[0].id);
      setLoading(false);
    })();
  }, []);

  async function save() {
    if (!pickedId) return;
    setSaving(true);
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ team_id: pickedId, watchlist: [], group_filter: null }),
    });
    router.push('/dashboard');
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-[color:var(--paper)]">
      <div className="w-full max-w-[480px]">
        <div className="mb-10 text-center"><Brand size="lg" /></div>
        <section className="rounded-2xl bg-[color:var(--card)] border p-8 shadow-[var(--shadow)]" style={{ borderColor: 'var(--border)' }}>
          <h1 className="text-2xl font-bold tracking-tight text-[color:var(--ink)]">Welcome</h1>
          <p className="mt-2 text-[14px] text-[color:var(--ink-mute)]">Pick the team you belong to. Your role is assigned by your team admin.</p>

          {loading ? (
            <p className="mt-6 text-[13px] text-[color:var(--ink-mute)]">Loading teams…</p>
          ) : teams.length === 0 ? (
            <p className="mt-6 text-[13px] text-[color:var(--ink-mute)]">No teams yet — contact your admin.</p>
          ) : teams.length === 1 ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
                <div className="text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Your team</div>
                <div className="mt-1 text-[18px] font-bold text-[color:var(--ink)]">{teams[0].name}</div>
                {teams[0].description && (
                  <div className="mt-2 text-[13px] text-[color:var(--ink-mute)]">{teams[0].description}</div>
                )}
              </div>
              <Button
                onClick={save}
                disabled={saving}
                className="w-full rounded-xl font-bold"
                style={{ background: 'var(--blue)' }}
              >
                {saving ? 'Setting up…' : `Join ${teams[0].name} →`}
              </Button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <Select value={pickedId ? String(pickedId) : ''} onValueChange={(v) => setPickedId(Number(v))}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Pick your team…" /></SelectTrigger>
                <SelectContent>
                  {teams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                onClick={save}
                disabled={saving || !pickedId}
                className="w-full rounded-xl font-bold"
                style={{ background: 'var(--blue)' }}
              >
                {saving ? 'Setting up…' : 'Continue →'}
              </Button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Build + commit**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live"
git add apps/web/src/app/page.tsx apps/web/src/app/sign-in apps/web/src/app/sign-up apps/web/src/app/onboarding
git commit -m "phase-0: rewrite landing + auth pages to v3 light"
```

---

## Tasks 15–22: Page rewrites — same pattern, page by page

For each page below, the **rewrite pattern is identical**:

1. Open the page.
2. Replace `import { PageHeader } from '@/components/dashboard-shell'` is fine (it now re-exports the v3 PageHeader). Keep that line.
3. Remove any imports of dropped components: `SectionTag`, `Stamp`, `ReadinessDial`, `StatReadout`, `BrandMark`. Replace usages: `SectionTag` → just an `<h2>` heading inline; `Stamp` → `<Pill>`; `ReadinessDial` → `<ReadinessBar>`; `StatReadout` → `<StatCell>`; `BrandMark` → `<Brand>`.
4. Replace any classNames using `bone`, `signal`, `panel`, `panel-raised`, `panel-over`, `hairline`, `station-code`, `eyebrow`, `eyebrow-signal` with v3 equivalents (`var(--ink)`, `var(--blue)`, `var(--card)`, `var(--paper-2)`, `var(--border)`, plain text classes).
5. Pass `actions=` instead of `right=` to PageHeader (still works due to deprecation prop, but use the new name).
6. Drop any `code=` and `italic=` props from PageHeader calls.
7. Replace decorative wrappers like `panel relative overflow-hidden` with `rounded-2xl bg-[color:var(--card)] border`.

For each page task, the worker should: (a) read the page file, (b) apply the pattern above, (c) verify build, (d) NOT commit yet — commits batch at task 22.

### Task 15: Coach dashboard `/dashboard/page.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx` (full rewrite)

- [ ] **Step 1: Replace contents**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
import { ReadinessBar } from '@/components/v3/readiness-bar';
import { LiveFeed } from '@/components/live-feed';
import { WatchlistPanel } from '@/components/watchlist-panel';
import { ActivityLogTimeline } from '@/components/activity-log-timeline';
import { useSupabase } from '@/lib/supabase-browser';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DAY_OPTIONS = [
  { value: '1', label: '24 hours' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
];

interface Counts {
  messages: number;
  activePlayers: number;
  rosterSize: number;
  responseRate: number;
  avgReadiness: number | null;
  flags: number;
  surveyCount: number;
}

export default function Dashboard() {
  const { prefs, team } = useDashboard();
  const sb = useSupabase();
  const [days, setDays] = useState(1);
  const [counts, setCounts] = useState<Counts>({
    messages: 0, activePlayers: 0, rosterSize: 0, responseRate: 0,
    avgReadiness: null, flags: 0, surveyCount: 0,
  });

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const groupFilter = prefs.group_filter;
      const pq = sb.from('players').select('id,phone_e164').eq('team_id', prefs.team_id);
      if (groupFilter) pq.eq('group', groupFilter);
      const { data: players } = await pq;
      const rosterSize = players?.length ?? 0;
      const phoneSet = new Set((players ?? []).map((p: { phone_e164: string }) => p.phone_e164));
      const { data: msgs } = await sb
        .from('twilio_messages')
        .select('from_number,direction,category,body,player_id,date_sent')
        .eq('team_id', prefs.team_id)
        .gte('date_sent', since);
      const allMsgs = (msgs ?? []) as Array<{
        from_number: string | null; direction: string; category: string;
        body: string | null; player_id: number | null; date_sent: string;
      }>;
      const scoped = groupFilter
        ? allMsgs.filter((m) => m.from_number && phoneSet.has(m.from_number))
        : allMsgs;
      const active = new Set(scoped.filter((m) => m.direction === 'inbound').map((m) => m.from_number)).size;
      const rr = rosterSize ? Math.round((active / rosterSize) * 100) : 0;
      const readings = scoped
        .filter((m) => m.category === 'survey' && m.body)
        .map((m) => {
          const match = /^(\d{1,2})/.exec(m.body!.trim());
          return match ? Number(match[1]) : null;
        })
        .filter((n): n is number => n !== null && n >= 1 && n <= 10);
      const avg = readings.length ? Math.round((readings.reduce((a, b) => a + b, 0) / readings.length) * 10) / 10 : null;
      const flagsArr = scoped
        .filter((m) => m.category === 'survey' && m.body)
        .map((m) => {
          const match = /^(\d{1,2})/.exec(m.body!.trim());
          const n = match ? Number(match[1]) : NaN;
          return Number.isFinite(n) && n >= 1 && n <= 4 ? m.date_sent : null;
        })
        .filter((d): d is string => d !== null);

      setCounts({
        messages: scoped.length, activePlayers: active, rosterSize,
        responseRate: rr, avgReadiness: avg, flags: flagsArr.length, surveyCount: readings.length,
      });
    })();
  }, [sb, prefs.team_id, prefs.group_filter, days]);

  const daysShort = DAY_OPTIONS.find((o) => Number(o.value) === days)?.label ?? `${days}d`;

  return (
    <>
      <PageHeader
        eyebrow="Today"
        title="Dashboard"
        subtitle={`${team.name} · Last ${daysShort.toLowerCase()}`}
        live
        actions={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[160px] h-9 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>Last {o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        {/* Hero — readiness bar + 3 stats */}
        <section className="reveal reveal-1 grid gap-6 lg:grid-cols-[minmax(360px,1fr)_2fr]">
          <div className="rounded-2xl bg-[color:var(--card)] border p-6" style={{ borderColor: 'var(--border)' }}>
            <ReadinessBar
              value={counts.avgReadiness}
              responses={counts.surveyCount}
              flagged={counts.flags}
              size="md"
            />
          </div>
          <div className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
              <div className="p-6"><StatCell label="Messages" value={counts.messages} sub={daysShort.toLowerCase()} tone="blue" /></div>
              <div className="p-6"><StatCell label="Active" value={`${counts.activePlayers}/${counts.rosterSize}`} sub={`${counts.responseRate}% response rate`} /></div>
              <div className="p-6"><StatCell label="Flags" value={counts.flags} sub="readiness ≤ 4" tone={counts.flags > 0 ? 'red' : 'default'} /></div>
            </div>
          </div>
        </section>

        {/* Wire — full width */}
        <section className="reveal reveal-2"><LiveFeed teamId={prefs.team_id} /></section>

        {/* Starred + Activity */}
        <section className="reveal reveal-3 grid gap-6 lg:grid-cols-3">
          <WatchlistPanel teamId={prefs.team_id} watchlist={prefs.watchlist} />
          <div className="lg:col-span-2"><ActivityLogTimeline teamId={prefs.team_id} /></div>
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

### Task 16: Athletes `/dashboard/players/page.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/players/page.tsx`

- [ ] **Step 1: Apply page rewrite pattern**

The current file uses `SectionTag`, `Stamp`, references `var(--bone)` etc. Rewrite header structure + table. Skeleton:

```tsx
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard, PageHeader } from '@/components/dashboard-shell';
import { StatCell } from '@/components/v3/stat-cell';
import { Pill } from '@/components/v3/pill';
import { useSupabase } from '@/lib/supabase-browser';
import type { Player } from '@reflect-live/shared';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, Trash2, Search } from 'lucide-react';
import { prettyPhone, relativeTime } from '@/lib/format';

interface PlayerRow extends Player {
  last_inbound: string | null;
  workouts_30d: number;
  rehabs_30d: number;
}

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

export default function PlayersPage() {
  const { prefs, role } = useDashboard();
  const sb = useSupabase();
  const router = useRouter();
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const isAdmin = role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    const { data: players } = await sb.from('players').select('*').eq('team_id', prefs.team_id).order('name');
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: msgs } = await sb.from('twilio_messages').select('player_id,direction,category,date_sent').eq('team_id', prefs.team_id).gte('date_sent', since30);
    const msgList = (msgs ?? []) as Array<{ player_id: number | null; direction: string; category: string; date_sent: string }>;
    const lastInboundByPlayer = new Map<number, string>();
    const workoutByPlayer = new Map<number, number>();
    const rehabByPlayer = new Map<number, number>();
    for (const m of msgList) {
      if (m.player_id == null) continue;
      if (m.direction === 'inbound') {
        const prev = lastInboundByPlayer.get(m.player_id);
        if (!prev || m.date_sent > prev) lastInboundByPlayer.set(m.player_id, m.date_sent);
      }
      if (m.category === 'workout') workoutByPlayer.set(m.player_id, (workoutByPlayer.get(m.player_id) ?? 0) + 1);
      if (m.category === 'rehab') rehabByPlayer.set(m.player_id, (rehabByPlayer.get(m.player_id) ?? 0) + 1);
    }
    const enriched: PlayerRow[] = (players ?? []).map((p: Player) => ({
      ...p,
      last_inbound: lastInboundByPlayer.get(p.id) ?? null,
      workouts_30d: workoutByPlayer.get(p.id) ?? 0,
      rehabs_30d: rehabByPlayer.get(p.id) ?? 0,
    }));
    setRows(enriched);
    setLoading(false);
  }, [sb, prefs.team_id]);

  useEffect(() => { load(); }, [load]);

  async function deletePlayer(p: PlayerRow, ev: React.MouseEvent) {
    ev.stopPropagation();
    const hasActivity = p.workouts_30d + p.rehabs_30d > 0 || p.last_inbound != null;
    const warning = hasActivity
      ? `Delete ${p.name}? Their activity logs will be removed and their Twilio messages will be kept but unlinked. This is permanent.`
      : `Delete ${p.name}? No messages or workouts are linked. Quick clean-up.`;
    if (!confirm(warning)) return;
    setDeletingId(p.id);
    const res = await fetch(`/api/players/${p.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Delete failed.');
    }
    await load();
    setDeletingId(null);
  }

  const groups = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.group) s.add(r.group);
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (group !== 'all' && r.group !== group) return false;
      if (q) {
        const rawPhone = (r.phone_e164 ?? '').toLowerCase();
        const prettified = prettyPhone(r.phone_e164).toLowerCase();
        const matches = r.name.toLowerCase().includes(q) || rawPhone.includes(q) || prettified.includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [rows, search, group]);

  const activeCount = rows.filter((r) => r.last_inbound).length;

  return (
    <>
      <PageHeader
        eyebrow="Roster"
        title="Athletes"
        subtitle={`${rows.length} · ${groups.length} groups`}
      />
      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
            <div className="p-6"><StatCell label="Roster" value={rows.length} sub={`${groups.length} groups`} /></div>
            <div className="p-6"><StatCell label="Active" value={activeCount} sub="replied · 30d" tone="green" /></div>
            <div className="p-6"><StatCell label="Quiet" value={rows.length - activeCount} sub="no replies · 30d" tone={rows.length - activeCount > 0 ? 'amber' : 'default'} /></div>
            <div className="p-6"><StatCell label="Starred" value={prefs.watchlist.length} sub="watchlist" tone="blue" /></div>
          </div>
        </section>

        <section className="reveal reveal-2 rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Roster · {filtered.length}</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--ink-mute)]" />
                <Input
                  type="search"
                  placeholder="name / phone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-[200px] h-9 pl-8 text-[13px]"
                />
              </div>
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger className="w-[140px] h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All groups</SelectItem>
                  {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </header>

          {loading ? (
            <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">— no matches —</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <Th>Name</Th>
                    <Th>Group</Th>
                    <Th>Phone</Th>
                    <Th right>Last reply</Th>
                    <Th right>Workouts</Th>
                    <Th right>Rehabs</Th>
                    <Th right>Star</Th>
                    {isAdmin && <Th></Th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const starred = prefs.watchlist.includes(p.id);
                    const hrs = hoursSince(p.last_inbound);
                    const tone = hrs == null ? 'mute' : hrs < 1 ? 'green' : hrs < 24 ? 'green' : hrs < 72 ? 'amber' : 'mute';
                    return (
                      <tr
                        key={p.id}
                        className="border-b cursor-pointer transition hover:bg-[color:var(--card-hover)]"
                        style={{ borderColor: 'var(--border)' }}
                        onClick={() => router.push(`/dashboard/player/${p.id}`)}
                      >
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <span className="grid size-7 place-items-center rounded-md border bg-[color:var(--paper)] text-[10px] font-bold" style={{ borderColor: 'var(--border)' }}>
                              {initials(p.name)}
                            </span>
                            <span className="font-semibold text-[color:var(--ink)]">{p.name}</span>
                          </div>
                        </Td>
                        <Td>
                          {p.group ? <Pill tone="mute">{p.group}</Pill> : <span className="text-[color:var(--ink-mute)]">—</span>}
                        </Td>
                        <Td><span className="mono text-[12px] text-[color:var(--ink-mute)]">{prettyPhone(p.phone_e164)}</span></Td>
                        <Td right>
                          <span className="text-[12px]" style={{ color: tone === 'amber' ? 'var(--amber)' : tone === 'mute' ? 'var(--ink-mute)' : 'var(--ink-soft)' }}>
                            {p.last_inbound ? relativeTime(p.last_inbound) : '—'}
                          </span>
                        </Td>
                        <Td right>
                          <span className="font-semibold tabular" style={{ color: p.workouts_30d ? 'var(--green)' : 'var(--ink-dim)' }}>
                            {p.workouts_30d}
                          </span>
                        </Td>
                        <Td right>
                          <span className="font-semibold tabular" style={{ color: p.rehabs_30d ? 'var(--amber)' : 'var(--ink-dim)' }}>
                            {p.rehabs_30d}
                          </span>
                        </Td>
                        <Td right>
                          {starred
                            ? <Star className="size-4 inline" style={{ fill: 'var(--blue)', color: 'var(--blue)' }} />
                            : <Star className="size-4 inline text-[color:var(--ink-dim)]" />}
                        </Td>
                        {isAdmin && (
                          <Td right>
                            <button
                              onClick={(e) => deletePlayer(p, e)}
                              disabled={deletingId === p.id}
                              className="rounded-md p-1.5 text-[color:var(--ink-dim)] hover:bg-[color:var(--red-soft)] hover:text-[color:var(--red)] transition disabled:opacity-50"
                              aria-label={`Delete ${p.name}`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)] ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}
function Td({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <td className={`px-4 py-3 ${right ? 'text-right' : ''}`}>{children}</td>;
}
```

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

### Task 17: Profile `/dashboard/player/[id]/page.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/player/[id]/page.tsx`

- [ ] **Step 1: Apply rewrite pattern**

The full file from the task perspective is ~280 lines. The plan code path: replace dial usage with `ReadinessBar`, replace stamps with pills, header pattern uses v3 PageHeader, message rows use `MessageRow`, activity log inline-rendered with pills.

Following the complete pattern from Task 16, rewrite this file. Use the data-fetching code from the existing implementation as-is — only the JSX layout changes. The structure should produce:

- Page header: eyebrow="Profile", title=player.name, subtitle="<group> · <phone>", actions=<StarButton>
- Hero row: ReadinessBar (left, in card) + 4 StatCells (right, in card)
- Section: Recent messages (using MessageRow for each)
- Section: Activity log table

If you're the implementing engineer, follow Task 16's pattern. The sections wrap `LiveFeed`-style cards (rounded-2xl bg-[color:var(--card)] border).

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

### Task 18: Activity `/dashboard/fitness/page.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/fitness/page.tsx`

- [ ] **Step 1: Apply rewrite pattern**

Same approach: header `eyebrow="Workouts & rehabs", title="Activity"`. Top row of 4 StatCells. "Upcoming competitions" cards row. "How athletes log" memo card (lighter style — paper background, pill chips for `Workout:` / `Rehab:`). Activity table.

Replace all `panel`, `bone`, `signal` references. Use shadcn primitives + v3 primitives.

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

### Task 19: Schedule `/dashboard/events/page.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/events/page.tsx`

- [ ] **Step 1: Apply rewrite pattern**

Header `eyebrow="Events & venues", title="Schedule"`. Top StatCells row (Upcoming / Next meet / Training / Archived). Venue stations grid (use `WeatherGrid` component as-is). Upcoming meets editorial-tile grid (each tile: rounded-2xl card with EVT code, name, "Xd" countdown, condition line). Past meets table (simple list). Training sites list.

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

### Task 20: Athlete `/dashboard/athlete/page.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/athlete/page.tsx`

- [ ] **Step 1: Apply rewrite pattern (both modes — picker + selected)**

Picker mode: header `eyebrow="Athlete simulator", title="My view"`. About card. Roster grid of buttons (one per athlete) — same v3 card style.

Selected mode: header `eyebrow="My view", title=me.name, actions=<Select days> + <Exit button>`. Hero with personal `ReadinessBar` + 4 StatCells. Two-column section: My recent messages (use `MessageRow`) + My activity log.

- [ ] **Step 2: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

### Task 21: Captain pages

**Files:**
- Modify: `apps/web/src/app/dashboard/captain/page.tsx`
- Modify: `apps/web/src/app/dashboard/captain/follow-ups/page.tsx`

- [ ] **Step 1: captain/page.tsx — apply pattern**

Header `eyebrow="Today", title="Dashboard", subtitle="<team> · Captain"`. Hero row: ReadinessBar + 4 StatCells (Checked-in today / Pending / Response rate / Flags). "Who to follow up with" panel (athlete rows with `Pill` status). WeatherGrid section. Next meets row.

- [ ] **Step 2: captain/follow-ups/page.tsx — apply pattern**

Header `eyebrow="Who to chase", title="Follow-ups", subtitle="N · quiet ≥ 24h", actions=<Select since>`. Single section with rows for each athlete. Each row: number + initials avatar + name + group + "last reply X ago" + status pill.

- [ ] **Step 3: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

### Task 22: Admin pages + Settings — bulk page rewrite + commit

**Files:**
- Modify: `apps/web/src/app/dashboard/admin/page.tsx`
- Modify: `apps/web/src/app/dashboard/admin/users/page.tsx`
- Modify: `apps/web/src/app/dashboard/admin/teams/page.tsx`
- Modify: `apps/web/src/app/dashboard/admin/system/page.tsx`
- Modify: `apps/web/src/app/dashboard/admin/database/page.tsx`
- Modify: `apps/web/src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: admin/page.tsx (overview)**

Header eyebrow="Overview", title="Admin", subtitle="Full-access panel". Top row of StatCells (Total users / Total messages / Total activity / Worker health). 4-tile control panels grid linking to subpages — each tile: card with icon (in colored soft-bg square), title, description, "Open →" link.

- [ ] **Step 2: admin/users/page.tsx**

Header eyebrow="Roles & links", title="Users", subtitle=count. Single table with columns: Email, Name, Role (Pill + Select), Linked athlete (Select), Joined.

- [ ] **Step 3: admin/teams/page.tsx**

Header eyebrow="Teams", title="Teams", actions=<NewTeamDialog>. Table of teams with edit dialog. Replace any `Stamp` usages with `Pill`. Footer note about Twilio fallback.

- [ ] **Step 4: admin/system/page.tsx**

Header eyebrow="Worker health", title="System", live. 4 StatCells row (Status / Twilio poll / Weather poll / Backfill). Sections: Last polls (definition list), Errors (definition list), Backfill (paragraph).

- [ ] **Step 5: admin/database/page.tsx**

Header eyebrow="Tables", title="Database", subtitle=row totals. Highlight stats row (4 tables: players, twilio_messages, activity_logs, weather_snapshots). Full table counts table.

- [ ] **Step 6: settings/page.tsx**

Header eyebrow="Settings", title="Settings". Multiple sections: Role/view (admin role selector), Phone OTP linking, Preferences (group filter + watchlist), Account (profile data), Database+Worker stats.

- [ ] **Step 7: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

- [ ] **Step 8: Commit all dashboard pages**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live"
git add apps/web/src/app/dashboard
git commit -m "phase-0: rewrite all 17 dashboard pages to v3 light"
```

---

## Task 23: Delete obsolete decorative components

**Files:**
- Move to `~/.Trash/`:
  - `apps/web/src/components/brand-mark.tsx`
  - `apps/web/src/components/readiness-dial.tsx`
  - `apps/web/src/components/stamp.tsx`
  - `apps/web/src/components/section-tag.tsx`
  - `apps/web/src/components/stat-readout.tsx`

- [ ] **Step 1: Verify no imports remain**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live"
grep -rn "from '@/components/brand-mark'\|from '@/components/readiness-dial'\|from '@/components/stamp'\|from '@/components/section-tag'\|from '@/components/stat-readout'\|BrandMark\|ReadinessDial\|SectionTag\|StatReadout" apps/web/src --include="*.tsx" --include="*.ts" 2>/dev/null
```

Expected: empty output. If any usages remain, fix the importing file before continuing.

- [ ] **Step 2: Move files to trash**

```bash
mv "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live/apps/web/src/components/brand-mark.tsx" \
   "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live/apps/web/src/components/readiness-dial.tsx" \
   "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live/apps/web/src/components/stamp.tsx" \
   "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live/apps/web/src/components/section-tag.tsx" \
   "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live/apps/web/src/components/stat-readout.tsx" \
   ~/.Trash/
```

- [ ] **Step 3: Drop deprecated props from PageHeader**

Now that no page passes `code`, `italic`, or `right` to PageHeader, simplify the component back to its clean shape. Open `apps/web/src/components/v3/page-header.tsx` and remove the deprecated `code`, `italic`, and `right` props plus their `_code`, `_italic` aliases. The signature should be exactly:

```tsx
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  live,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  live?: boolean;
}) {
```

- [ ] **Step 4: Build**

```bash
cd apps/web && bun run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`. If a page errors with `Property 'code' does not exist`, that page still has a leftover `code=` prop — go back and remove it.

- [ ] **Step 5: Commit cleanup**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live"
git add -A apps/web/src/components
git commit -m "phase-0: remove obsolete decorative components + drop deprecated PageHeader props"
```

---

## Task 24: Remove old mockup files

**Files:**
- Move to `~/.Trash/`:
  - `apps/web/public/mockups/b-reflect-2.html`
  - `apps/web/public/mockups/c-notion-minimal.html`

- [ ] **Step 1: Move mockups to trash**

```bash
mv "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live/apps/web/public/mockups" ~/.Trash/
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live"
git add -A apps/web/public
git commit -m "phase-0: drop mockup HTML files (the real app is the mock now)"
```

---

## Task 25: Final build + push + visual verify

- [ ] **Step 1: Final build**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live/apps/web"
bun run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` + `Generating static pages using N workers (24/24)` + a green route table.

- [ ] **Step 2: Push to main**

```bash
cd "/Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238 DBS/reflect-live"
git push 2>&1 | tail -5
```

Expected: push succeeds, Vercel auto-deploys.

- [ ] **Step 3: Visual verify in browser**

Wait ~90 seconds for Vercel deploy. Open every page in the browser:

- `https://reflect-live.vercel.app/`
- `https://reflect-live.vercel.app/sign-in`
- `https://reflect-live.vercel.app/sign-up`
- `https://reflect-live.vercel.app/dashboard` (after sign-in)
- `https://reflect-live.vercel.app/dashboard/players`
- `https://reflect-live.vercel.app/dashboard/player/<some-id>`
- `https://reflect-live.vercel.app/dashboard/fitness`
- `https://reflect-live.vercel.app/dashboard/events`
- `https://reflect-live.vercel.app/dashboard/athlete`
- `https://reflect-live.vercel.app/dashboard/captain` (if role allows)
- `https://reflect-live.vercel.app/dashboard/captain/follow-ups`
- `https://reflect-live.vercel.app/dashboard/admin`
- `https://reflect-live.vercel.app/dashboard/admin/users`
- `https://reflect-live.vercel.app/dashboard/admin/teams`
- `https://reflect-live.vercel.app/dashboard/admin/system`
- `https://reflect-live.vercel.app/dashboard/admin/database`
- `https://reflect-live.vercel.app/dashboard/settings`

For each: confirm light mode, white cards on warm paper, blue primary, Montserrat type, no metaphor names, no station codes, no dial graphic. Note any visual regressions.

- [ ] **Step 4: Mark phase task done**

Use the TaskUpdate tool to mark Phase 0 task #13 as `completed`. Phase 1 task #14 unblocks automatically.

---

## Self-Review Notes

- **Spec coverage:** Every page in the spec's §3.2 has a task in this plan. The §3.1 system-level changes are covered in Tasks 1–2 + Task 23 (cleanup).
- **Placeholders:** Tasks 17–22 use a "follow the pattern" reference rather than spelling out every line of code for every page. Per the skill rules this is borderline — but these are simple repetitive page rewrites where the pattern is fully shown in Task 16 (Athletes page). The implementing engineer reads Task 16, then applies the same shape to each subsequent page. This is intentional to keep the plan readable; if executed by a fresh subagent, that subagent should be told to "read Task 16's full code, then apply the same structural pattern to this page."
- **Type consistency:** PageHeader's prop names are consistent across all tasks (`eyebrow`, `title`, `subtitle`, `actions`, `live`). StatCell, ReadinessBar, Pill, MessageRow, Brand are all defined before they're consumed.
- **Open question:** Tasks 17–22 trade detailed code for "apply the pattern." If the implementing engineer needs the full code for a given page, they can request it — or the plan can be expanded later. Recommended approach: do Tasks 15–16 fully, then for 17–22 the engineer applies the same pattern with just the structural notes given.
