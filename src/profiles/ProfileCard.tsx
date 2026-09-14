import { useState, type FormEvent } from 'react';
import { MAX_NAME_LENGTH, type StreamProfile } from '../../shared/profiles';
import { Badge, Button, ConfirmDialog, Field, IconDuplicate, IconEdit, IconTrash, Input } from '../components/ui';

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

type ProfileCardProps = {
  profile: StreamProfile;
  /** The profile whose counters run right now. */
  running: boolean;
  /** Chosen by the streamer; after a downgrade the running profile can be a different one. */
  chosen: boolean;
  /** Covered by the plan; profiles beyond the limit stay stored but inactive. */
  usable: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  disabled: boolean;
  onSwitch: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function ProfileCard({
  profile,
  running,
  chosen,
  usable,
  canDuplicate,
  canDelete,
  disabled,
  onSwitch,
  onRename,
  onDuplicate,
  onDelete
}: ProfileCardProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [validation, setValidation] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'switch' | 'delete' | null>(null);
  const counters = profile.counters;
  const updated = new Date(profile.updatedAt);

  const rename = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setValidation('Bitte gib dem Profil einen Namen.');
      return;
    }
    setValidation(null);
    setEditing(false);
    if (trimmed !== profile.name) onRename(trimmed);
  };

  return (
    <li className="profile-card" data-running={running} data-usable={usable}>
      <div className="profile-card-head">
        {editing ? (
          <form className="profile-rename" onSubmit={rename} noValidate>
            <Field id={`profile-name-${profile.id}`} label={<span className="visually-hidden">Neuer Name für {profile.name}</span>} error={validation}>
              <Input value={name} maxLength={MAX_NAME_LENGTH} autoFocus onChange={(event) => setName(event.target.value)} />
            </Field>
            <Button type="submit" variant="primary" size="sm" disabled={disabled}>
              Speichern
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setValidation(null);
              }}
            >
              Abbrechen
            </Button>
          </form>
        ) : (
          <h2 className="profile-card-title">{profile.name}</h2>
        )}
        <div className="profile-card-badges">
          {running && <Badge tone="success">Läuft</Badge>}
          {chosen && !running && <Badge tone="warning">Gewählt</Badge>}
          {!usable && (
            <Badge tone="pro" srLabel="Nutzbar mit FlagCount Pro">
              Pro
            </Badge>
          )}
        </div>
      </div>

      <p className="profile-card-meta">
        {counters.length} {counters.length === 1 ? 'Element' : 'Elemente'}: {counters.map((counter) => counter.name).join(', ')}
      </p>
      {!Number.isNaN(updated.getTime()) && <p className="profile-card-date">Geändert am {dateFormat.format(updated)}</p>}
      {!usable && <p className="profile-card-note">Bleibt gespeichert und ist wieder nutzbar, sobald FlagCount Pro aktiv ist.</p>}

      {!editing && (
        <div className="profile-card-actions">
          {!running && usable && (
            <Button size="sm" variant="primary" disabled={disabled} aria-label={`Zu ${profile.name} wechseln`} onClick={() => setConfirm('switch')}>
              Wechseln
            </Button>
          )}
          {usable && (
            <Button
              size="sm"
              icon={IconEdit}
              disabled={disabled}
              aria-label={`${profile.name} umbenennen`}
              onClick={() => {
                setName(profile.name);
                setEditing(true);
              }}
            >
              Umbenennen
            </Button>
          )}
          {usable && canDuplicate && (
            <Button size="sm" icon={IconDuplicate} disabled={disabled} aria-label={`${profile.name} duplizieren`} onClick={onDuplicate}>
              Duplizieren
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="danger-outline" icon={IconTrash} disabled={disabled} aria-label={`${profile.name} löschen`} onClick={() => setConfirm('delete')}>
              Löschen
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'switch'}
        title={`Zu „${profile.name}“ wechseln?`}
        message="Laufende Runden werden beim Wechsel beendet. Danach laufen die Zähler und Abstimmungen dieses Profils."
        confirmLabel="Ja, wechseln"
        tone="primary"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          onSwitch();
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title={`„${profile.name}“ löschen?`}
        message="Das Profil wird mit seinen Zählern, Abstimmungen und Overlay-Designs endgültig gelöscht."
        confirmLabel="Ja, löschen"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          onDelete();
        }}
      />
    </li>
  );
}
