import { useEffect, useState } from 'react';
import type { OverlaySettings } from '../../shared/settings';
import { OverlayDesigner } from './OverlayDesigner';

export type CounterOverlays = {
  counters: { counterId: string; name: string }[];
  /** Online URL per counter id and `all` for the overview, while Pro is active. */
  onlineUrls: Record<string, string>;
  /** How many counters get their own overlay under the current plan. */
  allowedCounters: number;
  overviewAllowed: boolean;
};

type OverlayPanelProps = {
  overlayUrl: string | null;
  /** Online overlay for tools that cannot open local addresses, such as TikTok LIVE Studio. */
  publicOverlayUrl: string | null;
  settings: OverlaySettings;
  disabled: boolean;
  onCopy: (text: string) => Promise<void>;
  onChangeSettings: (overlay: OverlaySettings) => void;
  /** Overlays per counter and the overview; only the desktop app has them. */
  counterOverlays?: CounterOverlays;
  premiumThemesAllowed?: boolean;
  onImportAsset?: (kind: 'logo' | 'background', bytes: number[]) => Promise<string>;
  feedbackMs?: number;
};

type UrlFieldProps = {
  id: string;
  label: string;
  url: string;
  copied: boolean;
  onCopy: () => void;
  /** Distinct button names when several URLs are listed. */
  copyLabel?: string;
};

function UrlField({ id, label, url, copied, onCopy, copyLabel }: UrlFieldProps): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div className="input-row">
        <input id={id} value={url} readOnly onFocus={(event) => event.currentTarget.select()} />
        <button type="button" className="button secondary" onClick={onCopy} aria-label={copyLabel}>
          {copied ? 'Kopiert!' : 'URL kopieren'}
        </button>
      </div>
    </div>
  );
}

export function OverlayPanel({
  overlayUrl,
  publicOverlayUrl,
  settings,
  disabled,
  onCopy,
  onChangeSettings,
  counterOverlays,
  premiumThemesAllowed = false,
  onImportAsset,
  feedbackMs = 2000
}: OverlayPanelProps): React.JSX.Element {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (copied === null) return;
    const timeout = setTimeout(() => setCopied(null), feedbackMs);
    return () => clearTimeout(timeout);
  }, [copied, feedbackMs]);

  const copy = async (url: string): Promise<void> => {
    try {
      await onCopy(url);
      setCopyFailed(false);
      setCopied(url);
    } catch {
      setCopied(null);
      setCopyFailed(true);
    }
  };

  const urlField = (id: string, label: string, url: string): React.JSX.Element => (
    <UrlField id={id} label={label} url={url} copied={copied === url} onCopy={() => void copy(url)} copyLabel={`${label} kopieren`} />
  );

  const showCounterOverlays =
    overlayUrl !== null && counterOverlays !== undefined && (counterOverlays.counters.length > 1 || counterOverlays.overviewAllowed);

  return (
    <section className="panel overlay-panel" aria-labelledby="overlay-heading">
      <h2 id="overlay-heading">Streaming-Overlay</h2>
      <div className="overlay-content">
        {overlayUrl ? (
          <div className="overlay-links">
            {publicOverlayUrl && (
              <UrlField
                id="overlay-public-url"
                label="Online-URL für TikTok LIVE Studio und OBS"
                url={publicOverlayUrl}
                copied={copied === publicOverlayUrl}
                onCopy={() => void copy(publicOverlayUrl)}
              />
            )}
            <UrlField
              id="overlay-url"
              label={publicOverlayUrl ? 'Lokale URL (nur für OBS auf diesem PC)' : 'Als Browser- oder Link-Quelle hinzufügen'}
              url={overlayUrl}
              copied={copied === overlayUrl}
              onCopy={() => void copy(overlayUrl)}
            />

            {showCounterOverlays && counterOverlays && (
              <details className="counter-overlays" open>
                <summary>Overlays je Zähler</summary>
                <ul>
                  {counterOverlays.counters.map((counter, index) => {
                    const online = counterOverlays.onlineUrls[counter.counterId];
                    return (
                      <li key={counter.counterId}>
                        <strong>{counter.name}</strong>
                        {index < counterOverlays.allowedCounters ? (
                          <>
                            {urlField(`overlay-local-${counter.counterId}`, `Lokale URL für ${counter.name}`, `${overlayUrl}/counter/${counter.counterId}`)}
                            {online && urlField(`overlay-online-${counter.counterId}`, `Online-URL für ${counter.name}`, online)}
                          </>
                        ) : (
                          <span className="pro-tag">Pro</span>
                        )}
                      </li>
                    );
                  })}
                  {counterOverlays.overviewAllowed && (
                    <li>
                      <strong>Übersicht aller Zähler</strong>
                      {urlField('overlay-local-all', 'Lokale URL der Übersicht', `${overlayUrl}/all`)}
                      {counterOverlays.onlineUrls['all'] &&
                        urlField('overlay-online-all', 'Online-URL der Übersicht', counterOverlays.onlineUrls['all'])}
                    </li>
                  )}
                </ul>
              </details>
            )}
            {counterOverlays && !counterOverlays.overviewAllowed && (
              <p className="hint">
                <span className="pro-tag">Pro</span> Mit FlagCount Pro bekommt jeder Zähler ein eigenes Overlay, dazu eine Übersicht
                aller Zähler.
              </p>
            )}

            {copyFailed && (
              <p className="field-error" role="alert">
                Die URL konnte nicht kopiert werden. Bitte markiere sie und kopiere sie manuell.
              </p>
            )}
          </div>
        ) : (
          <p className="hint">Die Overlay-URL ist verfügbar, sobald der Verbindungsdienst läuft.</p>
        )}

        <OverlayDesigner settings={settings} previewUrl={overlayUrl} disabled={disabled} onChange={onChangeSettings} premiumThemesAllowed={premiumThemesAllowed} onImportAsset={onImportAsset} />
      </div>
    </section>
  );
}
