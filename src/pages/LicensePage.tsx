import { useEffect, useRef, useState } from 'react';
import { missingProFeatures } from '../../shared/entitlements';
import { PageHeader } from '../app-shell/PageHeader';
import {
  Badge,
  Button,
  Callout,
  Card,
  ConfirmDialog,
  IconExternal,
  IconMail,
  IconOverlays,
  IconPoll,
  IconRefresh,
  useToast
} from '../components/ui';
import { FeatureMatrix, LimitsTable } from '../license/FeatureMatrix';
import { LicenseActivation } from '../license/LicenseActivation';
import { describeLicense, formatDate } from '../license/licenseStatus';
import { describeFeature } from '../pro/proFeatures';
import { LICENSE_ERROR_MESSAGES } from '../pro/licenseMessages';
import type { PageProps } from './types';

/** Plan, status, unlocked features, limits, activation and subscription management. */
export function LicensePage({ model, pending, error, actions, navigate }: PageProps): React.JSX.Element {
  const { state, entitlements, isPro } = model;
  const { license } = state;
  const status = describeLicense(license);
  const missing = missingProFeatures(license.plan, license.features);
  const disabled = !state.sidecarRunning || pending;
  const licenseError = license.lastError && license.lastError !== 'installation-limit' ? LICENSE_ERROR_MESSAGES[license.lastError] : null;
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const toast = useToast();

  // A new license arrives as a state event; everything unlocks right away, without a restart.
  const previousPlan = useRef(license.plan);
  useEffect(() => {
    if (previousPlan.current === license.plan) return;
    previousPlan.current = license.plan;
    setUnlocked(license.plan === 'pro');
    if (license.plan === 'pro') toast({ title: 'FlagCount Pro ist aktiv', description: 'Alle Pro-Funktionen sind ohne Neustart freigeschaltet.' });
  }, [license.plan, toast]);

  // A refresh is confirmed when it finished without an error.
  const refreshing = useRef(false);
  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending && refreshing.current) {
      refreshing.current = false;
      if (!error) toast({ title: 'Lizenzstatus aktualisiert' });
    }
    wasPending.current = pending;
  }, [pending, error, toast]);

  const refresh = (): void => {
    refreshing.current = true;
    void actions.refreshLicense();
  };

  const supportHref = `mailto:support@flagcount.app?subject=${encodeURIComponent('FlagCount Pro Support')}&body=${encodeURIComponent(
    `Hallo FlagCount-Team,\n\nBitte helft mir bei folgendem Anliegen:\n\n\nLizenzreferenz: ${license.reference ?? 'keine'}\nPlan: ${license.plan}\nStatus: ${license.status}\n\nIch habe keine Logs angehängt.`
  )}`;
  const nextCheck = isPro ? formatDate(license.refreshAfter) : null;
  const validUntil = isPro ? formatDate(license.expiresAt) : null;

  return (
    <div className="page license-page">
      <PageHeader
        title="Lizenz & Konto"
        badge={<Badge tone={isPro ? 'pro' : 'neutral'}>{isPro ? 'FlagCount Pro' : 'FlagCount Free'}</Badge>}
        description="Tarif, freigeschaltete Funktionen, Aktivierung und Abo-Verwaltung."
        actions={
          (isPro || license.reference) && (
            <Button icon={IconRefresh} loading={pending && refreshing.current} disabled={disabled} onClick={refresh}>
              Lizenzstatus aktualisieren
            </Button>
          )
        }
      />

      {unlocked && (
        <Callout
          tone="success"
          title="Pro ist freigeschaltet"
          actions={
            <>
              <Button size="sm" icon={IconPoll} onClick={() => navigate({ page: 'counters', create: true })}>
                Abstimmung erstellen
              </Button>
              <Button size="sm" icon={IconOverlays} onClick={() => navigate({ page: 'overlays' })}>
                Overlays einrichten
              </Button>
            </>
          }
        >
          Abstimmungen, parallele Zähler, Profile, Historie und Premium-Overlays stehen sofort bereit.
        </Callout>
      )}

      {missing.length > 0 && (
        <Callout
          tone="warning"
          title="Pro-Funktionen fehlen"
          actions={
            <>
              <Button size="sm" icon={IconRefresh} disabled={disabled} onClick={refresh}>
                Erneut prüfen
              </Button>
              <a className="ui-button ui-button--ghost ui-button--sm" href={supportHref}>
                <IconMail size={14} />
                <span className="ui-button-label">Support kontaktieren</span>
              </a>
            </>
          }
        >
          <p>Deine Lizenz meldet FlagCount Pro, diese Funktionen sind aber nicht freigegeben:</p>
          <ul>
            {missing.map((feature) => (
              <li key={feature}>{describeFeature(feature).title}</li>
            ))}
          </ul>
          <p>Du musst nichts nachkaufen. Prüfe den Lizenzstatus erneut; bleibt es dabei, hilft der Support mit deiner Lizenzreferenz.</p>
        </Callout>
      )}

      {licenseError && (
        <Callout tone="danger" role="alert" title="Hinweis zur Lizenz">
          {licenseError}
        </Callout>
      )}
      {!state.sidecarRunning && (
        <Callout tone="info" title="Lizenzverwaltung noch nicht bereit">
          Die Lizenzverwaltung ist verfügbar, sobald der Verbindungsdienst läuft.
        </Callout>
      )}

      <div className="license-grid">
        <Card title="Status" className="license-status-card" actions={<Badge tone={status.badge.tone}>{status.badge.label}</Badge>}>
          <p className="license-title">{status.title}</p>
          {status.detail && <p className="card-text">{status.detail}</p>}
          <dl className="detail-list">
            <div>
              <dt>Tarif</dt>
              <dd>{isPro ? 'FlagCount Pro' : 'FlagCount Free'}</dd>
            </div>
            {license.reference && (
              <div>
                <dt>Lizenzreferenz für den Support</dt>
                <dd>
                  <code>{license.reference}</code>
                </dd>
              </div>
            )}
            {nextCheck && (
              <div>
                <dt>Nächste Online-Prüfung</dt>
                <dd>{nextCheck}</dd>
              </div>
            )}
            {validUntil && (
              <div>
                <dt>Offline gültig bis</dt>
                <dd>{validUntil}</dd>
              </div>
            )}
          </dl>
          {isPro && license.needsRefresh && <p className="card-text">Die Lizenz wird erneut bestätigt, sobald FlagCount den Lizenzserver erreicht.</p>}

          {isPro ? (
            <>
              <div className="card-row">
                <Button icon={IconExternal} disabled={disabled} onClick={() => void actions.openCustomerPortal()}>
                  Abo verwalten
                </Button>
                <Button variant="danger-outline" disabled={disabled} onClick={() => setConfirmDeactivate(true)}>
                  Gerät deaktivieren
                </Button>
              </div>
              <div className="license-support">
                <a className="ui-button ui-button--secondary ui-button--sm" href={supportHref}>
                  <IconMail size={14} />
                  <span className="ui-button-label">Priorisierten Support kontaktieren</span>
                </a>
                <span className="ui-field-hint">Die E-Mail enthält nur Status und Lizenzreferenz; Logs werden nicht automatisch gesendet.</span>
              </div>
            </>
          ) : (
            <LicenseActivation
              license={license}
              disabled={disabled}
              onActivate={(code, replaceInstallationId) => void actions.activateLicense(code, replaceInstallationId)}
            />
          )}
        </Card>

        <Card title="Funktionen" description={isPro ? 'Was deine Lizenz freischaltet.' : 'Was FlagCount Pro zusätzlich bietet.'}>
          <FeatureMatrix entitlements={entitlements} />
          {!isPro && (
            <>
              <p className="card-text">
                Preis, Abrechnungszeitraum, automatische Verlängerung und Kündigung siehst du vor dem Kauf auf der Pro-Seite. FlagCount Free bleibt
                ohne Konto und ohne Kauf nutzbar.
              </p>
              <div className="card-row">
                <Button variant="primary" onClick={() => void actions.openProPage()}>
                  Preise & Pro ansehen
                </Button>
              </div>
            </>
          )}
        </Card>

        <Card title="Grenzen deines Tarifs" className="license-limits-card">
          <LimitsTable entitlements={entitlements} />
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDeactivate}
        title="Pro auf diesem Computer deaktivieren?"
        message="FlagCount läuft danach im Free-Modus weiter. Profile, Zähler und Designs bleiben erhalten, und du kannst diesen Computer später mit deinem Code wieder aktivieren."
        confirmLabel="Ja, deaktivieren"
        onCancel={() => setConfirmDeactivate(false)}
        onConfirm={() => {
          setConfirmDeactivate(false);
          void actions.deactivateLicense();
        }}
      />
    </div>
  );
}
