import {
  IconCounters,
  IconHistory,
  IconLicense,
  IconLive,
  IconOverlays,
  IconOverview,
  IconProfiles,
  IconSettings,
  type IconComponent
} from '../components/ui';

export type PageId = 'overview' | 'live' | 'counters' | 'overlays' | 'profiles' | 'history' | 'license' | 'settings';

/**
 * A place inside the app. Optional details are deep links, e.g. from a callout straight into the
 * creation wizard or the overlay of one counter.
 */
export type Route =
  | { page: 'overview' }
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
  overview: { id: 'overview', label: 'Übersicht', icon: IconOverview },
  live: { id: 'live', label: 'Live-Steuerung', icon: IconLive },
  counters: { id: 'counters', label: 'Zähler & Abstimmungen', icon: IconCounters },
  overlays: { id: 'overlays', label: 'Overlays', icon: IconOverlays },
  profiles: { id: 'profiles', label: 'Profile', icon: IconProfiles },
  history: { id: 'history', label: 'Historie', icon: IconHistory },
  license: { id: 'license', label: 'Lizenz & Konto', icon: IconLicense },
  settings: { id: 'settings', label: 'Einstellungen', icon: IconSettings }
};

export const DESKTOP_PAGES: readonly PageId[] = ['overview', 'live', 'counters', 'overlays', 'profiles', 'history', 'license', 'settings'];

/** The browser dashboard runs one profile and manages neither counters nor licenses. */
export const WEB_PAGES: readonly PageId[] = ['live', 'overlays', 'settings'];
