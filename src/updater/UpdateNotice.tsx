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
        <div>
          <strong>Update {updater.update?.version} verfügbar</strong>
          {updater.update?.notes && <p>{updater.update.notes}</p>}
          {downloading && (
            <p>{updater.progress === null ? 'Update wird heruntergeladen …' : `Download: ${updater.progress} %`}</p>
          )}
        </div>
        <div className="update-actions">
          <button type="button" className="button primary" disabled={downloading} onClick={() => void updater.installUpdate()}>
            {downloading ? 'Wird installiert …' : 'Jetzt aktualisieren'}
          </button>
          {!downloading && (
            <button type="button" className="button secondary" onClick={updater.dismiss}>
              Später
            </button>
          )}
        </div>
      </section>
    );
  }

  const message =
    updater.status === 'checking'
      ? 'Updates werden gesucht …'
      : updater.status === 'up-to-date'
        ? 'FlagCount ist aktuell.'
        : 'Die Updateprüfung ist fehlgeschlagen. Bitte versuche es später erneut.';

  return (
    <p className={`update-message update-${updater.status} ${updater.status === 'error' ? 'field-error' : ''}`} role="status">
      {message}
    </p>
  );
}
