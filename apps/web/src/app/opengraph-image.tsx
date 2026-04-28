// Open Graph image for link shares. Uses the actual brand PNG via fetch
// at request time so the share preview matches the in-app brand exactly.

import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const alt = 'reflect — team check-ins, dashboard, the works';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OG() {
  // Read the logo from public/ at request time. Encoded as base64 data URI
  // so it inlines into the rendered image without a network round-trip.
  const logoPath = join(process.cwd(), 'public', 'logo.png');
  let logoSrc = '';
  try {
    const buf = readFileSync(logoPath);
    logoSrc = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    // Fall back to no logo if the file isn't available in the runtime
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {logoSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt="" width={130} height={130} />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ fontSize: 96, fontWeight: 700, color: '#1F5FB0', lineHeight: 1 }}>—</span>
            <span style={{ fontSize: 110, fontWeight: 700, letterSpacing: '-0.02em', color: '#1F5FB0', lineHeight: 1 }}>
              reflect
            </span>
          </div>
        </div>
        <div style={{ fontSize: 36, fontWeight: 500, color: '#475264', marginTop: 36, maxWidth: 950 }}>
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
