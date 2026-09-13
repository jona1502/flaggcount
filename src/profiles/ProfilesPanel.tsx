import { useState, type FormEvent } from 'react';
import { entitlementsFor, limitFor } from '../../shared/entitlements';
import type { LicenseState } from '../../shared/licensing';
import { MAX_NAME_LENGTH, type Settings } from '../../shared/profiles';

type ProfilesPanelProps = {
  settings: Settings;
  license: LicenseState;
  disabled: boolean;
  onCreate: (name: string) => void;
  onDuplicate: (profileId: string) => void;
  onRename: (profileId: string, name: string) => void;
  onDelete: (profileId: string) => void;
  onSwitch: (profileId: string) => void;
  onShowPro: () => void;
};

type Confirmation = { kind: 'switch' | 'delete'; profileId: string } | null;

/** Saved stream formats. Profiles beyond the plan's limit stay stored but inactive. */
export function ProfilesPanel({
  settings,
  license,
  disabled,
  onCreate,
  onDuplicate,
  onRename,
  onDelete,
  onSwitch,
  onShowPro
}: ProfilesPanelProps): React.JSX.Element {
  const [newName, setNewName] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ profileId: string; name: string } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);

  const limit = limitFor(entitlementsFor(license.plan, license.features), 'profiles');
  const count = settings.profiles.length;
  const canAdd = count < limit;
  const hasInactive = count > limit;

  const create = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      setValidation('Bitte gib dem Profil einen Namen.');
      return;
    }
    setValidation(null);
    setNewName('');
    onCreate(name);
  };

  const rename = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!editing || !editing.name.trim()) return;
    onRename(editing.profileId, editing.name.trim());
    setEditing(null);
  };

  return (
    <section className="panel profiles-panel" aria-labelledby="profiles-heading">
      <div className="panel-heading">
        <h2 id="profiles-heading">Stream-Profile</h2>
        <span className="limit-note">
          {count} von {limit} {limit === 1 ? 'Profil' : 'Profilen'}
        </span>
      </div>
      <p className="hint">Ein Profil speichert Zähler, Ziele und Overlay-Design für ein Stream-Format.</p>

      <ul className="profile-list">
        {settings.profiles.map((profile, index) => {
          const active = profile.id === settings.activeProfileId;
          const usable = index < limit;
          const confirming = confirmation?.profileId === profile.id ? confirmation.kind : null;
          return (
            <li key={profile.id} className="profile-item" data-active={active} data-usable={usable}>
              {editing?.profileId === profile.id ? (
                <form className="input-row" onSubmit={rename}>
                  <label htmlFor={`profile-name-${profile.id}`} className="visually-hidden">
                    Neuer Name für {profile.name}
                  </label>
                  <input
                    id={`profile-name-${profile.id}`}
                    value={editing.name}
                    maxLength={MAX_NAME_LENGTH}
                    onChange={(event) => setEditing({ profileId: profile.id, name: event.target.value })}
                    autoFocus
                  />
                  <button type="submit" className="button primary" disabled={disabled || !editing.name.trim()}>
                    Speichern
                  </button>
                  <button type="button" className="button secondary" onClick={() => setEditing(null)}>
                    Abbrechen
                  </button>
                </form>
              ) : (
                <div className="profile-name">
                  <strong>{profile.name}</strong>
                  {active && <span className="plan-badge">aktiv</span>}
                  {!usable && (
                    <span className="pro-tag" title="Nutzbar mit FlagCount Pro">
                      Pro
                    </span>
                  )}
                  <span className="hint">
                    {profile.counters.length} {profile.counters.length === 1 ? 'Zähler' : 'Zähler parallel'}
                  </span>
                </div>
              )}

              {confirming === 'switch' ? (
                <div className="reset-confirm" role="group" aria-label={`Wechsel zu ${profile.name} bestätigen`}>
                  <span>Laufende Runden werden beim Wechsel beendet.</span>
                  <button
                    type="button"
                    className="button danger"
                    disabled={disabled}
                    onClick={() => {
                      setConfirmation(null);
                      onSwitch(profile.id);
                    }}
                  >
                    Ja, wechseln
                  </button>
                  <button type="button" className="button secondary" onClick={() => setConfirmation(null)} autoFocus>
                    Abbrechen
                  </button>
                </div>
              ) : confirming === 'delete' ? (
                <div className="reset-confirm" role="group" aria-label={`Löschen von ${profile.name} bestätigen`}>
                  <span>Profil „{profile.name}“ endgültig löschen?</span>
                  <button
                    type="button"
                    className="button danger"
                    disabled={disabled}
                    onClick={() => {
                      setConfirmation(null);
                      onDelete(profile.id);
                    }}
                  >
                    Ja, löschen
                  </button>
                  <button type="button" className="button secondary" onClick={() => setConfirmation(null)} autoFocus>
                    Abbrechen
                  </button>
                </div>
              ) : (
                editing?.profileId !== profile.id && (
                  <div className="profile-actions">
                    {!active && usable && (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={disabled}
                        aria-label={`Zu ${profile.name} wechseln`}
                        onClick={() => setConfirmation({ kind: 'switch', profileId: profile.id })}
                      >
                        Wechseln
                      </button>
                    )}
                    {usable && (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={disabled}
                        aria-label={`${profile.name} umbenennen`}
                        onClick={() => setEditing({ profileId: profile.id, name: profile.name })}
                      >
                        Umbenennen
                      </button>
                    )}
                    {canAdd && (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={disabled}
                        aria-label={`${profile.name} duplizieren`}
                        onClick={() => onDuplicate(profile.id)}
                      >
                        Duplizieren
                      </button>
                    )}
                    {count > 1 && (
                      <button
                        type="button"
                        className="button danger-outline"
                        disabled={disabled}
                        aria-label={`${profile.name} löschen`}
                        onClick={() => setConfirmation({ kind: 'delete', profileId: profile.id })}
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                )
              )}
            </li>
          );
        })}
      </ul>

      {canAdd ? (
        <form className="profile-create" onSubmit={create} noValidate>
          <label htmlFor="new-profile-name">Neues Profil</label>
          <div className="input-row">
            <input
              id="new-profile-name"
              value={newName}
              maxLength={MAX_NAME_LENGTH}
              placeholder="z. B. Quiz-Abend"
              onChange={(event) => setNewName(event.target.value)}
              disabled={disabled}
              aria-invalid={validation ? true : undefined}
              aria-describedby={validation ? 'new-profile-error' : undefined}
            />
            <button type="submit" className="button primary" disabled={disabled}>
              Anlegen
            </button>
          </div>
          {validation && (
            <p id="new-profile-error" className="field-error">
              {validation}
            </p>
          )}
        </form>
      ) : (
        <div className="pro-hint">
          <span className="pro-tag">Pro</span>
          <p>
            {license.plan === 'pro'
              ? `Du nutzt alle ${limit} Profile. Lösche ein Profil, um ein neues anzulegen.`
              : 'Mit FlagCount Pro speicherst du bis zu zehn Profile, zum Beispiel für verschiedene Stream-Formate.'}
          </p>
          {license.plan !== 'pro' && (
            <button type="button" className="button secondary" onClick={onShowPro}>
              Mehr zu Pro
            </button>
          )}
        </div>
      )}

      {hasInactive && (
        <p className="hint">
          Profile mit Pro-Kennzeichnung bleiben gespeichert und sind wieder nutzbar, sobald FlagCount Pro aktiv ist.
        </p>
      )}
    </section>
  );
}
