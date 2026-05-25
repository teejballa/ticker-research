import { ImageResponse } from 'next/og';

// Tab/bookmark favicon — generated in code (no binary asset), same approach as
// opengraph-image.tsx. A bold white "C" on an indigo rounded tile: legible on
// light and dark tab bars, and on-brand with the CIPHER indigo accent.
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
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
          borderRadius: 7,
          color: '#FFFFFF',
          fontSize: 24,
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
