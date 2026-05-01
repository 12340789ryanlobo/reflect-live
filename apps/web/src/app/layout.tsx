import { ClerkProvider } from '@clerk/nextjs';
import { Montserrat, JetBrains_Mono } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import type { ReactNode } from 'react';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata = {
  title: 'Reflect — team check-ins, dashboard, the works',
  description:
    'Coach dashboard for team check-ins, fitness, schedule, AI assistant, and more.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${montserrat.variable} ${jetbrains.variable}`}>
        <body>
          <TooltipProvider delayDuration={120}>{children}</TooltipProvider>
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
