import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/insights',
          '/terminal',
          '/research/',
          '/disclaimer',
          '/privacy',
          '/terms',
          '/cookies',
        ],
        disallow: ['/api/', '/dashboard', '/auth/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
