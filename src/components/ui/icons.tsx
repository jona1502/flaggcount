import type { ReactNode } from 'react';
import { cx } from './cx';

export type IconProps = {
  size?: number;
  className?: string;
};

export type IconComponent = (props: IconProps) => React.JSX.Element;

/** Local 24×24 line icons. They are decorative: the surrounding text or `aria-label` carries the meaning. */
function createIcon(name: string, paths: ReactNode): IconComponent {
  const Icon = ({ size = 18, className }: IconProps): React.JSX.Element => (
    <svg
      className={cx('ui-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      {paths}
    </svg>
  );
  return Icon;
}

export const IconOverview = createIcon(
  'overview',
  <>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </>
);
export const IconLive = createIcon(
  'live',
  <>
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
  </>
);
export const IconCounters = createIcon('counters', <path d="M3 21h18M6 17v-6M11 17V5M16 17V9M21 17v-3" />);
export const IconPoll = createIcon(
  'poll',
  <>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <rect x="3" y="10" width="12" height="4" rx="1" />
    <rect x="3" y="16" width="7" height="4" rx="1" />
  </>
);
export const IconOverlays = createIcon('overlays', <path d="m12 2-10 5 10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" />);
export const IconProfiles = createIcon(
  'profiles',
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    <circle cx="9" cy="7" r="4" />
  </>
);
export const IconHistory = createIcon('history', <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2" />);
export const IconLicense = createIcon(
  'license',
  <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76ZM9 12l2 2 4-4" />
);
export const IconSettings = createIcon('settings', <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />);
export const IconPlus = createIcon('plus', <path d="M12 5v14M5 12h14" />);
export const IconMinus = createIcon('minus', <path d="M5 12h14" />);
export const IconCopy = createIcon(
  'copy',
  <>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>
);
export const IconDuplicate = createIcon(
  'duplicate',
  <>
    <rect x="8" y="8" width="13" height="13" rx="2" />
    <path d="M4 16V6a2 2 0 0 1 2-2h10M14.5 11.5v6M11.5 14.5h6" />
  </>
);
export const IconCheck = createIcon('check', <path d="M20 6 9 17l-5-5" />);
export const IconClose = createIcon('close', <path d="M18 6 6 18M6 6l12 12" />);
export const IconChevronRight = createIcon('chevron-right', <path d="m9 18 6-6-6-6" />);
export const IconChevronLeft = createIcon('chevron-left', <path d="m15 18-6-6 6-6" />);
export const IconChevronUp = createIcon('chevron-up', <path d="m18 15-6-6-6 6" />);
export const IconChevronDown = createIcon('chevron-down', <path d="m6 9 6 6 6-6" />);
export const IconAlert = createIcon('alert', <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3ZM12 9v4M12 17h.01" />);
export const IconInfo = createIcon(
  'info',
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </>
);
export const IconRefresh = createIcon(
  'refresh',
  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M16 16h5v5" />
);
export const IconTrash = createIcon('trash', <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />);
export const IconEdit = createIcon('edit', <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />);
export const IconExternal = createIcon('external', <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />);
export const IconFlag = createIcon('flag', <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />);
export const IconStar = createIcon('star', <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />);
export const IconLink = createIcon(
  'link',
  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
);
export const IconDownload = createIcon('download', <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />);
export const IconEye = createIcon(
  'eye',
  <>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </>
);
export const IconTarget = createIcon(
  'target',
  <>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </>
);
export const IconMail = createIcon(
  'mail',
  <>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </>
);
export const IconLogout = createIcon('logout', <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />);
export const IconLock = createIcon(
  'lock',
  <>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </>
);
export const IconSidebar = createIcon(
  'sidebar',
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
  </>
);
export const IconPalette = createIcon(
  'palette',
  <>
    <path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-1.5a1.5 1.5 0 0 0-1.06 2.56A1.5 1.5 0 0 1 14.5 22Z" />
    <circle cx="7.5" cy="10.5" r="1" />
    <circle cx="12" cy="7.5" r="1" />
    <circle cx="16.5" cy="10.5" r="1" />
  </>
);
