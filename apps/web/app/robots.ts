import type { MetadataRoute } from 'next';
import { SITE_URL, indexingEnabled } from '../lib/site';

export default function robots(): MetadataRoute.Robots {
  if (!indexingEnabled()) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/dashboard', '/api/', '/pro/erfolgreich'] },
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
