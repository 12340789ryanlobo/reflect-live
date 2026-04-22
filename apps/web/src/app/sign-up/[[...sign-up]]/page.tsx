import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { Wordmark } from '@/components/brand-mark';

export default function Page() {
  return (
    <main className="relative grid min-h-screen grid-cols-1 overflow-hidden text-[color:var(--bone)] lg:grid-cols-[1fr_1.1fr]">
      {/* ================ Left — Clerk form ================ */}
      <section className="relative order-2 lg:order-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="reveal reveal-2 w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <Wordmark size={26} tone="bone" />
          </div>
          <div className="mb-3 flex items-center gap-3">
            <span className="station-code">ACCESS · ENROLL</span>
          </div>
          <h2 className="h-serif text-4xl font-semibold leading-tight">
            Start a{' '}
            <span className="h-display-italic" style={{ color: 'hsl(188 82% 58%)' }}>
              new account.
            </span>
          </h2>
          <div className="mt-8">
            <SignUp
              appearance={{
                elements: {
                  rootBox: 'w-full',
                  card: 'bg-[color:var(--panel-over)] border border-[color:var(--hairline)] rounded-sm shadow-[0_18px_48px_hsl(220_100%_0%_/_0.4)]',
                  headerTitle: 'h-serif text-[color:var(--bone)]',
                  headerSubtitle: 'text-[color:var(--bone-mute)]',
                  socialButtonsBlockButton:
                    'border-[color:var(--hairline-strong)] hover:bg-[color:var(--panel-raised)] text-[color:var(--bone)]',
                  formFieldLabel: 'mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]',
                  formFieldInput:
                    'bg-[color:var(--panel-raised)] border-[color:var(--hairline-strong)] text-[color:var(--bone)]',
                  formButtonPrimary:
                    'bg-[color:var(--heritage)] hover:bg-[color:var(--heritage-deep)] rounded-sm mono uppercase tracking-[0.2em] text-[0.75rem] font-semibold',
                  footerActionLink:
                    'text-[color:var(--signal)] hover:text-[color:var(--bone)] transition',
                  dividerLine: 'bg-[color:var(--hairline)]',
                  dividerText: 'text-[color:var(--bone-mute)] mono text-[0.66rem] uppercase tracking-[0.2em]',
                },
                variables: {
                  colorPrimary: 'hsl(358 78% 58%)',
                  colorBackground: 'hsl(220 22% 14%)',
                  colorText: 'hsl(36 28% 94%)',
                  colorTextSecondary: 'hsl(36 10% 62%)',
                  colorInputBackground: 'hsl(220 22% 11%)',
                  colorInputText: 'hsl(36 28% 94%)',
                  colorNeutral: 'hsl(36 28% 94%)',
                  colorShimmer: 'hsl(188 82% 58%)',
                  borderRadius: '3px',
                  fontFamily: 'var(--font-sans)',
                  fontFamilyButtons: 'var(--font-sans)',
                },
              }}
            />
          </div>
          <Link
            href="/"
            className="mt-8 mono text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--bone-mute)] hover:text-[color:var(--signal)] transition inline-flex items-center gap-2"
          >
            ← Back to the masthead
          </Link>
        </div>
      </section>

      {/* ================ Right editorial panel ================ */}
      <section
        className="relative order-1 lg:order-2 hidden overflow-hidden px-10 py-10 lg:flex lg:flex-col lg:justify-between"
        style={{
          background:
            'radial-gradient(ellipse 900px 600px at 100% 0%, hsl(188 82% 32% / 0.35), transparent 60%), hsl(220 28% 6%)',
        }}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{ background: 'linear-gradient(to right, transparent, hsl(358 78% 58%), transparent)' }}
        />

        <div className="relative z-10 reveal reveal-1 flex justify-end">
          <Wordmark size={30} tone="bone" />
        </div>

        <div className="relative z-10 reveal reveal-3 max-w-xl">
          <div className="eyebrow mb-5" style={{ color: 'hsl(188 50% 80%)' }}>
            Enroll · New account
          </div>
          <h1 className="h-display text-[5.5rem] leading-[0.9]">
            Join the{' '}
            <span className="h-display-italic" style={{ color: 'hsl(358 78% 68%)' }}>
              broadcast.
            </span>
          </h1>
          <p
            className="mt-8 max-w-md font-serif text-lg leading-relaxed"
            style={{ color: 'hsl(36 22% 80%)' }}
          >
            Create an account, pick your team, and the control room comes online — every signal on
            the wire, the second it fires.
          </p>
        </div>

        <div className="relative z-10 reveal reveal-4 flex items-center justify-between eyebrow" style={{ color: 'hsl(36 22% 72%)' }}>
          <span>Fig. 02 — Enroll</span>
          <span>MPCS 51238 · SPRING 2026</span>
        </div>
      </section>
    </main>
  );
}
