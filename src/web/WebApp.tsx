import { useFlagCount } from '../api/useFlagCount';
import { Dashboard } from '../dashboard/Dashboard';
import { webApi } from './webApi';

/** Dashboard of the web version: same UI as the desktop app, talking to the web server. */
export function WebApp(): React.JSX.Element {
  const flagCount = useFlagCount(webApi);

  return (
    <Dashboard
      state={flagCount.state}
      error={flagCount.error}
      pending={flagCount.pending}
      actions={flagCount.actions}
      onDismissError={flagCount.dismissError}
      onCopyText={webApi.copyText}
    />
  );
}
