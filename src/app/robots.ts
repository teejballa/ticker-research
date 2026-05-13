import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/insights', '/terminal', '/research/'],
        disallow: ['/api/', '/dashboard', '/auth/'],
      },
    ],
    sitemap: 'https://cipher.tools/sitemap.xml',
    host: 'https://cipher.tools',
  };
}
