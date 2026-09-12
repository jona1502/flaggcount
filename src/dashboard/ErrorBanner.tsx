import type { AppError } from '../../shared/appState';
import { getErrorMessage } from './errorMessages';

type ErrorBannerProps = {
  error: AppError | null;
  onDismiss: () => void;
};

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps): React.JSX.Element | null {
  if (!error) {
    return null;
  }

  return (
    <div className="error-banner" role="alert">
      <p>{getErrorMessage(error.code)}</p>
      <button type="button" className="icon-button" onClick={onDismiss} aria-label="Fehlermeldung schließen">
        ×
      </button>
    </div>
  );
}
