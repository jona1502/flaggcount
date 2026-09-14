import type { AppError } from '../../shared/appState';
import type { FlagCountActions } from '../api/useFlagCount';
import type { AppModel } from '../app-shell/appModel';
import type { Navigate, Route } from '../app-shell/navigation';

export type PageProps = {
  model: AppModel;
  route: Route;
  pending: boolean;
  /** The last backend error; dialogs repeat it because they cover the global banner. */
  error: AppError | null;
  actions: FlagCountActions;
  navigate: Navigate;
  onCopyText: (text: string) => Promise<void>;
  /** A page with unsaved edits reports them, so navigating away asks first. */
  onUnsavedChanges: (dirty: boolean) => void;
  /** Profiles, counters and licenses are managed in the desktop app only. */
  desktop: boolean;
};
