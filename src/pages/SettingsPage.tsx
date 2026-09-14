import { PageHeader } from '../app-shell/PageHeader';
import { Button, Card, IconLogout, IconMail, IconRefresh } from '../components/ui';
import { UpdateNotice } from '../updater/UpdateNotice';
import type { UpdaterController } from '../updater/useUpdater';
import type { PageProps } from './types';

type SettingsPageProps = Pick<PageProps, 'desktop'> & {
  updater?: UpdaterController;
  version?: string | null;
  onLogout?: () => void;
};

export function SettingsPage({ desktop, updater, version, onLogout }: SettingsPageProps): React.JSX.Element {
  // Available updates are shown globally above every page; here only the result of a manual check.
  const checkResult = updater && (updater.status === 'checking' || updater.status === 'up-to-date' || updater.status === 'error');
  return (
    <div className="page">
      <PageHeader title="Einstellungen" description="App-Version, Updates und Hilfe." />
      <div className="page-grid">
        <Card title="App & Updates" description="FlagCount sucht beim Start automatisch nach Updates.">
          <dl className="detail-list">
            <div>
              <dt>Installierte Version</dt>
              <dd>{version ?? 'unbekannt'}</dd>
            </div>
          </dl>
          {updater && (
            <div className="card-row">
              <Button
                icon={IconRefresh}
                loading={updater.status === 'checking'}
                disabled={updater.status === 'downloading'}
                onClick={() => void updater.checkForUpdates()}
              >
                Nach Updates suchen
              </Button>
            </div>
          )}
          {checkResult && <UpdateNotice updater={updater} />}
        </Card>

        {desktop && (
          <Card title="Hilfe & Support" description="Fragen zu FlagCount, Overlays oder deiner Lizenz.">
            <p className="card-text">Schreib uns eine E-Mail. Logs, Chatinhalte oder Zuschauernamen werden dabei nie automatisch gesendet.</p>
            <div className="card-row">
              <a className="ui-button ui-button--secondary ui-button--md" href="mailto:support@flagcount.app?subject=FlagCount%20Support">
                <IconMail size={16} />
                <span className="ui-button-label">Support kontaktieren</span>
              </a>
            </div>
          </Card>
        )}

        {onLogout && (
          <Card title="Sitzung" description="Meldet dieses Browserfenster vom Web-Dashboard ab.">
            <div className="card-row">
              <Button icon={IconLogout} onClick={onLogout}>
                Abmelden
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
