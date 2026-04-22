import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { BrandMark, Wordmark } from '@/components/brand-mark';
import { ReadinessDial } from '@/components/readiness-dial';

export default async function Landing() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard');

  const today = new Date();
  const dateStr = today
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase();

  return (
    <main className="relative min-h-screen overflow-hidden text-[color:var(--bone)]">
      {/* ========== MASTHEAD ========== */}
      <header className="relative z-10 border-b border-[color:var(--hairline)]/60">
        <div
          className="h-[2px]"
          style={{
            background:
              'linear-gradient(to right, transparent, hsl(188 82% 58%) 20%, hsl(188 82% 58%) 80%, transparent)',
          }}
        />
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-4 px-6 py-4 md:px-10">
          <Wordmark size={28} tone="bone" />
          <div className="hidden items-center gap-6 md:flex">
            <span className="inline-flex items-center gap-2">
              <span className="live-dot" />
              <span className="eyebrow-signal">ON AIR</span>
            </span>
            <span className="eyebrow">{dateStr}</span>
          </div>
          <Link
            href="/sign-in"
            className="mono text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--bone-soft)] hover:text-[color:var(--signal)] transition ink-link"
          >
            Sign in →
          </Link>
        </div>
      </header>

      {/* ========== HERO ========== */}
      <section className="relative">
        <div className="mx-auto grid max-w-[1380px] grid-cols-1 gap-12 px-6 pb-16 pt-10 md:px-10 md:pt-16 lg:grid-cols-12 lg:gap-8 lg:pb-24">
          {/* Left — headline */}
          <div className="lg:col-span-7 xl:col-span-8">
            <div className="reveal reveal-1 mb-6 flex items-center gap-4 border-b border-[color:var(--hairline)]/50 pb-3">
              <span className="station-code">00.01</span>
              <span className="eyebrow">The instrument</span>
            </div>

            <h1 className="reveal reveal-2 h-display text-[4rem] leading-[0.92] sm:text-[5.5rem] md:text-[7rem] lg:text-[8.5rem]">
              Every{' '}
              <span className="h-display-italic" style={{ color: 'hsl(188 82% 58%)' }}>
                signal
              </span>
              <br />
              your team sends.
              <br />
              <span style={{ color: 'hsl(36 16% 74%)' }}>The </span>
              <span className="h-display-italic" style={{ color: 'var(--heritage)' }}>
                second
              </span>
              <span style={{ color: 'hsl(36 16% 74%)' }}> it fires.</span>
            </h1>

            <p className="reveal reveal-3 mt-8 max-w-[44ch] font-serif text-xl leading-relaxed text-[color:var(--bone-soft)] md:text-[1.35rem]">
              Athletes text the team line. The control room updates live. No app, no refresh.
            </p>

            <div className="reveal reveal-4 mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/sign-up"
                className="group inline-flex items-center gap-3 border px-6 py-3.5 mono text-[0.78rem] font-semibold uppercase tracking-[0.22em] transition"
                style={{ background: 'var(--heritage)', borderColor: 'var(--heritage)', color: 'white' }}
              >
                Open the deck
                <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 border border-[color:var(--hairline-strong)] px-6 py-3.5 mono text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--bone-soft)] hover:border-[color:var(--signal)] hover:text-[color:var(--signal)] transition"
              >
                Sign in
              </Link>
            </div>
          </div>

          {/* Right — small preview: dial + mini ticker */}
          <aside className="reveal reveal-5 lg:col-span-5 xl:col-span-4 lg:pt-6">
            <div className="relative border-t-[2px] border-[color:var(--signal)] bg-[color:var(--panel-raised)]/60 p-5 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <span className="eyebrow-signal">Control room · Live</span>
                <span className="live-dot" />
              </div>

              <div className="flex items-center justify-center pb-2">
                <ReadinessDial
                  value={7.2}
                  responses={19}
                  size={210}
                  label="Team readiness"
                  sublabel="19 RESPONSES · TODAY"
                />
              </div>

              <div className="mt-4 border-t border-[color:var(--hairline)] pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="mono text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
                    THE WIRE · LAST 3
                  </span>
                </div>
                <ul className="space-y-1.5">
                  <TickerRow time="07:14:02" cat="SURVEY" tone="signal" name="A. Patel" body="7" />
                  <TickerRow time="07:12:44" cat="WORKOUT" tone="chlorine" name="M. Lin" body="erg 5×500 @ 2k pace" />
                  <TickerRow time="06:58:11" cat="REHAB" tone="amber" name="J. Hayes" body="foam roll quads, 20 min" />
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* ========== THE LOOP — the product demo ========== */}
      <section className="relative border-y border-[color:var(--hairline)] bg-[color:var(--panel)]/30">
        <div className="mx-auto max-w-[1380px] px-6 py-20 md:px-10">
          <div className="mb-10 flex items-end justify-between gap-6 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="station-code">01.</span>
                <span className="eyebrow">The loop</span>
              </div>
              <h2 className="h-serif text-3xl md:text-5xl font-semibold tracking-tight max-w-[20ch]">
                A text becomes a signal becomes{' '}
                <span className="h-display-italic" style={{ color: 'var(--heritage)' }}>
                  a decision.
                </span>
              </h2>
            </div>
            <span className="mono text-[0.7rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
              AVG. LATENCY · 15s
            </span>
          </div>

          <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-[1fr_auto_1.35fr] lg:gap-6">
            {/* Phone mock — the INPUT */}
            <PhoneMock />

            {/* Arrow between */}
            <FlowArrow />

            {/* Dashboard mock — the OUTPUT */}
            <DashboardMock />
          </div>
        </div>
      </section>

      {/* ========== MECHANISM — three steps ========== */}
      <section className="relative">
        <div className="mx-auto max-w-[1380px] px-6 py-20 md:px-10">
          <div className="mb-10 flex items-end justify-between gap-6 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="station-code">02.</span>
                <span className="eyebrow">Mechanism</span>
              </div>
              <h2 className="h-serif text-3xl md:text-5xl font-semibold tracking-tight">
                Three moves. No glue.
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-0 md:grid-cols-3">
            <Step
              num="01"
              code="TEXT IN"
              title="Athletes text the team line."
              body="Workouts, rehabs, daily check-ins. One line, plain English. No app to download."
              accent="hsl(188 82% 58%)"
            />
            <Step
              num="02"
              code="POLL"
              title="A worker pulls Twilio every 15 seconds."
              body="Open-Meteo every 10 minutes. Each message is categorised and resolved to a roster entry on arrival."
              accent="hsl(358 78% 58%)"
              border
            />
            <Step
              num="03"
              code="WIRE"
              title="Your control room updates live."
              body="Supabase realtime pushes. No refresh. The needle on the dial moves with the team."
              accent="hsl(162 62% 54%)"
            />
          </div>
        </div>
      </section>

      {/* ========== WHAT'S INSIDE — six tiles ========== */}
      <section className="relative border-y border-[color:var(--hairline)] bg-[color:var(--panel)]/30">
        <div className="mx-auto max-w-[1380px] px-6 py-20 md:px-10">
          <div className="mb-10 flex items-end justify-between gap-6 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="station-code">03.</span>
                <span className="eyebrow">What&rsquo;s inside</span>
              </div>
              <h2 className="h-serif text-3xl md:text-5xl font-semibold tracking-tight">
                Six panels. One deck.
              </h2>
            </div>
            <span className="mono text-[0.7rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
              § 03.01 — 03.06
            </span>
          </div>

          <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-3">
            <Tile code="03.01" title="The wire" body="Every message, time-stamped to the second." />
            <Tile code="03.02" title="The dial" body="Team readiness 0–10. Siren red below four." border="left" />
            <Tile code="03.03" title="Venue stations" body="Open-Meteo for every site you train and compete at." border="left" />
            <Tile code="03.04" title="Starred" body="Your shortlist, freshest reply first." top />
            <Tile code="03.05" title="Heat sheet" body="Roster as a result sheet. Dense, ruled, tabular." border="left" top />
            <Tile code="03.06" title="Telemetry" body="Worker health always visible. If the wire is off, you&rsquo;ll know." border="left" top />
          </div>
        </div>
      </section>

      {/* ========== FINAL CTA ========== */}
      <section className="relative">
        <div className="mx-auto max-w-[1100px] px-6 py-24 md:px-10 md:py-28 text-center">
          <div className="eyebrow mb-5 flex items-center justify-center gap-3">
            <span className="station-code">04.</span>
            <span>Ready</span>
          </div>
          <h2 className="h-display text-4xl md:text-6xl leading-[0.95]">
            Your team is already{' '}
            <span className="h-display-italic" style={{ color: 'var(--heritage)' }}>
              on the wire.
            </span>
          </h2>
          <p className="mt-5 mono text-[0.78rem] uppercase tracking-[0.24em] text-[color:var(--bone-mute)]">
            The panel is three clicks away.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-3 border px-7 py-4 mono text-[0.78rem] font-semibold uppercase tracking-[0.22em] transition"
              style={{ background: 'var(--heritage)', borderColor: 'var(--heritage)', color: 'white' }}
            >
              Open the deck
              <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 border border-[color:var(--hairline-strong)] px-7 py-4 mono text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--bone-soft)] hover:border-[color:var(--signal)] hover:text-[color:var(--signal)] transition"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ========== COLOPHON ========== */}
      <footer className="relative border-t border-[color:var(--hairline)]">
        <div className="mx-auto flex max-w-[1380px] flex-wrap items-center justify-between gap-6 px-6 py-7 md:px-10">
          <div className="flex items-center gap-3">
            <BrandMark size={24} tone="heritage" />
            <span className="mono text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
              reflect·live · MPCS 51238 · Spring 2026
            </span>
          </div>
          <span className="mono text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
            Next · Supabase · Clerk · Twilio · Open-Meteo
          </span>
        </div>
      </footer>
    </main>
  );
}

/* ============================================================
   Components — local to the landing
   ============================================================ */

function TickerRow({
  time,
  cat,
  tone,
  name,
  body,
}: {
  time: string;
  cat: string;
  tone: 'signal' | 'chlorine' | 'amber';
  name: string;
  body: string;
}) {
  const color = {
    signal: 'hsl(188 82% 58%)',
    chlorine: 'hsl(162 62% 54%)',
    amber: 'hsl(38 90% 62%)',
  }[tone];
  const bg = {
    signal: 'hsl(188 60% 20% / 0.4)',
    chlorine: 'hsl(162 40% 18% / 0.4)',
    amber: 'hsl(38 60% 20% / 0.4)',
  }[tone];
  return (
    <li className="flex items-start gap-2.5 text-[0.78rem] leading-snug">
      <span className="mono text-[0.62rem] tabular text-[color:var(--signal)] shrink-0 pt-[2px]">
        {time}
      </span>
      <span
        className="mono px-1 py-[1px] text-[0.56rem] font-semibold uppercase tracking-[0.18em] rounded-sm shrink-0"
        style={{ color, background: bg, border: `1px solid ${color}55` }}
      >
        {cat}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-[color:var(--bone)]">{name}</span>{' '}
        <span className="text-[color:var(--bone-soft)]">{body}</span>
      </span>
    </li>
  );
}

function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      {/* Frame */}
      <div
        className="relative overflow-hidden rounded-[42px] border-[3px] p-2 pt-6"
        style={{
          borderColor: 'hsl(220 18% 22%)',
          background: 'hsl(220 24% 6%)',
          boxShadow: '0 30px 60px hsl(220 100% 0% / 0.5), inset 0 0 0 1px hsl(220 24% 18%)',
        }}
      >
        {/* Notch */}
        <div
          aria-hidden
          className="absolute left-1/2 top-[10px] h-[22px] w-[110px] -translate-x-1/2 rounded-b-[14px] rounded-t-[6px]"
          style={{ background: 'hsl(220 28% 4%)' }}
        />
        {/* Status bar */}
        <div className="relative flex items-center justify-between px-4 pt-1 pb-2 mono text-[0.55rem] uppercase tracking-[0.18em] text-[color:var(--bone-mute)] tabular">
          <span>07:14</span>
          <span className="flex items-center gap-0.5">
            <span>•••</span>
            <span>▫</span>
          </span>
        </div>

        {/* Screen */}
        <div className="rounded-[28px] bg-[hsl(220_22%_10%)] px-3 pb-3 pt-2">
          {/* Contact header */}
          <div className="mb-3 flex flex-col items-center border-b border-[color:var(--hairline)]/60 pb-2">
            <span className="grid size-10 place-items-center rounded-full border border-[color:var(--hairline)] bg-[color:var(--panel-raised)] mono text-[0.66rem] font-bold" style={{ color: 'var(--heritage)' }}>
              RL
            </span>
            <span className="mono mt-1 text-[0.58rem] uppercase tracking-[0.22em] text-[color:var(--bone-mute)]">
              REFLECT · TEAM LINE
            </span>
          </div>

          {/* Messages */}
          <ul className="space-y-2 text-[0.78rem] leading-snug">
            <Msg side="in">How&rsquo;s the body? 1–10</Msg>
            <Msg side="out">7</Msg>
            <Msg side="in">Nice. You at practice tomorrow?</Msg>
            <Msg side="out">Yep. Hitting the weights tonight too.</Msg>
            <Msg side="out" pulse>
              <span className="mono text-[0.58rem] uppercase tracking-[0.18em] opacity-70">Workout:</span>
              <br />
              erg 5×500 @ 2k pace, 1k warmdown
            </Msg>
          </ul>

          {/* Input faux */}
          <div className="mt-3 flex items-center gap-2 rounded-full border border-[color:var(--hairline)] px-3 py-1.5">
            <span className="mono text-[0.62rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)] flex-1">
              Text message
            </span>
            <span className="grid size-4 place-items-center rounded-full" style={{ background: 'var(--signal)' }}>
              <span className="mono text-[0.5rem] text-[color:var(--ink)]">↑</span>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between mono text-[0.6rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
        <span>Fig. 01 — athlete</span>
        <span>SMS / WhatsApp</span>
      </div>
    </div>
  );
}

function Msg({ side, children, pulse }: { side: 'in' | 'out'; children: React.ReactNode; pulse?: boolean }) {
  const isOut = side === 'out';
  return (
    <li className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <span
        className={`relative max-w-[78%] rounded-[14px] px-3 py-1.5 ${pulse ? 'slide-in-row' : ''}`}
        style={
          isOut
            ? {
                background: 'hsl(188 70% 46%)',
                color: 'hsl(220 28% 6%)',
                borderBottomRightRadius: '4px',
              }
            : {
                background: 'hsl(220 18% 18%)',
                color: 'hsl(36 28% 94%)',
                borderBottomLeftRadius: '4px',
              }
        }
      >
        {children}
      </span>
    </li>
  );
}

function FlowArrow() {
  return (
    <div className="flex flex-row items-center justify-center gap-2 lg:flex-col lg:gap-3">
      <span className="mono text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)] lg:writing-mode-vertical">
        POLL · 15s
      </span>
      <div
        className="relative hidden lg:block"
        style={{
          height: '220px',
          width: '2px',
          background:
            'linear-gradient(to bottom, transparent 0%, hsl(188 82% 58%) 30%, hsl(188 82% 58%) 70%, transparent 100%)',
        }}
      >
        <span
          className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full"
          style={{ background: 'hsl(188 82% 58%)', boxShadow: '0 0 12px hsl(188 82% 58%)', animation: 'arrowDrift 2.4s linear infinite' }}
        />
      </div>
      <div
        className="relative h-[2px] w-16 lg:hidden"
        style={{
          background:
            'linear-gradient(to right, transparent, hsl(188 82% 58%), transparent)',
        }}
      />
      <span className="mono text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--signal)]">→</span>
      <style>{`
        @keyframes arrowDrift {
          0% { transform: translate(-50%, 0); opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translate(-50%, 220px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function DashboardMock() {
  return (
    <div className="panel relative overflow-hidden">
      {/* Top bar — imitates PageHeader */}
      <div
        className="h-[2px]"
        style={{
          background:
            'linear-gradient(to right, transparent, hsl(188 82% 58%) 50%, transparent)',
        }}
      />
      <div className="flex items-center justify-between border-b border-[color:var(--hairline)] px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="station-code">00.</span>
          <span className="eyebrow">Control room</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="live-dot" />
            <span className="eyebrow-signal">LIVE</span>
          </span>
        </div>
        <span className="mono text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
          WINDOW · 24H
        </span>
      </div>

      {/* Body — dial + wire */}
      <div className="grid grid-cols-1 gap-0 sm:grid-cols-[auto_1fr]">
        {/* Dial */}
        <div className="flex flex-col items-center justify-center border-b border-[color:var(--hairline)] p-5 sm:border-b-0 sm:border-r">
          <ReadinessDial
            value={7.2}
            responses={19}
            size={200}
            label="Team readiness"
            sublabel="19 RESPONSES"
          />
        </div>

        {/* Wire */}
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between border-b border-[color:var(--hairline)] pb-2">
            <div className="flex items-center gap-3">
              <span className="station-code">01.</span>
              <span className="eyebrow">The wire</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="live-dot" />
                <span className="eyebrow-signal">LIVE</span>
              </span>
            </div>
          </div>
          <ul className="space-y-2">
            <WireRow time="07:14:02" cat="SURVEY" tone="signal" name="A. Patel" group="MID-DIST" body="7" highlight />
            <WireRow time="07:12:44" cat="WORKOUT" tone="chlorine" name="M. Lin" group="SPRINT" body="erg 5×500 @ 2k pace, 1k warmdown" />
            <WireRow time="06:58:11" cat="REHAB" tone="amber" name="J. Hayes" group="DIVE" body="foam roll quads + hip flexors, 20 min" />
            <WireRow time="06:41:30" cat="SURVEY" tone="signal" name="K. Okafor" group="DIST" body="6" />
          </ul>
        </div>
      </div>

      {/* Footer strip — stat readouts */}
      <div className="grid grid-cols-3 border-t border-[color:var(--hairline)] bg-[color:var(--panel-raised)]/40">
        <MiniStat label="Messages" value="27" tone="signal" />
        <MiniStat label="Flags" value="1" tone="amber" border />
        <MiniStat label="Response rate" value="91%" tone="chlorine" border />
      </div>

      <div className="mt-3 flex items-center justify-between px-1 mono text-[0.6rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
        <span>Fig. 02 — coach</span>
        <span>LIVE · REALTIME</span>
      </div>
    </div>
  );
}

function WireRow({
  time,
  cat,
  tone,
  name,
  group,
  body,
  highlight,
}: {
  time: string;
  cat: string;
  tone: 'signal' | 'chlorine' | 'amber';
  name: string;
  group: string;
  body: string;
  highlight?: boolean;
}) {
  const color = {
    signal: 'hsl(188 82% 58%)',
    chlorine: 'hsl(162 62% 54%)',
    amber: 'hsl(38 90% 62%)',
  }[tone];
  const bg = {
    signal: 'hsl(188 60% 20% / 0.4)',
    chlorine: 'hsl(162 40% 18% / 0.4)',
    amber: 'hsl(38 60% 20% / 0.4)',
  }[tone];
  return (
    <li className={`flex items-start gap-3 py-1.5 ${highlight ? 'slide-in-row pl-1' : ''}`}>
      <span className="mono text-[0.64rem] tabular text-[color:var(--signal)] shrink-0 pt-[2px] w-[60px]">
        {time}
      </span>
      <span
        className="mono px-1.5 py-[2px] text-[0.54rem] font-semibold uppercase tracking-[0.18em] rounded-sm shrink-0"
        style={{ color, background: bg, border: `1px solid ${color}55` }}
      >
        {cat}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[0.82rem] font-semibold text-[color:var(--bone)]">{name}</span>
          <span className="mono text-[0.56rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
            {group}
          </span>
        </div>
        <div className="text-[0.78rem] text-[color:var(--bone-soft)] leading-snug">{body}</div>
      </div>
    </li>
  );
}

function MiniStat({
  label,
  value,
  tone,
  border,
}: {
  label: string;
  value: string;
  tone: 'signal' | 'chlorine' | 'amber';
  border?: boolean;
}) {
  const color = {
    signal: 'hsl(188 82% 58%)',
    chlorine: 'hsl(162 62% 54%)',
    amber: 'hsl(38 90% 62%)',
  }[tone];
  return (
    <div className={`px-4 py-3 ${border ? 'border-l border-[color:var(--hairline)]' : ''}`}>
      <div className="mono text-[0.6rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
        {label}
      </div>
      <div className="num-display mt-0.5 text-[1.4rem] leading-none tabular" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function Step({
  num,
  code,
  title,
  body,
  accent,
  border,
}: {
  num: string;
  code: string;
  title: string;
  body: string;
  accent: string;
  border?: boolean;
}) {
  return (
    <div
      className={`relative p-6 md:p-7 ${border ? 'md:border-x md:border-[color:var(--hairline)]' : ''}`}
    >
      <div aria-hidden className="absolute left-0 top-0 h-[2px] w-12" style={{ background: accent }} />
      <div className="flex items-baseline gap-3">
        <span className="mono text-sm tabular" style={{ color: accent }}>
          {num}
        </span>
        <span className="eyebrow" style={{ letterSpacing: '0.26em' }}>{code}</span>
      </div>
      <h3 className="h-serif mt-4 text-xl md:text-2xl font-semibold leading-tight">{title}</h3>
      <p className="mt-3 text-[0.92rem] leading-relaxed text-[color:var(--bone-soft)]">{body}</p>
    </div>
  );
}

function Tile({
  code,
  title,
  body,
  border,
  top,
}: {
  code: string;
  title: string;
  body: string;
  border?: 'left';
  top?: boolean;
}) {
  return (
    <div
      className={`p-6 md:p-7 ${border === 'left' ? 'sm:border-l sm:border-[color:var(--hairline)]' : ''} ${top ? 'lg:border-t lg:border-[color:var(--hairline)]' : ''}`}
    >
      <div className="flex items-baseline gap-3">
        <span className="station-code">{code}</span>
      </div>
      <h3 className="h-serif mt-3 text-xl md:text-2xl font-semibold leading-tight">{title}</h3>
      <p className="mt-2 text-[0.9rem] leading-relaxed text-[color:var(--bone-soft)]">{body}</p>
    </div>
  );
}
