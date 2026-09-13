import { useEffect, useState } from 'react';
import type { OverlaySettings } from '../../shared/settings';
import { OverlayDesigner } from './OverlayDesigner';

type OverlayPanelProps = {
  overlayUrl: string | null;
  /** Online overlay for tools that cannot open local addresses, such as TikTok LIVE Studio. */
  publicOverlayUrl: string | null;
  settings: OverlaySettings;
  disabled: boolean;
  onCopy: (text: string) => Promise<void>;
  onChangeSettings: (overlay: OverlaySettings) => void;
  feedbackMs?: number;
};

type UrlFieldProps = {
  id: string;
  label: string;
  url: string;
  copied: boolean;
  onCopy: () => void;
};

function UrlField({ id, label, url, copied, onCopy }: UrlFieldProps): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div className="input-row">
        <input id={id} value={url} readOnly onFocus={(event) => event.currentTarget.select()} />
        <button type="button" className="button secondary" onClick={onCopy}>
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
            {copyFailed && (
              <p className="field-error" role="alert">
                Die URL konnte nicht kopiert werden. Bitte markiere sie und kopiere sie manuell.
              </p>
            )}
          </div>
        ) : (
          <p className="hint">Die Overlay-URL ist verfügbar, sobald der Verbindungsdienst läuft.</p>
        )}

        <OverlayDesigner
          settings={settings}
          previewUrl={overlayUrl}
          disabled={disabled}
          onChange={onChangeSettings}
        />
      </div>
    </section>
  );
}
