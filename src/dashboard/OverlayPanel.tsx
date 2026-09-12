import { useEffect, useState } from 'react';

type OverlayPanelProps = {
  overlayUrl: string | null;
  onCopy: (text: string) => Promise<void>;
  feedbackMs?: number;
};

export function OverlayPanel({ overlayUrl, onCopy, feedbackMs = 2000 }: OverlayPanelProps): React.JSX.Element {
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
      <h2 id="overlay-heading">OBS-Overlay</h2>
      {overlayUrl ? (
        <>
          <label htmlFor="overlay-url">Als Browserquelle in OBS hinzufügen</label>
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
    </section>
  );
}
