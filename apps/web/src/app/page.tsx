import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';

export default async function Landing() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard');

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--paper)] text-[var(--ink)]">
      {/* Decorative pool-lane stripes — right gutter */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 hidden h-full w-[28vw] lg:block"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent 0, transparent 46px, hsl(188 72% 42% / 0.11) 46px, hsl(188 72% 42% / 0.11) 47px)',
        }}
      />
      {/* Decorative maroon edge bar — left */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[6px]"
        style={{ background: 'var(--maroon)' }}
      />

      {/* Editorial masthead */}
      <header className="relative flex items-center justify-between px-6 py-5 md:px-12">
        <div className="reveal reveal-1 flex items-center gap-3">
          <span
            className="inline-grid size-7 place-items-center rounded-sm text-[11px] font-bold text-white"
            style={{ background: 'var(--maroon)' }}
          >
            rl
          </span>
          <span className="h-serif text-lg font-semibold tracking-tight">reflect·live</span>
        </div>
        <nav className="reveal reveal-1 eyebrow hidden gap-6 md:flex">
          <span>Vol. 01</span>
          <span>Spring 2026</span>
          <span className="tabular">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span>
        </nav>
      </header>

      {/* Hero — asymmetric editorial layout */}
      <section className="relative grid grid-cols-1 gap-12 px-6 pb-20 pt-10 md:px-12 lg:grid-cols-12 lg:gap-8 lg:pt-16">
        {/* Left column — headline */}
        <div className="lg:col-span-8">
          <div className="reveal reveal-1 mb-8 flex items-center gap-3">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: 'var(--pool)', boxShadow: '0 0 0 4px hsl(188 72% 42% / 0.18)' }}
            />
            <span className="eyebrow">UChicago Swim &amp; Dive · Live Pulse</span>
          </div>

          <h1 className="h-display reveal reveal-2 text-6xl leading-[0.92] md:text-[7.5rem] lg:text-[9.5rem]">
            the team,{' '}
            <span className="h-display-italic" style={{ color: 'var(--maroon)' }}>
              in&nbsp;real
            </span>
            <br />
            <span className="inline-flex items-baseline gap-4">
              time.
              <span
                aria-hidden
                className="hidden h-[0.45em] w-[7rem] md:inline-block"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(to right, var(--pool) 0, var(--pool) 18px, transparent 18px, transparent 28px)',
                }}
              />
            </span>
          </h1>

          <p className="reveal reveal-3 mt-10 max-w-2xl font-serif text-xl leading-relaxed text-[var(--ink-soft)] md:text-2xl">
            A coach&rsquo;s bridge between the pool deck and the data — every workout reply,
            rehab note, readiness score, and meet-day forecast, streaming in as it happens.
          </p>

          <div className="reveal reveal-4 mt-12 flex flex-wrap items-center gap-4">
            <Link
              href="/sign-up"
              className="group relative inline-flex items-center gap-3 rounded-sm px-7 py-4 text-[0.95rem] font-semibold text-white transition"
              style={{ background: 'var(--maroon)' }}
            >
              Open the dashboard
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
            <Link
              href="/sign-in"
              className="ink-link text-[0.95rem] font-semibold uppercase tracking-[0.14em]"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Right column — editorial stat card */}
        <aside className="reveal reveal-5 lg:col-span-4 lg:pt-24">
          <div
            className="relative border-t-[3px] bg-white/70 px-6 py-6 shadow-[0_18px_48px_hsl(220_22%_10%_/_0.08)] backdrop-blur"
            style={{ borderColor: 'var(--maroon)' }}
          >
            <div className="eyebrow mb-4">The Log · Today</div>

            <dl className="space-y-4">
              <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-[hsl(30_18%_82%)] pb-3">
                <dt className="text-sm text-[var(--ink-soft)]">Active athletes</dt>
                <dd className="h-serif tabular text-3xl font-semibold">21</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-[hsl(30_18%_82%)] pb-3">
                <dt className="text-sm text-[var(--ink-soft)]">Poll cadence</dt>
                <dd className="mono text-sm font-medium">
                  <span style={{ color: 'var(--pool-deep)' }}>15s</span>{' '}
                  <span className="text-[var(--ink-mute)]">·</span>{' '}
                  <span style={{ color: 'var(--pool-deep)' }}>10m</span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-[hsl(30_18%_82%)] pb-3">
                <dt className="text-sm text-[var(--ink-soft)]">Data streams</dt>
                <dd className="text-sm font-medium">Twilio · Open-Meteo</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-[var(--ink-soft)]">Realtime</dt>
                <dd className="inline-flex items-center gap-2 text-sm font-medium">
                  <span
                    className="inline-block size-1.5 rounded-full"
                    style={{ background: 'var(--chlorine)', boxShadow: '0 0 0 3px hsl(165 48% 38% / 0.2)' }}
                  />
                  <span>Always on</span>
                </dd>
              </div>
            </dl>
          </div>

          <figcaption className="eyebrow mt-4 flex items-center justify-between">
            <span>Fig. 1 — Pulse index</span>
            <span className="mono normal-case tracking-normal text-[0.72rem]">v.0.1</span>
          </figcaption>
        </aside>
      </section>

      {/* Lane divider */}
      <div
        aria-hidden
        className="mx-6 md:mx-12"
        style={{
          height: '3px',
          backgroundImage:
            'repeating-linear-gradient(to right, var(--ink) 0, var(--ink) 14px, transparent 14px, transparent 22px)',
        }}
      />

      {/* Three-column editorial contents */}
      <section className="relative grid grid-cols-1 gap-10 px-6 py-16 md:grid-cols-3 md:px-12">
        {[
          {
            num: '01',
            kicker: 'Messages',
            title: 'Every reply, tagged.',
            body: 'Workouts, rehabs, check-ins, chat — Twilio messages stream in and sort themselves.',
          },
          {
            num: '02',
            kicker: 'Readiness',
            title: 'A pulse you can read.',
            body: 'Daily 1–10 surveys roll into a team average with flags when somebody dips below four.',
          },
          {
            num: '03',
            kicker: 'Meet days',
            title: 'Know the weather, cold.',
            body: 'Every venue on the calendar pings Open-Meteo every ten minutes. No surprises on race day.',
          },
        ].map((col, i) => (
          <article
            key={col.num}
            className={`reveal reveal-${Math.min(i + 2, 5)} relative border-t border-[hsl(30_18%_82%)] pt-6`}
          >
            <div className="mono text-sm" style={{ color: 'var(--maroon)' }}>
              {col.num}
            </div>
            <div className="eyebrow mt-2">{col.kicker}</div>
            <h3 className="h-serif mt-3 text-2xl font-semibold leading-tight">{col.title}</h3>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-[var(--ink-soft)]">{col.body}</p>
          </article>
        ))}
      </section>

      {/* Footer — colophon */}
      <footer
        className="relative mt-6 flex flex-wrap items-center justify-between gap-3 border-t px-6 py-6 text-[0.78rem] text-[var(--ink-mute)] md:px-12"
        style={{ borderColor: 'hsl(30 18% 86%)' }}
      >
        <span className="eyebrow normal-case tracking-normal">
          © reflect·live · MPCS 51238 · a UChicago assignment
        </span>
        <span className="mono">built with Next · Supabase · Clerk · Twilio</span>
      </footer>
    </main>
  );
}
