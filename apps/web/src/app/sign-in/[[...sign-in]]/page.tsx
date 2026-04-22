import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';

export default function Page() {
  return (
    <main className="relative grid min-h-screen grid-cols-1 overflow-hidden bg-[var(--paper)] text-[var(--ink)] lg:grid-cols-2">
      {/* Left editorial panel */}
      <section
        className="relative hidden overflow-hidden px-10 py-12 lg:flex lg:flex-col lg:justify-between"
        style={{ background: 'var(--maroon-deep)', color: 'white' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0, transparent 32px, hsl(188 72% 62% / 0.22) 32px, hsl(188 72% 62% / 0.22) 33px)',
          }}
        />
        <div className="relative z-10 reveal reveal-1">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="inline-grid size-7 place-items-center rounded-sm bg-white text-[11px] font-bold" style={{ color: 'var(--maroon-deep)' }}>
              rl
            </span>
            <span className="h-serif text-lg font-semibold tracking-tight">reflect·live</span>
          </Link>
        </div>

        <div className="relative z-10 reveal reveal-3">
          <div className="eyebrow mb-6" style={{ color: 'hsl(36 60% 82%)' }}>
            Access · Coach Deck
          </div>
          <h1 className="h-display text-6xl leading-[0.95]">
            Back to{' '}
            <span className="h-display-italic" style={{ color: 'hsl(188 80% 72%)' }}>
              the deck.
            </span>
          </h1>
          <p className="mt-6 max-w-sm font-serif text-lg leading-relaxed" style={{ color: 'hsl(36 45% 88%)' }}>
            Sign in to pick up where you left off — every message, every rep, still running.
          </p>
        </div>

        <div className="relative z-10 reveal reveal-4 eyebrow" style={{ color: 'hsl(36 40% 78%)' }}>
          <span>Vol. 01 · Spring 2026</span>
        </div>
      </section>

      {/* Right — Clerk form */}
      <section className="flex flex-col items-center justify-center px-6 py-10">
        <div className="reveal reveal-2 w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="h-serif text-xl font-semibold">
              reflect·live
            </Link>
          </div>
          <div className="eyebrow mb-3">Sign in</div>
          <h2 className="h-serif mb-6 text-3xl font-semibold">Pool deck &rarr; data deck.</h2>
          <SignIn
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'shadow-none border border-[hsl(30_18%_86%)] rounded-sm bg-white',
                headerTitle: 'h-serif',
                formButtonPrimary:
                  'bg-[var(--maroon)] hover:bg-[var(--maroon-deep)] rounded-sm font-semibold tracking-wide',
                footerActionLink: 'text-[var(--maroon)] hover:text-[var(--maroon-deep)]',
              },
              variables: {
                colorPrimary: '#9c1e2b',
                borderRadius: '4px',
                fontFamily: 'var(--font-sans)',
              },
            }}
          />
        </div>
      </section>
    </main>
  );
}
