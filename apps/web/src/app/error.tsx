'use client';

// Root segment error boundary — catches render/data throws in the
// public pages (marketing, onboarding, auth) that live outside the
// /dashboard segment, which has its own boundary. Errors in the root
// layout itself need a global-error boundary; this covers the page
// tree below it.

import { useEffect } from 'react';
import Link from 'next/link';
import { Brand } from '@/components/v3/brand';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[root] render error:', error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-[color:var(--paper)]">
      <div className="w-full max-w-[440px] text-center">
        <div className="mb-8 flex justify-center"><Brand size="lg" /></div>
        <div
          className="rounded-2xl border p-8"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          <h1 className="text-lg font-bold text-[color:var(--ink)]">Something went wrong</h1>
          <p className="mt-2 text-[13px] text-[color:var(--ink-mute)] leading-relaxed">
            We hit an unexpected error. Try again, or return home.
          </p>
          {error.digest && (
            <p className="mt-3 mono text-[11px] text-[color:var(--ink-dim)]">ref: {error.digest}</p>
          )}
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"
              style={{ background: 'var(--blue)' }}
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-xl border px-5 py-2.5 text-[13px] font-semibold transition hover:bg-[color:var(--card-hover)]"
              style={{ borderColor: 'var(--border-2)', color: 'var(--ink)' }}
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
