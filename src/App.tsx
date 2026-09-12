import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';

export function App(): React.JSX.Element {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    // Outside of the Tauri window (plain browser) the IPC bridge is missing.
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  return (
    <main className="app">
      <h1>
        <span aria-hidden="true">🚩</span> FlagCount
      </h1>
      <p>Zählt rote Flaggen im TikTok-Live-Chat.</p>
      {version && <p className="version">Version {version}</p>}
    </main>
  );
}
