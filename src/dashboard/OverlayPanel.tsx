import { useEffect, useState } from 'react';
import type { OverlaySettings } from '../../shared/settings';

type OverlayPanelProps = {
  overlayUrl: string | null;
  settings: OverlaySettings;
  disabled: boolean;
  onCopy: (text: string) => Promise<void>;
  onChangeSettings: (overlay: OverlaySettings) => void;
  feedbackMs?: number;
};

export function OverlayPanel({
  overlayUrl,
  settings,
  disabled,
  onCopy,
  onChangeSettings,
  feedbackMs = 2000
}: OverlayPanelProps): React.JSX.Element {
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);

  useEffect(() => {
    if (feedback !== 'copied') return;
    const timeout = setTimeout(() => setFeedback(null), feedbackMs);
    return () => clearTimeout(timeout);
  }, [feedback, feedbackMs]);

  const copy = async (url: string): Promise<void> => {
    try {
      await onCopy(url);
      setFeedback('copied');
    } catch {
      setFeedback('failed');
    }
  };

  return (
    <section className="panel" aria-labelledby="overlay-heading">
      <h2 id="overlay-heading">Streaming-Overlay</h2>
      {overlayUrl ? (
        <>
          <label htmlFor="overlay-url">Als Browser- oder Link-Quelle hinzufügen</label>
          <div className="input-row">
            <input id="overlay-url" value={overlayUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
            <button type="button" className="button secondary" onClick={() => void copy(overlayUrl)}>
              {feedback === 'copied' ? 'Kopiert!' : 'URL kopieren'}
            </button>
          </div>
          {feedback === 'failed' && (
            <p className="field-error" role="alert">
              Die URL konnte nicht kopiert werden. Bitte markiere sie und kopiere sie manuell.
            </p>
          )}
        </>
      ) : (
        <p className="hint">Die Overlay-URL ist verfügbar, sobald der Verbindungsdienst läuft.</p>
      )}

      <fieldset className="overlay-options" disabled={disabled}>
        <legend>Darstellung</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.showBackground}
            disabled={disabled}
            onChange={(event) => onChangeSettings({ ...settings, showBackground: event.target.checked })}
          />
          Hintergrund anzeigen
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.showProgress}
            disabled={disabled}
            onChange={(event) => onChangeSettings({ ...settings, showProgress: event.target.checked })}
          />
          Fortschrittsbalken anzeigen
        </label>
      </fieldset>
    </section>
  );
}
