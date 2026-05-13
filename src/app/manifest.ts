import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cipher',
    short_name: 'Cipher',
    description:
      'Source-cited equity research on any ticker. Sentiment, drivers, outlook, and a calibrated recommendation.',
    start_url: '/',
    display: 'standalone',
    background_color: '#10141a',
    theme_color: '#10141a',
    icons: [
      { src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
    ],
  };
}
