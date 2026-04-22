import { ClerkProvider } from '@clerk/nextjs';
import { Fraunces, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';
import type { ReactNode } from 'react';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
});

const instrument = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata = {
  title: 'reflect·live · the team pulse, live',
  description:
    'Broadcast-grade coach instrument panel. Every message, every workout, every signal — the second it fires.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`dark ${fraunces.variable} ${instrument.variable} ${jetbrains.variable}`}
        suppressHydrationWarning
      >
        <body className="grain">
          <TooltipProvider delayDuration={120}>{children}</TooltipProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
