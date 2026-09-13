import { useEffect, useState } from 'react';

type ResetControlProps = {
  disabled: boolean;
  onReset: () => void;
  confirmTimeoutMs?: number;
  /** Distinct texts keep several reset buttons apart, also for screen readers. */
  label?: string;
  question?: string;
  confirmLabel?: string;
};

/** Two-step reset: the round is only cleared after an explicit confirmation. */
export function ResetControl({
  disabled,
  onReset,
  confirmTimeoutMs = 5000,
  label = 'Runde zurücksetzen',
  question = 'Alle Stimmen dieser Runde löschen?',
  confirmLabel = 'Ja, zurücksetzen'
}: ResetControlProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timeout = setTimeout(() => setConfirming(false), confirmTimeoutMs);
    return () => clearTimeout(timeout);
  }, [confirming, confirmTimeoutMs]);

  if (!confirming) {
    return (
      <button type="button" className="button danger-outline" disabled={disabled} onClick={() => setConfirming(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="reset-confirm" role="group" aria-label={label === 'Runde zurücksetzen' ? 'Zurücksetzen bestätigen' : `${label} bestätigen`}>
      <span>{question}</span>
      <button
        type="button"
        className="button danger"
        disabled={disabled}
        onClick={() => {
          setConfirming(false);
          onReset();
        }}
      >
        {confirmLabel}
      </button>
      {/* Focus lands on "Abbrechen" so a repeated Enter/Space press cannot confirm by accident. */}
      <button type="button" className="button secondary" onClick={() => setConfirming(false)} autoFocus>
        Abbrechen
      </button>
    </div>
  );
}
