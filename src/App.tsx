import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { flagcountApi } from './api/flagcount';
import { useFlagCount } from './api/useFlagCount';
import { Dashboard } from './dashboard/Dashboard';
import { updaterClient, type UpdaterClient } from './updater/updaterClient';
import { useUpdater } from './updater/useUpdater';

type AppProps = {
  updateClient?: UpdaterClient;
  autoCheckUpdates?: boolean;
};

export function App({ updateClient = updaterClient, autoCheckUpdates }: AppProps = {}): React.JSX.Element {
  const flagCount = useFlagCount(flagcountApi);
  const updater = useUpdater({ client: updateClient, autoCheck: autoCheckUpdates });
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
      updater={updater}
      proAvailable
    />
  );
}
