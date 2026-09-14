import type { FlagCountActions } from '../api/useFlagCount';
import type { AppModel } from '../app-shell/appModel';
import type { Navigate, Route } from '../app-shell/navigation';

export type PageProps = {
  model: AppModel;
  route: Route;
  pending: boolean;
  actions: FlagCountActions;
  navigate: Navigate;
  onCopyText: (text: string) => Promise<void>;
  /** Profiles, counters and licenses are managed in the desktop app only. */
  desktop: boolean;
};
