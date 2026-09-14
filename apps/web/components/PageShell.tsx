import type { ReactNode } from 'react';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

/** Header, content and footer shared by all public pages. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="landing">
      <SiteHeader />
      <main className="landing-inner">{children}</main>
      <SiteFooter />
    </div>
  );
}
