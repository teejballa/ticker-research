import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Cipher — Source-cited equity research';
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
          justifyContent: 'space-between',
          padding: '72px',
          background: 'radial-gradient(circle at 30% 20%, #1a2540 0%, #0a0d14 70%)',
          color: '#dfe2eb',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: 12,
            color: '#b6c4ff',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Equity research · Cited
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              fontSize: 200,
              fontWeight: 900,
              letterSpacing: 16,
              color: '#dfe2eb',
              lineHeight: 1,
            }}
          >
            CIPHER
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.25, maxWidth: 900 }}>
            Source-cited research on any ticker — calibrated against the S&amp;P 500.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 20,
            letterSpacing: 4,
            color: '#7a8aa8',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          <span>Sentiment · Drivers · Outlook</span>
          <span>cipher.tools</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
