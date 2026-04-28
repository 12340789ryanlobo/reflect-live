// Open Graph image for link shares. Dynamically rendered at request
// time via Next.js's ImageResponse — no static asset to maintain.

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'reflect — team check-ins, dashboard, the works';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: 80,
          background: '#FAF8F3',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <svg width="120" height="120" viewBox="0 0 100 100" fill="none" stroke="#1F5FB0" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M 14 50 C 14 26, 30 14, 42 14 Q 46 23, 50 15 Q 54 23, 58 14 C 70 14, 86 26, 86 50" />
            <line x1="16" y1="50" x2="84" y2="50" />
            <path d="M 22 56 Q 50 86, 78 56" />
          </svg>
          <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: '-0.02em', color: '#141923' }}>
            reflect
          </div>
        </div>
        <div style={{ fontSize: 36, fontWeight: 500, color: '#475264', marginTop: 32, maxWidth: 900 }}>
          Real-time team check-ins, fitness, and recovery — for college and club sports.
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, color: '#8D94A2', marginTop: 'auto', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          UChicago Swim &amp; Dive · 2026
        </div>
      </div>
    ),
    size,
  );
}
