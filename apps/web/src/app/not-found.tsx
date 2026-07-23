// 404 boundary — served for any unmatched route. Server component;
// keeps the app's paper/ink styling instead of the bare Next default.

import Link from 'next/link';
import { Brand } from '@/components/v3/brand';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-[color:var(--paper)]">
      <div className="w-full max-w-[440px] text-center">
        <div className="mb-8 flex justify-center"><Brand size="lg" /></div>
        <div
          className="rounded-2xl border p-8"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          <div className="mono text-[13px] font-semibold text-[color:var(--ink-mute)]">404</div>
          <h1 className="mt-1 text-lg font-bold text-[color:var(--ink)]">Page not found</h1>
          <p className="mt-2 text-[13px] text-[color:var(--ink-mute)] leading-relaxed">
            That page doesn&rsquo;t exist or has moved.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"
              style={{ background: 'var(--blue)' }}
            >
              Dashboard
            </Link>
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
