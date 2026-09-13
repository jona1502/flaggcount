import { useState, type FormEvent } from 'react';
import type { LicenseState } from '../../shared/licensing';
import { LICENSE_ERROR_MESSAGES } from './licenseMessages';
import { PRO_FEATURES } from './proFeatures';

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

type LicensePanelProps = {
  license: LicenseState;
  /** Licenses are handled by the connection service; without it nothing can be activated. */
  available: boolean;
  pending: boolean;
  onActivate: (code: string, replaceInstallationId?: string) => void;
  onRefresh: () => void;
  onDeactivate: () => void;
  onOpenPortal: () => void;
  onOpenProPage: () => void;
};

function describeStatus(license: LicenseState): { title: string; detail: string } {
  const until = formatDate(license.expiresAt);
  switch (license.status) {
    case 'active':
      return {
        title: 'FlagCount Pro ist aktiv',
        detail: until ? `Auf diesem Computer bestätigt bis ${until}. FlagCount verlängert das automatisch, solange das Abo läuft.` : ''
      };
    case 'grace':
      return {
        title: 'FlagCount Pro ist aktiv – Zahlung offen',
        detail: 'Die letzte Zahlung konnte nicht eingezogen werden. Bitte prüfe deine Zahlungsmethode unter „Abo verwalten“.'
      };
    case 'expired':
      return {
        title: 'Pro ist auf diesem Computer nicht mehr aktiv',
        detail: 'FlagCount läuft im Free-Modus weiter. Deine Profile und Designs bleiben erhalten.'
      };
    case 'invalid':
      return {
        title: 'Die Lizenz konnte nicht bestätigt werden',
        detail: 'FlagCount läuft im Free-Modus weiter. Deine Profile und Designs bleiben erhalten.'
      };
    case 'none':
      return {
        title: 'Du nutzt FlagCount Free',
        detail: 'Rote Flaggen zählen, lokales und Online-Overlay sowie der Designer bleiben dauerhaft kostenlos – ohne Konto.'
      };
  }
}

/** Status, activation and management of FlagCount Pro. Never interrupts the live view. */
export function LicensePanel({
  license,
  available,
  pending,
  onActivate,
  onRefresh,
  onDeactivate,
  onOpenPortal,
  onOpenProPage
}: LicensePanelProps): React.JSX.Element {
  const [code, setCode] = useState('');
  const [submittedCode, setSubmittedCode] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const isPro = license.plan === 'pro';
  const status = describeStatus(license);
  const disabled = !available || pending;
  const error = license.lastError && license.lastError !== 'installation-limit' ? LICENSE_ERROR_MESSAGES[license.lastError] : null;
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
    <section className="panel license-panel" aria-labelledby="license-heading">
      <h2 id="license-heading">FlagCount Pro</h2>

      <div className="license-status" data-plan={license.plan} data-status={license.status}>
        <p className="license-title">{status.title}</p>
        {status.detail && <p className="hint">{status.detail}</p>}
        {license.reference && (
          <p className="hint">
            Lizenzreferenz für den Support: <code>{license.reference}</code>
          </p>
        )}
        {isPro && license.needsRefresh && (
          <p className="hint">Die Lizenz wird erneut bestätigt, sobald FlagCount den Lizenzserver erreicht.</p>
        )}
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {!available && <p className="hint">Die Lizenzverwaltung ist verfügbar, sobald der Verbindungsdienst läuft.</p>}

      {isPro ? (
        <div className="license-actions">
          <button type="button" className="button secondary" disabled={disabled} onClick={onRefresh}>
            Lizenz aktualisieren
          </button>
          <button type="button" className="button secondary" disabled={disabled} onClick={onOpenPortal}>
            Abo verwalten
          </button>
          {confirmDeactivate ? (
            <div className="reset-confirm" role="group" aria-label="Deaktivieren bestätigen">
              <span>Pro auf diesem Computer deaktivieren?</span>
              <button
                type="button"
                className="button danger"
                disabled={disabled}
                onClick={() => {
                  setConfirmDeactivate(false);
                  onDeactivate();
                }}
              >
                Ja, deaktivieren
              </button>
              <button type="button" className="button secondary" onClick={() => setConfirmDeactivate(false)} autoFocus>
                Abbrechen
              </button>
            </div>
          ) : (
            <button type="button" className="button danger-outline" disabled={disabled} onClick={() => setConfirmDeactivate(true)}>
              Gerät deaktivieren
            </button>
          )}
        </div>
      ) : (
        <form className="license-form" onSubmit={submit} noValidate>
          <label htmlFor="activation-code">Aktivierungscode</label>
          <div className="input-row">
            <input
              id="activation-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="FC-XXXXX-XXXXX-XXXXX-XXXXX"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              disabled={disabled}
              aria-invalid={validation ? true : undefined}
              aria-describedby={validation ? 'activation-code-error' : 'activation-code-hint'}
            />
            <button type="submit" className="button primary" disabled={disabled}>
              Aktivieren
            </button>
          </div>
          {validation && (
            <p id="activation-code-error" className="field-error">
              {validation}
            </p>
          )}
          <p id="activation-code-hint" className="hint">
            Den Code bekommst du nach dem Kauf per E-Mail. Code verloren? Auf der Pro-Seite kannst du ihn neu anfordern.
          </p>
        </form>
      )}

      {showInstallations && (
        <div className="license-installations">
          <p>
            Diese Lizenz ist bereits auf {license.installations.length} Computern aktiv. Ersetze einen davon durch diesen
            Computer:
          </p>
          <ul>
            {license.installations.map((installation) => {
              const activated = formatDate(installation.activatedAt) ?? 'unbekannt';
              const seen = formatDate(installation.lastSeenAt) ?? 'unbekannt';
              return (
                <li key={installation.installationId}>
                  <span>
                    Aktiviert am {activated}, zuletzt online am {seen}
                  </span>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={disabled || !submittedCode}
                    aria-label={`Computer ersetzen, aktiviert am ${activated}, zuletzt online am ${seen}`}
                    onClick={() => onActivate(submittedCode, installation.installationId)}
                  >
                    Ersetzen
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!isPro && (
        <div className="pro-offer">
          <h3>Was Pro zusätzlich bietet</h3>
          <ul className="pro-features">
            {PRO_FEATURES.map((description) => (
              <li key={description.feature}>
                <strong>{description.title}</strong>
                <span>{description.benefit}</span>
              </li>
            ))}
          </ul>
          <p className="hint">
            Preis, Abrechnungszeitraum, automatische Verlängerung und Kündigung siehst du vor dem Kauf auf der Pro-Seite.
            FlagCount Free bleibt ohne Konto und ohne Kauf nutzbar.
          </p>
          <button type="button" className="button primary" onClick={onOpenProPage}>
            Preise & Pro ansehen
          </button>
        </div>
      )}
    </section>
  );
}
