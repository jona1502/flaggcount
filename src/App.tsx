import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { flagcountApi } from './api/flagcount';
import { useFlagCount } from './api/useFlagCount';
import { Dashboard } from './dashboard/Dashboard';

export function App(): React.JSX.Element {
  const flagCount = useFlagCount();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    // Outside of the Tauri window (plain browser) the IPC bridge is missing.
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  return (
    <Dashboard
      state={flagCount.state}
      error={flagCount.error}
      pending={flagCount.pending}
      actions={flagCount.actions}
      onDismissError={flagCount.dismissError}
      onCopyText={flagcountApi.copyText}
      version={version}
    />
  );
}
