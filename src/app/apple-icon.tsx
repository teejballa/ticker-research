import { ImageResponse } from 'next/og';

// iOS "add to home screen" icon. Full-bleed square (no rounding — iOS applies
// its own mask), same indigo "C" mark as the favicon.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2F44D6',
          color: '#FFFFFF',
          fontSize: 124,
          fontWeight: 800,
          fontFamily: 'sans-serif',
        }}
      >
        C
      </div>
    ),
    { ...size },
  );
}
