import type { MetadataRoute } from 'next';

const BASE = 'https://cipher.tools';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`,         lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/insights`, lastModified: now, changeFrequency: 'daily',   priority: 0.8 },
    { url: `${BASE}/terminal`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
