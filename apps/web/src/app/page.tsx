import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { Brand } from '@/components/v3/brand';
import { NumberTicker } from '@/components/ui/number-ticker';
import { DotPattern } from '@/components/ui/dot-pattern';
import { BorderBeam } from '@/components/ui/border-beam';
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text';
import { MagicCard } from '@/components/ui/magic-card';
import { AttentionList } from '@/components/v3/landing-attention-list';
import { cn } from '@/lib/utils';

// auth() is dynamic — opt out of static rendering so the redirect runs
// at request time on Vercel. Without this, Next 16 + Turbopack was
// pre-rendering `/` and the deploy ended up serving a 500 instead of
// either the static landing or the redirect.
export const dynamic = 'force-dynamic';

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

      {/* Hero — DotPattern sits behind, masked to fade out at the
          edges so the texture doesn't fight the surrounding sections.
          Pattern color is driven by text-* on the SVG. */}
      <section className="relative overflow-hidden">
        <DotPattern
          width={22}
          height={22}
          cr={1}
          className={cn(
            'text-[color:var(--ink-mute)]/40',
            '[mask-image:radial-gradient(ellipse_at_center,white_20%,transparent_75%)]',
          )}
        />
        <div className="relative mx-auto max-w-[1280px] px-6 py-20 md:px-10 md:py-28 reveal reveal-1">
        <h1 className="max-w-[18ch] text-5xl md:text-7xl font-bold tracking-[-0.02em] leading-[1.05] text-[color:var(--ink)]">
          Texts in. Insights out.
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
        </div>
      </section>

      {/* The check-in — SMS thread + bullets */}
      <section
        className="border-y reveal reveal-2"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
      >
        <div className="mx-auto max-w-[1280px] px-6 py-20 md:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,420px)] gap-12 items-start">
            <div>
              <p className="mb-3">
                <AnimatedShinyText className="text-[12px] font-bold uppercase tracking-[0.12em] text-[color:var(--blue)]">
                  The check-in
                </AnimatedShinyText>
              </p>
              <h2 className="text-3xl md:text-4xl font-bold tracking-[-0.01em] text-[color:var(--ink)] leading-[1.1] max-w-[20ch]">
                One survey. One text. One stream of truth.
              </h2>
              <p className="mt-6 max-w-[50ch] text-[15px] text-[color:var(--ink-soft)] leading-relaxed">
                The team bot sends questions on the channel athletes already use.
                Replies are tagged on arrival, paired with the question that prompted them,
                and routed into per-metric trends — no app, no portal, no friction.
              </p>
              <ul className="mt-8 space-y-3 text-[14px] text-[color:var(--ink-soft)]">
                <CheckRow>WhatsApp or SMS — same flow either channel</CheckRow>
                <CheckRow>Replies live in the dashboard within 15 seconds</CheckRow>
                <CheckRow>Pain reports auto-populate the body heatmap</CheckRow>
                <CheckRow>Skipped questions don't penalize anyone</CheckRow>
              </ul>
            </div>
            <SmsThread />
          </div>
        </div>
      </section>

      {/* What the coach sees — mini dashboard preview */}
      <section className="mx-auto max-w-[1280px] px-6 py-20 md:px-10 reveal reveal-3">
        <p className="mb-3">
          <AnimatedShinyText className="text-[12px] font-bold uppercase tracking-[0.12em] text-[color:var(--blue)]">
            What the coach sees
          </AnimatedShinyText>
        </p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-[-0.01em] text-[color:var(--ink)] leading-[1.1] max-w-[24ch]">
          A live read on the team — without asking another question.
        </h2>
        <p className="mt-6 max-w-[60ch] text-[15px] text-[color:var(--ink-soft)] leading-relaxed">
          Every text becomes a row, a score, a body region. Trends pair Q with A, daily
          aggregation smooths the jitter, and the same numbers show up on the team
          dashboard, the athlete page, and the LLM brief — single source, no copies.
        </p>
        <div className="mt-10">
          <DashboardPreview />
        </div>
      </section>

      {/* Feature grid */}
      <section
        className="border-y"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
      >
        <div className="mx-auto max-w-[1280px] px-6 py-20 md:px-10">
          <p className="mb-3">
            <AnimatedShinyText className="text-[12px] font-bold uppercase tracking-[0.12em] text-[color:var(--blue)]">
              What&rsquo;s inside
            </AnimatedShinyText>
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-[color:var(--ink)] mb-10">
            Six surfaces. One database. Zero copy-paste.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <MagicCard
                key={f.title}
                className="rounded-xl"
                gradientColor="var(--blue-soft)"
                gradientOpacity={0.6}
                gradientFrom="#1F5FB0"
                gradientTo="#3F7AC4"
              >
                <article className="p-6">
                  <h3 className="text-[18px] font-bold text-[color:var(--ink)] mb-2">{f.title}</h3>
                  <p className="text-[14px] text-[color:var(--ink-soft)] leading-relaxed">{f.body}</p>
                </article>
              </MagicCard>
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
          <span>Designed &amp; built by Ryan Lobo</span>
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

function CheckRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-1.5 size-1.5 rounded-full shrink-0"
        style={{ background: 'var(--blue)' }}
        aria-hidden
      />
      <span>{children}</span>
    </li>
  );
}

// Lightweight WhatsApp-ish SMS thread. Fully static — no JS, no images,
// no animation. Bubble colors track reflect-live's palette: bot
// messages on a tinted card, athlete replies in --blue. Timestamps are
// monospace + tabular so they line up the same way the dashboard's
// time columns do.
function SmsThread() {
  return (
    <div
      className="rounded-[28px] border bg-[color:var(--paper)] p-4 md:p-5 shadow-sm"
      style={{ borderColor: 'var(--border-2)' }}
    >
      {/* Phone-ish header */}
      <div
        className="flex items-center justify-between pb-3 mb-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <div className="text-[13px] font-bold text-[color:var(--ink)]">Your team bot</div>
          <div className="text-[10.5px] text-[color:var(--ink-mute)] uppercase tracking-wide">Team check-in</div>
        </div>
        <span className="text-[10px] mono tabular text-[color:var(--ink-mute)]">7:02 AM</span>
      </div>

      <div className="flex flex-col gap-2.5">
        <Bubble from="bot">
          Hey! Overall body readiness right now? <span className="text-[color:var(--ink-mute)]">(1 = can barely move, 10 = peak)</span>
        </Bubble>
        <Bubble from="me">8</Bubble>
        <Bubble from="bot">
          How hard did today&rsquo;s practice feel? <span className="text-[color:var(--ink-mute)]">(1 = easy, 10 = maximal)</span>
        </Bubble>
        <Bubble from="me">7</Bubble>
        <Bubble from="bot">
          Did any pain or physical issue start during practice today?<br />
          <span className="text-[color:var(--ink-mute)]">Reply: 0 = no, 1 = yes</span>
        </Bubble>
        <Bubble from="me">0</Bubble>
        <Bubble from="bot">Thanks for checking in!</Bubble>
      </div>
    </div>
  );
}

function Bubble({ from, children }: { from: 'me' | 'bot'; children: React.ReactNode }) {
  if (from === 'me') {
    return (
      <div className="flex justify-end">
        <div
          className="rounded-2xl rounded-br-md px-3 py-2 text-[13px] font-semibold text-white max-w-[80%]"
          style={{ background: 'var(--blue)' }}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div
        className="rounded-2xl rounded-bl-md px-3 py-2 text-[13px] text-[color:var(--ink-soft)] max-w-[88%] border"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        {children}
      </div>
    </div>
  );
}

// Mini dashboard preview that mirrors reflect-live's actual chrome:
// readiness bar + score-trend heatmap row + needs-attention list.
// Everything inline — no real data, no fetches. The point is to give
// the visitor a thirty-second read of the product.
function DashboardPreview() {
  return (
    <div
      className="relative rounded-2xl border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      {/* Quietly draws the eye to the preview without animating the
          content itself. Two beams chasing each other from opposite
          corners feel more product-y than a single one. */}
      <BorderBeam
        size={120}
        duration={9}
        colorFrom="#1F5FB0"
        colorTo="#3F7AC4"
      />
      <BorderBeam
        size={120}
        duration={9}
        delay={4.5}
        colorFrom="#3F7AC4"
        colorTo="#1F5FB0"
      />
      {/* Window chrome — page header strip */}
      <div
        className="px-6 py-4 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">Today</div>
          <div className="text-[16px] font-bold text-[color:var(--ink)]">Dashboard</div>
        </div>
        <div className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--ink-mute)]">
          {['7d', '14d', '30d', 'all'].map((p) => (
            <span
              key={p}
              className="px-2 py-1 rounded"
              style={{
                background: p === '7d' ? 'var(--ink)' : 'transparent',
                color: p === '7d' ? 'var(--paper)' : 'var(--ink-mute)',
              }}
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_2fr] gap-6">
        {/* Readiness card */}
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: 'var(--border)', background: 'var(--paper)' }}
        >
          <div className="text-[10.5px] uppercase tracking-wide text-[color:var(--green)] font-bold">Team readiness</div>
          <div className="mt-2 flex items-baseline gap-1">
            <NumberTicker
              value={7.4}
              decimalPlaces={1}
              delay={0.2}
              className="text-[3rem] font-bold leading-none text-[color:var(--ink)]"
            />
            <span className="text-[14px] text-[color:var(--ink-mute)] tabular">/ 10</span>
          </div>
          <div
            className="mt-3 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--border)' }}
          >
            <div
              className="h-full"
              style={{ width: '74%', background: 'var(--green)' }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-[10.5px] uppercase tracking-wide font-semibold">
            <span style={{ color: 'var(--green)' }}>Healthy</span>
            <span className="text-[color:var(--ink-mute)] tabular">19 responses</span>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-3 divide-x rounded-xl border" style={{ borderColor: 'var(--border)' }}>
          <Stat label="Messages" value={412} sub="last 7 days" tone="blue" />
          <Stat label="Active" value={22} valueSuffix=" / 24" sub="92% response rate" tone="ink" />
          <Stat label="Flags" value={2} sub="readiness ≤ 4" tone="red" />
        </div>
      </div>

      {/* Score trends — heatmap row */}
      <div className="border-t px-6 py-5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-bold text-[color:var(--ink)]">Score trends</div>
          <div className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">3 score · 1 yes/no</div>
        </div>
        <div className="space-y-2">
          {TREND_ROWS.map((row) => (
            <div key={row.label} className="grid grid-cols-[120px_1fr] items-center gap-3">
              <div>
                <div className="text-[12.5px] font-semibold text-[color:var(--ink)]">{row.label}</div>
                <div className="text-[10.5px] mono tabular text-[color:var(--ink-mute)]">avg {row.avg}</div>
              </div>
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
                {row.cells.map((c, i) => (
                  <span
                    key={i}
                    className="h-4 rounded-sm"
                    style={{ background: cellColor(c) }}
                    aria-hidden
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Needs attention */}
      <div className="border-t px-6 py-5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-bold text-[color:var(--ink)]">Needs attention</div>
          <span className="text-[10.5px] uppercase tracking-wide font-bold text-white px-1.5 py-0.5 rounded" style={{ background: 'var(--red)' }}>
            2 quiet
          </span>
        </div>
        {/* Fictional placeholder names — NOT real athletes. Kept
            realistic-sounding so the demo doesn't read as 'Athlete A /
            Athlete B', but generic enough not to map to anyone on a
            roster. AttentionList is a client component that staggers
            each row's entrance via motion's whileInView. */}
        <AttentionList
          rows={[
            { name: 'Sam Rivera', tag: 'Group · no replies in 4 days', tone: 'amber' },
            { name: 'Jordan Kim', tag: 'Group · no replies in 6 days', tone: 'red' },
          ]}
        />
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  /** Number that will count up from 0 on viewport entry. */
  value: number;
  /** Optional suffix appended to the value (e.g. '/ 24'). Static text. */
  valueSuffix?: string;
  sub: string;
  tone: 'blue' | 'ink' | 'red';
}

function Stat({ label, value, valueSuffix, sub, tone }: StatProps) {
  const valueColor = tone === 'blue' ? 'var(--blue)' : tone === 'red' ? 'var(--red)' : 'var(--ink)';
  return (
    <div className="p-5" style={{ borderColor: 'var(--border)' }}>
      <div className="text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">{label}</div>
      <div
        className="mt-1 text-[1.75rem] font-bold leading-none flex items-baseline gap-0.5"
        style={{ color: valueColor }}
      >
        <NumberTicker value={value} delay={0.3} />
        {valueSuffix && <span className="tabular text-[1.25rem]">{valueSuffix}</span>}
      </div>
      <div className="mt-1 text-[11px] text-[color:var(--ink-mute)]">{sub}</div>
    </div>
  );
}

// Static demo data — picked to look like a realistic week. 14 cells
// (≈2 weeks of survey days) per metric; null = no reply that day.
const TREND_ROWS: Array<{ label: string; avg: string; cells: Array<number | null> }> = [
  { label: 'Readiness', avg: '7.4', cells: [7, 8, null, 6, 8, 9, 7, 6, 7, null, 8, 8, 7, 7] },
  { label: 'Sleep',     avg: '6.8', cells: [7, 6, null, 5, 7, 7, 8, 6, 5, null, 7, 7, 7, 6] },
  { label: 'RPE',       avg: '6.1', cells: [5, 6, null, 7, 6, 5, 6, 7, 6, null, 6, 7, 5, 6] },
];

// Continuous red→amber→green gradient mirroring SurveyTrendsCard. Null
// reads as a faint, empty cell — same convention the real heatmap uses.
function cellColor(v: number | null): string {
  if (v == null) return 'var(--paper-2)';
  let hue: number;
  if (v <= 5) hue = ((v - 1) / 4) * 38;
  else hue = 38 + ((v - 5) / 5) * (145 - 38);
  return `hsl(${hue.toFixed(0)}, 78%, 48%)`;
}
