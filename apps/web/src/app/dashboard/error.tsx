'use client';

// Segment error boundary for everything under /dashboard. A render or
// data-fetch throw inside a dashboard page lands here instead of the
// bare Next.js default screen, so the coach sees a recoverable card
// rather than a white page. `reset()` re-renders the segment.

import { useEffect } from 'react';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard] render error:', error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div
        className="w-full max-w-[440px] rounded-2xl border p-8 text-center"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
      >
        <h1 className="text-lg font-bold text-[color:var(--ink)]">Something broke on this page</h1>
        <p className="mt-2 text-[13px] text-[color:var(--ink-mute)] leading-relaxed">
          The rest of the dashboard is fine — this view hit an error while loading.
          Try again, or head back to the dashboard home.
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
            href="/dashboard"
            className="rounded-xl border px-5 py-2.5 text-[13px] font-semibold transition hover:bg-[color:var(--card-hover)]"
            style={{ borderColor: 'var(--border-2)', color: 'var(--ink)' }}
          >
            Dashboard home
          </Link>
        </div>
      </div>
    </main>
  );
}
