import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { BrandMark, Wordmark } from '@/components/brand-mark';

export default async function Landing() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard');

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).toUpperCase();

  return (
    <main className="relative min-h-screen overflow-hidden text-[color:var(--bone)]">
      {/* ============================================================
          Masthead — broadcast bar, wordmark, live tick, date
          ============================================================ */}
      <header className="relative z-10 border-b border-[color:var(--hairline)]/60">
        <div
          className="h-[2px]"
          style={{
            background:
              'linear-gradient(to right, transparent 0%, hsl(188 82% 58%) 20%, hsl(188 82% 58%) 80%, transparent 100%)',
          }}
        />
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-4 px-6 py-4 md:px-10">
          <Wordmark size={30} tone="bone" />
          <div className="hidden items-center gap-6 md:flex">
            <span className="inline-flex items-center gap-2">
              <span className="live-dot" />
              <span className="eyebrow-signal">ON AIR</span>
            </span>
            <span className="eyebrow">{dateStr}</span>
            <span className="mono text-[0.7rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
              VOL.01 / ISSUE 001
            </span>
          </div>
          <Link
            href="/sign-in"
            className="mono text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--bone-soft)] hover:text-[color:var(--signal)] transition ink-link"
          >
            Sign in →
          </Link>
        </div>
      </header>

      {/* ============================================================
          HERO — asymmetric editorial with oversized display type
          ============================================================ */}
      <section className="relative">
        {/* Left edge lane — the signature rail running through the whole page */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 hidden h-full w-px md:block"
          style={{ background: 'linear-gradient(to bottom, transparent 0%, hsl(220 16% 22%) 20%, hsl(220 16% 22%) 80%, transparent 100%)' }}
        />
        {/* Station code ribbon on left */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 hidden h-full md:block"
          style={{ width: '56px' }}
        >
          <div className="sticky top-20 flex flex-col items-center gap-3 pt-10">
            <span className="station-code rotate-180" style={{ writingMode: 'vertical-rl' }}>
              00 · MASTHEAD
            </span>
            <span className="h-10 w-px bg-[color:var(--hairline)]" />
          </div>
        </div>

        <div className="mx-auto grid max-w-[1380px] grid-cols-1 gap-12 px-6 pb-24 pt-10 md:px-10 md:pt-16 lg:grid-cols-12 lg:gap-10 lg:pb-28">
          {/* Left — headline */}
          <div className="lg:col-span-8">
            <div className="reveal reveal-1 mb-6 flex items-center gap-4 border-b border-[color:var(--hairline)]/50 pb-3">
              <span className="station-code">00.01</span>
              <span className="eyebrow">The instrument</span>
            </div>

            <h1 className="reveal reveal-2 h-display text-[4.5rem] leading-[0.92] sm:text-[6rem] md:text-[8rem] lg:text-[9.5rem]">
              the team,
              <br />
              <span className="h-display-italic" style={{ color: 'var(--heritage)' }}>
                live
              </span>
              <span
                aria-hidden
                className="ml-5 inline-block h-[0.42em] w-[4.5rem] align-middle md:w-[7rem]"
                style={{
                  background:
                    'linear-gradient(to right, hsl(188 82% 58%), hsl(188 82% 58%) 48%, transparent 50%, transparent 58%, hsl(188 82% 58%) 58%)',
                  backgroundSize: '14px 100%',
                }}
              />
              <br />
              on the{' '}
              <span className="h-display-italic" style={{ color: 'hsl(188 82% 58%)' }}>
                wire.
              </span>
            </h1>

            <p className="reveal reveal-3 mt-10 max-w-[52ch] font-serif text-xl leading-relaxed text-[color:var(--bone-soft)] md:text-[1.35rem]">
              A broadcast-grade coach&rsquo;s instrument panel. Every message, every workout, every
              readiness score, every venue forecast — streaming in the second it fires. Built for
              the pool deck, the soccer sideline, the broadcast truck.
            </p>

            <div className="reveal reveal-4 mt-12 flex flex-wrap items-center gap-5">
              <Link
                href="/sign-up"
                className="group inline-flex items-center gap-3 border px-6 py-3.5 mono text-[0.78rem] font-semibold uppercase tracking-[0.22em] transition"
                style={{
                  background: 'var(--heritage)',
                  borderColor: 'var(--heritage)',
                  color: 'white',
                }}
              >
                Open the deck
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
              <Link
                href="/sign-in"
                className="group inline-flex items-center gap-2 border border-[color:var(--hairline-strong)] px-6 py-3.5 mono text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--bone-soft)] hover:border-[color:var(--signal)] hover:text-[color:var(--signal)] transition"
              >
                Sign in
              </Link>
              <span className="eyebrow hidden md:inline">
                ⌘K · command palette
              </span>
            </div>
          </div>

          {/* Right — editorial stat column */}
          <aside className="reveal reveal-5 lg:col-span-4 lg:pt-8">
            <div className="relative border-t-[2px] border-[color:var(--signal)] bg-[color:var(--panel-raised)]/60 p-6 backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="eyebrow-signal">The log · Tonight</div>
                <span className="live-dot" />
              </div>

              <dl className="mt-5 space-y-4">
                <LogRow left="Active athletes" right={<span className="num-display text-2xl">21</span>} />
                <LogRow
                  left="Poll cadence"
                  right={
                    <span className="mono text-sm">
                      <span style={{ color: 'hsl(188 82% 58%)' }}>15s</span>
                      <span className="text-[color:var(--bone-dim)]"> · </span>
                      <span style={{ color: 'hsl(188 82% 58%)' }}>10m</span>
                    </span>
                  }
                />
                <LogRow
                  left="Data streams"
                  right={<span className="mono text-sm">Twilio · Open-Meteo</span>}
                />
                <LogRow
                  left="Realtime"
                  right={
                    <span className="inline-flex items-center gap-1.5 mono text-sm">
                      <span className="size-1.5 rounded-full bg-[color:var(--chlorine)]" />
                      Always on
                    </span>
                  }
                />
                <LogRow
                  left="Powered by"
                  right={<span className="mono text-sm">Supabase · Next · Clerk</span>}
                />
              </dl>

              {/* Mini sparkline illustration */}
              <div className="mt-6 border-t border-[color:var(--hairline)] pt-4">
                <div className="flex items-end justify-between gap-1 h-10">
                  {[3, 4, 2, 5, 6, 4, 7, 5, 8, 6, 9, 7, 8].map((v, i) => (
                    <span
                      key={i}
                      className="flex-1 rounded-[1px]"
                      style={{
                        height: `${(v / 9) * 100}%`,
                        background:
                          i === 12
                            ? 'var(--signal)'
                            : `hsl(188 60% ${30 + v * 3}% / ${0.4 + i * 0.04})`,
                      }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between mono text-[0.62rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                  <span>Signals · last 13 windows</span>
                  <span>+14% vs. prev</span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between mono text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
              <span>Fig. 01 — Pulse index</span>
              <span>β 0.1</span>
            </div>
          </aside>
        </div>
      </section>

      {/* ============================================================
          CONTENTS — three editorial columns
          ============================================================ */}
      <section className="relative border-y border-[color:var(--hairline)] bg-[color:var(--panel)]/40">
        <div className="mx-auto max-w-[1380px] px-6 py-20 md:px-10">
          <div className="mb-12 flex items-end justify-between gap-6 flex-wrap">
            <div>
              <div className="eyebrow mb-3">Contents</div>
              <h2 className="h-serif text-4xl md:text-5xl">
                Three streams.{' '}
                <span className="h-display-italic" style={{ color: 'var(--heritage)' }}>
                  One truth.
                </span>
              </h2>
            </div>
            <span className="station-code">§ 01 — 03</span>
          </div>

          <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-10">
            <Column
              num="01"
              kicker="Messages"
              title="Every reply, tagged and timestamped."
              body="Twilio SMS streams into the panel within fifteen seconds — workouts, rehabs, check-ins, chat — sorted on arrival. Nothing to refresh. Nothing to chase."
              accent="var(--signal)"
            />
            <Column
              num="02"
              kicker="Readiness"
              title="A pulse you can read at a glance."
              body="Daily 1–10 surveys roll into a team dial with an honest needle. Anyone dips below four and the rim lights siren-red — no scrolling, no alerts, no noise."
              accent="var(--heritage)"
            />
            <Column
              num="03"
              kicker="Venues"
              title="Know the weather before the bus does."
              body="Every venue on your calendar pings Open-Meteo every ten minutes. Wind, precipitation, temperature, condition code — live on the deck, live on race day."
              accent="var(--chlorine)"
            />
          </div>
        </div>
      </section>

      {/* ============================================================
          MANIFESTO — a single paragraph of conviction
          ============================================================ */}
      <section className="relative">
        <div className="mx-auto max-w-[1100px] px-6 py-24 md:px-10 md:py-32">
          <div className="eyebrow mb-6 flex items-center gap-3">
            <span className="station-code">§ 04</span>
            <span>Manifesto</span>
          </div>
          <p className="h-display text-3xl leading-[1.12] md:text-[2.75rem] md:leading-[1.1]">
            A dashboard{' '}
            <span className="h-display-italic" style={{ color: 'var(--signal)' }}>
              isn&rsquo;t a screen.
            </span>{' '}
            It&rsquo;s a pair of eyes on the pool deck when the coach is watching the pool. It&rsquo;s
            the radio next to the clipboard when the clipboard is full. It&rsquo;s the thing that
            answers{' '}
            <span className="h-display-italic" style={{ color: 'var(--heritage)' }}>
              who&rsquo;s quiet
            </span>{' '}
            before the roster meeting, not after. Everything here is built to live on a phone,
            at a venue, in the middle of practice — because that&rsquo;s where coaching happens.
          </p>
          <div className="mt-10 mono text-[0.72rem] uppercase tracking-[0.22em] text-[color:var(--bone-dim)]">
            — THE EDITORS
          </div>
        </div>
      </section>

      {/* ============================================================
          COLOPHON
          ============================================================ */}
      <footer className="relative border-t border-[color:var(--hairline)]">
        <div className="mx-auto flex max-w-[1380px] flex-wrap items-center justify-between gap-6 px-6 py-8 md:px-10">
          <div className="flex items-center gap-3">
            <BrandMark size={26} tone="heritage" />
            <div>
              <div className="h-serif text-sm font-semibold">reflect·live</div>
              <div className="mono text-[0.62rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                MPCS 51238 · Spring 2026 · UChicago
              </div>
            </div>
          </div>
          <div className="mono text-[0.62rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
            Built with Next · Supabase · Clerk · Twilio · Open-Meteo
          </div>
        </div>
      </footer>
    </main>
  );
}

function LogRow({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-[color:var(--hairline)] pb-3 last:border-0 last:pb-0">
      <dt className="mono text-[0.68rem] uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
        {left}
      </dt>
      <dd className="text-[color:var(--bone)]">{right}</dd>
    </div>
  );
}

function Column({
  num,
  kicker,
  title,
  body,
  accent,
}: {
  num: string;
  kicker: string;
  title: string;
  body: string;
  accent: string;
}) {
  return (
    <article className="relative pt-6">
      <div
        aria-hidden
        className="absolute left-0 top-0 h-[2px] w-10"
        style={{ background: accent }}
      />
      <div className="flex items-baseline gap-3">
        <span className="mono text-[0.9rem]" style={{ color: accent }}>
          {num}
        </span>
        <span className="eyebrow">{kicker}</span>
      </div>
      <h3 className="h-serif mt-4 text-2xl font-semibold leading-tight">{title}</h3>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-[color:var(--bone-soft)]">{body}</p>
    </article>
  );
}
