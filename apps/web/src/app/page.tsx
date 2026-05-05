import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { Brand } from '@/components/v3/brand';
import { DotPattern } from '@/components/ui/dot-pattern';
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text';
import { MagicCard } from '@/components/ui/magic-card';
import { RetroGrid } from '@/components/ui/retro-grid';
import { LandingDashboardPreview } from '@/components/v3/landing-dashboard-preview';
import { LandingHeatmap } from '@/components/v3/landing-heatmap';
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
          <nav className="flex items-center gap-6">
            <Link
              href="/pricing"
              className="text-[13px] font-semibold text-[color:var(--ink-soft)] hover:text-[color:var(--blue)] transition"
            >
              Pricing
            </Link>
            <Link
              href="/sign-in"
              className="text-[13px] font-semibold text-[color:var(--ink-soft)] hover:text-[color:var(--blue)] transition"
            >
              Sign in →
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero — DotPattern concentrated at the bottom of the section
          with a radial mask, fading toward the top + edges. Buttons
          sit inside that dense zone, so each button gets a solid bg
          (--paper for the outline 'Sign in', solid --blue for 'Open
          the dashboard') so the dots don't read through them. */}
      <section className="relative overflow-hidden">
        <DotPattern
          width={22}
          height={22}
          cr={1}
          className={cn(
            'text-[color:var(--ink-mute)]/30',
            '[mask-image:radial-gradient(ellipse_75%_55%_at_50%_95%,white_25%,transparent_75%)]',
            '[-webkit-mask-image:radial-gradient(ellipse_75%_55%_at_50%_95%,white_25%,transparent_75%)]',
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
            style={{
              // Solid paper bg so the hero's DotPattern doesn't read
              // through the outline button — without it, the dots
              // visible behind the button made it look 'transparent'.
              background: 'var(--paper)',
              borderColor: 'var(--border-2)',
              color: 'var(--ink-soft)',
            }}
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
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,360px)] gap-12 items-center">
            <div>
              <p className="mb-3">
                <AnimatedShinyText className="text-[12px] font-bold uppercase tracking-[0.12em] text-[color:var(--blue)]">
                  The check-in
                </AnimatedShinyText>
              </p>
              <h2 className="text-2xl md:text-3xl font-bold tracking-[-0.01em] text-[color:var(--ink)] leading-[1.15] max-w-[20ch]">
                One survey. One text. One stream of truth.
              </h2>
              <p className="mt-5 max-w-[50ch] text-[14px] text-[color:var(--ink-soft)] leading-relaxed">
                The team bot sends questions on the channel athletes already use.
                Replies are tagged on arrival, paired with the question that prompted them,
                and routed into per-metric trends — no app, no portal, no friction.
              </p>
              <ul className="mt-6 space-y-2.5 text-[13.5px] text-[color:var(--ink-soft)]">
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
          <LandingDashboardPreview />
        </div>
      </section>

      {/* Body heatmap — pulls in the same react-muscle-highlighter
          component the dashboard uses, fed with mock injury counts.
          Sells the "pain reports auto-tag body regions" line earlier
          in the page by actually showing it. */}
      <section
        className="border-y reveal reveal-3"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
      >
        <div className="mx-auto max-w-[1280px] px-6 py-20 md:px-10">
          <p className="mb-3">
            <AnimatedShinyText className="text-[12px] font-bold uppercase tracking-[0.12em] text-[color:var(--blue)]">
              Where it hurts
            </AnimatedShinyText>
          </p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-[-0.01em] text-[color:var(--ink)] leading-[1.15] max-w-[24ch]">
            Pain reports turn straight into a body map.
          </h2>
          <p className="mt-5 max-w-[60ch] text-[14px] text-[color:var(--ink-soft)] leading-relaxed">
            Athletes name a sore region in their reply. The same alias parser
            the dashboard uses tags it to a canonical body region — &ldquo;tight
            hamstrings,&rdquo; &ldquo;left lower back,&rdquo; &ldquo;tennis
            elbow&rdquo; — and paints the team heatmap accordingly. Click any
            muscle in the live dashboard to filter the timeline to entries
            that touched it.
          </p>
          <div className="mt-10">
            <LandingHeatmap />
          </div>
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

      {/* CTA — static RetroGrid floor receding to the horizon. The
          previous animated version flickered on retina because the
          perspective transform compresses lines toward the horizon and
          a moving bg-position aliases hard. Static gives the same 'a
          floor' visual without the moiré. */}
      <section className="relative overflow-hidden">
        <RetroGrid
          angleDegrees={62}
          cellSize={64}
          lineColor="var(--blue)"
          opacity={0.13}
          heightFraction={0.7}
          lineWidth={1.5}
        />
        <div className="relative mx-auto max-w-[920px] px-6 py-24 md:px-10 md:py-32 text-center">
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

// SMS thread mocked up as an iPhone-style device. Three nested layers:
//   1. Outer device chrome — thicker dark border, deep shadow, larger
//      corner radius (54px) so the silhouette reads as a phone.
//   2. Inner screen — paper bg + notch pill at top center + iOS-style
//      status bar (signal / wifi / battery glyphs as plain unicode so
//      we don't ship icon weight).
//   3. Conversation surface — same Bubble pattern as before.
// All static. Mobile clamps the device to ~85% viewport width so the
// silhouette stays recognizable on small screens.
function SmsThread() {
  return (
    // Center the phone vertically in the column so the section
    // doesn't grow to phone-height when the text column is shorter.
    // The huge gap below the text in the previous layout was caused
    // by the phone being ~650px tall while the text was ~600px and
    // the row left-aligning to start.
    <div className="flex justify-center items-center lg:justify-center h-full">
      <div
        // aspect-[9/18] is portrait but less extreme than 9/19.5 —
        // the phone reads as a phone without dominating the row.
        // Width trimmed 300 → 240 so the silhouette is proportionate
        // to the text column rather than overpowering it.
        className="relative w-full max-w-[240px] aspect-[9/18] rounded-[36px] p-1.5 shadow-[0_24px_48px_-15px_rgba(20,25,35,0.30),0_8px_20px_-6px_rgba(20,25,35,0.18)]"
        style={{
          background: 'linear-gradient(180deg, #0F141C 0%, #1F2530 100%)',
        }}
      >
        {/* Inner screen — h-full so it fills the aspect-locked frame */}
        <div
          className="relative h-full rounded-[30px] overflow-hidden flex flex-col"
          style={{ background: 'var(--paper)' }}
        >
          {/* Notch — Dynamic-Island-style pill at the top center */}
          <div
            className="absolute left-1/2 top-2 -translate-x-1/2 h-5 w-24 rounded-full z-10"
            style={{ background: '#0B0F18' }}
            aria-hidden
          />

          {/* iOS-ish status bar */}
          <div className="shrink-0 flex items-center justify-between px-7 pt-3 pb-1 text-[10.5px] mono tabular text-[color:var(--ink)]">
            <span className="font-semibold">7:02</span>
            <span className="flex items-center gap-1.5 text-[color:var(--ink-soft)]">
              <span aria-hidden>•••</span>
              <span aria-hidden className="text-[11px] leading-none">⌃</span>
              <span aria-hidden className="inline-block w-5 h-2.5 rounded-[3px] border" style={{ borderColor: 'var(--ink)' }}>
                <span className="block h-full w-3/4 rounded-[2px]" style={{ background: 'var(--ink)' }} />
              </span>
            </span>
          </div>

          {/* Conversation header */}
          <div
            className="shrink-0 flex items-center gap-2 px-4 pt-2.5 pb-2.5 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <span
              className="grid place-items-center size-6 rounded-full text-white text-[9.5px] font-bold"
              style={{ background: 'var(--blue)' }}
              aria-hidden
            >
              R
            </span>
            <div className="min-w-0">
              <div className="text-[11.5px] font-bold text-[color:var(--ink)] truncate leading-tight">Your team bot</div>
              <div className="text-[9.5px] text-[color:var(--ink-mute)] uppercase tracking-wide leading-tight">Team check-in</div>
            </div>
          </div>

          {/* Messages — flex-1 fills the remaining height inside the
              aspect-locked frame; overflow-hidden truncates if a
              future tweak adds more bubbles than fit. */}
          <div className="flex-1 flex flex-col gap-2 px-3.5 py-3 overflow-hidden">
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

          {/* Home indicator bar */}
          <div className="flex justify-center pt-1 pb-2 shrink-0">
            <span
              className="h-1 w-24 rounded-full"
              style={{ background: 'var(--ink)' }}
              aria-hidden
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ from, children }: { from: 'me' | 'bot'; children: React.ReactNode }) {
  if (from === 'me') {
    return (
      <div className="flex justify-end">
        <div
          className="rounded-2xl rounded-br-md px-2.5 py-1.5 text-[11px] font-semibold text-white max-w-[80%]"
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
        className="rounded-2xl rounded-bl-md px-2.5 py-1.5 text-[11px] leading-snug text-[color:var(--ink-soft)] max-w-[88%] border"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        {children}
      </div>
    </div>
  );
}

