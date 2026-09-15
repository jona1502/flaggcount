import { Button, IconDownload } from '../components/ui';
import type { UpdaterController } from './useUpdater';

type UpdateNoticeProps = {
  updater: UpdaterController;
};

export function UpdateNotice({ updater }: UpdateNoticeProps): React.JSX.Element | null {
  if (updater.status === 'idle') return null;

  if (updater.status === 'available' || updater.status === 'downloading') {
    const downloading = updater.status === 'downloading';
    return (
      <section className="update-notice" aria-live="polite">
        <IconDownload className="update-notice-icon" />
        <div className="update-notice-body">
          <strong>Update {updater.update?.version} verfügbar</strong>
          {updater.update?.notes && <p>{updater.update.notes}</p>}
          {downloading && (
            <>
              <p>{updater.progress === null ? 'Update wird heruntergeladen …' : `Download: ${updater.progress} %`}</p>
              {updater.progress !== null && (
                <div className="update-notice-bar" aria-hidden="true">
                  <div style={{ width: `${updater.progress}%` }} />
                </div>
              )}
            </>
          )}
        </div>
        <div className="update-actions">
          <Button variant="primary" size="sm" disabled={downloading} onClick={() => void updater.installUpdate()}>
            {downloading ? 'Wird installiert …' : 'Jetzt aktualisieren'}
          </Button>
          {!downloading && (
            <Button variant="ghost" size="sm" onClick={updater.dismiss}>
              Später
            </Button>
          )}
        </div>
      </section>
    );
  }

  const message =
    updater.status === 'checking'
      ? 'Updates werden gesucht …'
      : updater.status === 'up-to-date'
        ? 'Audience Live ist aktuell.'
        : 'Die Updateprüfung ist fehlgeschlagen. Bitte versuche es später erneut.';

  return (
    <p className={`update-message update-${updater.status}`} role="status">
      {message}
    </p>
  );
}
