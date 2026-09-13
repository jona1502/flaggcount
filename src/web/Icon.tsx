import type { ReactNode } from 'react';

/** Decorative 24×24 line icon; the surrounding text carries the meaning. */
export function Icon({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
