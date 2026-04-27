import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { Brand } from '@/components/v3/brand';

export default function Page() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[color:var(--paper)]">
      <div className="mb-10">
        <Link href="/"><Brand size="lg" /></Link>
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: 'w-full max-w-[440px]',
            card: 'bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl shadow-[var(--shadow)]',
            headerTitle: 'font-bold tracking-tight',
            formButtonPrimary: 'bg-[color:var(--blue)] hover:bg-[color:var(--blue-2)] rounded-xl font-semibold',
            footerActionLink: 'text-[color:var(--blue)]',
          },
          variables: {
            colorPrimary: '#1F5FB0',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
          },
        }}
      />
      <Link href="/" className="mt-8 text-[12px] text-[color:var(--ink-mute)] hover:text-[color:var(--blue)] transition">
        ← Back to home
      </Link>
    </main>
  );
}
