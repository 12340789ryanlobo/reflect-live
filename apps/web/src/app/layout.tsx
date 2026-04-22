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
  title: 'reflect-live · UChicago Swim & Dive',
  description: 'Real-time team pulse for UChicago Swim & Dive coaches.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${fraunces.variable} ${instrument.variable} ${jetbrains.variable}`}
      >
        <body className="grain">
          <TooltipProvider delayDuration={120}>{children}</TooltipProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
