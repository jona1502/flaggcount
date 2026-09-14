import { useState, type FormEvent } from 'react';
import type { LicenseState } from '../../shared/licensing';
import { Button, Callout, Field, Input } from '../components/ui';
import { formatDate } from './licenseStatus';

type LicenseActivationProps = {
  license: LicenseState;
  disabled: boolean;
  onActivate: (code: string, replaceInstallationId?: string) => void;
};

/** Activation with a code from the purchase email, including replacing another computer at the installation limit. */
export function LicenseActivation({ license, disabled, onActivate }: LicenseActivationProps): React.JSX.Element {
  const [code, setCode] = useState('');
  const [submittedCode, setSubmittedCode] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const showInstallations = license.lastError === 'installation-limit' && license.installations.length > 0;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setValidation('Bitte gib deinen Aktivierungscode ein.');
      return;
    }
    setValidation(null);
    setSubmittedCode(trimmed);
    onActivate(trimmed);
  };

  return (
    <div className="license-activation">
      <form className="license-form" onSubmit={submit} noValidate>
        <Field
          id="activation-code"
          label="Aktivierungscode"
          hint="Den Code bekommst du nach dem Kauf per E-Mail. Code verloren? Auf der Pro-Seite kannst du ihn neu anfordern."
          error={validation}
        >
          <Input
            value={code}
            placeholder="FC-XXXXX-XXXXX-XXXXX-XXXXX"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            disabled={disabled}
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={disabled}>
          Aktivieren
        </Button>
      </form>

      {showInstallations && (
        <Callout tone="warning" title={`Diese Lizenz ist bereits auf ${license.installations.length} Computern aktiv`}>
          <p>Ersetze einen davon durch diesen Computer:</p>
          <ul className="license-installations">
            {license.installations.map((installation) => {
              const activated = formatDate(installation.activatedAt) ?? 'unbekannt';
              const seen = formatDate(installation.lastSeenAt) ?? 'unbekannt';
              return (
                <li key={installation.installationId}>
                  <span>
                    Aktiviert am {activated}, zuletzt online am {seen}
                  </span>
                  <Button
                    size="sm"
                    disabled={disabled || !submittedCode}
                    aria-label={`Computer ersetzen, aktiviert am ${activated}, zuletzt online am ${seen}`}
                    onClick={() => onActivate(submittedCode, installation.installationId)}
                  >
                    Ersetzen
                  </Button>
                </li>
              );
            })}
          </ul>
        </Callout>
      )}
    </div>
  );
}
