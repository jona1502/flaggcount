import type { AnchorHTMLAttributes, ReactNode } from 'react';

/** Plain anchor in place of `next/link`, which needs the App Router context in unit tests. */
export default function Link({ href, children, prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean; children: ReactNode }) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}
