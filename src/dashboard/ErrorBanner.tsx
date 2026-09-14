import type { AppError } from '../../shared/appState';
import { IconAlert, IconButton, IconClose } from '../components/ui';
import { getErrorMessage } from './errorMessages';

type ErrorBannerProps = {
  error: AppError | null;
  onDismiss: () => void;
};

/** Global errors such as a lost connection; field errors are shown at their field instead. */
export function ErrorBanner({ error, onDismiss }: ErrorBannerProps): React.JSX.Element | null {
  if (!error) {
    return null;
  }

  return (
    <div className="error-banner" role="alert">
      <IconAlert className="error-banner-icon" />
      <p>{getErrorMessage(error.code)}</p>
      <IconButton label="Fehlermeldung schließen" icon={IconClose} size="sm" onClick={onDismiss} />
    </div>
  );
}
