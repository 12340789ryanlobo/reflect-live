import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { Brand } from '@/components/v3/brand';

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
