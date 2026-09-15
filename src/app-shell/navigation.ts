import {
  IconCounters,
  IconHistory,
  IconLicense,
  IconLive,
  IconOverlays,
  IconProfiles,
  IconSettings,
  type IconComponent
} from '../components/ui';

export type PageId = 'live' | 'counters' | 'overlays' | 'profiles' | 'history' | 'license' | 'settings';

/**
 * A place inside the app. Optional details are deep links, e.g. from a callout straight into the
 * creation wizard or the overlay of one counter.
 */
export type Route =
  | { page: 'live' }
  | { page: 'counters'; counterId?: string; create?: boolean }
  | { page: 'overlays'; target?: string }
  | { page: 'profiles' }
  | { page: 'history' }
  | { page: 'license' }
  | { page: 'settings' };

export type Navigate = (route: Route) => void;

export type PageDescription = {
  id: PageId;
  label: string;
  icon: IconComponent;
};

export const PAGES: Record<PageId, PageDescription> = {
  live: { id: 'live', label: 'Übersicht', icon: IconLive },
  counters: { id: 'counters', label: 'Zähler & Abstimmungen', icon: IconCounters },
  overlays: { id: 'overlays', label: 'Overlays', icon: IconOverlays },
  profiles: { id: 'profiles', label: 'Profile', icon: IconProfiles },
  history: { id: 'history', label: 'Historie', icon: IconHistory },
  license: { id: 'license', label: 'Pro & Lizenz', icon: IconLicense },
  settings: { id: 'settings', label: 'Einstellungen', icon: IconSettings }
};

export type NavGroup = {
  id: string;
  label: string;
  pages: readonly PageId[];
};

/** Streaming comes first; setting up and the account stay apart, so the overview never drowns in forms. */
export const NAV_GROUPS: readonly NavGroup[] = [
  { id: 'stream', label: 'Stream', pages: ['live'] },
  { id: 'setup', label: 'Einrichten', pages: ['counters', 'overlays', 'profiles'] },
  { id: 'account', label: 'Konto', pages: ['history', 'license', 'settings'] }
];

export const DESKTOP_PAGES: readonly PageId[] = NAV_GROUPS.flatMap((group) => group.pages);

/** The browser dashboard runs one profile and manages neither counters nor licenses. */
export const WEB_PAGES: readonly PageId[] = ['live', 'overlays', 'settings'];
