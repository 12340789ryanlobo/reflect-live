import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';

export default function Page() {
  return (
    <main className="relative grid min-h-screen grid-cols-1 overflow-hidden bg-[var(--paper)] text-[var(--ink)] lg:grid-cols-2">
      {/* Right editorial panel (visual flip of sign-in) */}
      <section
        className="relative order-2 hidden overflow-hidden px-10 py-12 lg:order-2 lg:flex lg:flex-col lg:justify-between"
        style={{ background: 'var(--ink)', color: 'hsl(36 35% 94%)' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0, transparent 40px, hsl(188 80% 58% / 0.22) 40px, hsl(188 80% 58% / 0.22) 41px)',
          }}
        />
        <div className="relative z-10 reveal reveal-1">
          <Link href="/" className="inline-flex items-center gap-3">
            <span
              className="inline-grid size-7 place-items-center rounded-sm text-[11px] font-bold"
              style={{ background: 'var(--maroon)', color: 'white' }}
            >
              rl
            </span>
            <span className="h-serif text-lg font-semibold tracking-tight">reflect·live</span>
          </Link>
        </div>

        <div className="relative z-10 reveal reveal-3">
          <div className="eyebrow mb-6" style={{ color: 'hsl(188 50% 78%)' }}>
            Enroll · New Account
          </div>
          <h1 className="h-display text-6xl leading-[0.95]">
            Join the{' '}
            <span className="h-display-italic" style={{ color: 'hsl(188 80% 68%)' }}>
              lane.
            </span>
          </h1>
          <p className="mt-6 max-w-sm font-serif text-lg leading-relaxed" style={{ color: 'hsl(36 22% 80%)' }}>
            Create your account, pick your team, and the pool deck comes online in real time.
          </p>
        </div>

        <div className="relative z-10 reveal reveal-4 eyebrow" style={{ color: 'hsl(36 22% 72%)' }}>
          <span>Vol. 01 · Spring 2026</span>
        </div>
      </section>

      {/* Clerk form */}
      <section className="order-1 flex flex-col items-center justify-center px-6 py-10 lg:order-1">
        <div className="reveal reveal-2 w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="h-serif text-xl font-semibold">
              reflect·live
            </Link>
          </div>
          <div className="eyebrow mb-3">Sign up</div>
          <h2 className="h-serif mb-6 text-3xl font-semibold">Start a new account.</h2>
          <SignUp
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
