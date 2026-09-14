import { useEffect, useState } from 'react';
import { Button, Field, IconCheck, IconCopy, Input } from '../components/ui';

type OverlayUrlFieldProps = {
  id: string;
  label: string;
  hint?: string;
  url: string | null;
  /** Why there is no URL right now. */
  unavailableText: string;
  /** Resolves `false` if the clipboard refused the text. */
  onCopy: (url: string) => Promise<boolean>;
  feedbackMs?: number;
};

/** A read-only URL with a one-click copy and a manual fallback if the clipboard fails. */
export function OverlayUrlField({ id, label, hint, url, unavailableText, onCopy, feedbackMs = 2000 }: OverlayUrlFieldProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), feedbackMs);
    return () => clearTimeout(timeout);
  }, [copied, feedbackMs]);

  if (!url) {
    return (
      <div className="overlay-url is-unavailable">
        <p className="ui-field-label">{label}</p>
        <p className="overlay-url-missing">{unavailableText}</p>
      </div>
    );
  }

  const copy = async (): Promise<void> => {
    const ok = await onCopy(url);
    setFailed(!ok);
    setCopied(ok);
  };

  return (
    <div className="overlay-url">
      <Field id={id} label={label} hint={hint} error={failed ? 'Die URL konnte nicht kopiert werden. Bitte markiere sie und kopiere sie manuell.' : null}>
        <Input value={url} readOnly onFocus={(event) => event.currentTarget.select()} />
      </Field>
      <Button variant={copied ? 'secondary' : 'primary'} icon={copied ? IconCheck : IconCopy} aria-label={`${label} kopieren`} onClick={() => void copy()}>
        {copied ? 'Kopiert' : 'Kopieren'}
      </Button>
    </div>
  );
}
