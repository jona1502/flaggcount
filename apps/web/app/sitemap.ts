import type { MetadataRoute } from 'next';
import { PUBLIC_PATHS, SITE_URL } from '../lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    changeFrequency: path === '/' || path === '/pro' || path === '/herunterladen' ? 'weekly' : 'yearly',
    priority: path === '/' ? 1 : path === '/pro' ? 0.8 : 0.5
  }));
}
