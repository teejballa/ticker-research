import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`,           lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${SITE_URL}/insights`,   lastModified: now, changeFrequency: 'daily',   priority: 0.8 },
    { url: `${SITE_URL}/terminal`,   lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/disclaimer`, lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${SITE_URL}/privacy`,    lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${SITE_URL}/terms`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${SITE_URL}/cookies`,    lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ];
}
