import { useEffect, useRef, useState } from 'react';
import { isProfileUsable, limitFor } from '../../shared/entitlements';
import { PageHeader } from '../app-shell/PageHeader';
import { Badge, Button, Callout, IconPlus, useToast } from '../components/ui';
import { CreateProfileDialog } from '../profiles/CreateProfileDialog';
import { ProfileCard } from '../profiles/ProfileCard';
import type { PageProps } from './types';

type Intent = { kind: 'create' | 'duplicate' | 'rename' | 'delete' | 'switch'; name: string };

const CONFIRMATIONS: Record<Intent['kind'], (name: string) => string> = {
  create: (name) => `Profil „${name}“ angelegt`,
  duplicate: (name) => `„${name}“ dupliziert`,
  rename: (name) => `Profil in „${name}“ umbenannt`,
  delete: (name) => `Profil „${name}“ gelöscht`,
  switch: (name) => `„${name}“ läuft jetzt`
};

/** Saved stream formats: create, switch, rename, duplicate and delete. */
export function ProfilesPage({ model, pending, error, actions, navigate }: PageProps): React.JSX.Element {
  const { state, entitlements, running, isPro } = model;
  const { settings } = state;
  const limit = limitFor(entitlements, 'profiles');
  const count = settings.profiles.length;
  const canAdd = count < limit;
  const hasInactive = count > limit;
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  // A change is confirmed once the backend reports the changed profiles, never optimistically.
  const intent = useRef<Intent | null>(null);
  const signature = JSON.stringify([settings.activeProfileId, settings.profiles.map((profile) => [profile.id, profile.name])]);
  const previous = useRef(signature);
  useEffect(() => {
    if (previous.current === signature) return;
    previous.current = signature;
    const done = intent.current;
    intent.current = null;
    if (!done) return;
    if (done.kind === 'create') setCreating(false);
    toast({ title: CONFIRMATIONS[done.kind](done.name) });
  }, [signature, toast]);

  useEffect(() => {
    if (error) intent.current = null;
  }, [error]);

  const perform = (next: Intent, action: () => Promise<void>): void => {
    intent.current = next;
    void action();
  };

  return (
    <div className="page profiles-page">
      <PageHeader
        title="Profile"
        description="Ein Profil speichert Zähler, Abstimmungen, Ziele und Overlay-Designs für ein Stream-Format."
        badge={
          <Badge tone="neutral">
            {count} von {limit} {limit === 1 ? 'Profil' : 'Profilen'}
          </Badge>
        }
        actions={
          <Button variant="primary" icon={IconPlus} disabled={!canAdd || pending} onClick={() => setCreating(true)}>
            Neues Profil
          </Button>
        }
      />

      {!canAdd &&
        (isPro ? (
          !hasInactive && (
            <Callout tone="info" title={`Alle ${limit} Profile belegt`}>
              Lösche ein Profil, um ein neues anzulegen.
            </Callout>
          )
        ) : (
          <Callout
            tone="pro"
            title="Mehrere Profile mit Audience Live Pro"
            actions={
              <Button size="sm" onClick={() => navigate({ page: 'license' })}>
                Mehr zu Pro
              </Button>
            }
          >
            Speichere bis zu zehn Profile, zum Beispiel für Quiz-Abende, Turniere oder Just Chatting, und wechsle mit einem Klick.
          </Callout>
        ))}

      {hasInactive && (
        <Callout tone="warning" title="Einige Profile sind pausiert">
          Profile mit Pro-Kennzeichnung bleiben gespeichert und sind wieder nutzbar, sobald Audience Live Pro aktiv ist.
        </Callout>
      )}

      <ul className="profile-grid" aria-label="Gespeicherte Profile">
        {settings.profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            running={profile.id === running.id}
            chosen={profile.id === settings.activeProfileId}
            usable={isProfileUsable(settings, profile.id, entitlements)}
            canDuplicate={canAdd}
            canDelete={count > 1}
            disabled={pending}
            onSwitch={() => perform({ kind: 'switch', name: profile.name }, () => actions.switchProfile(profile.id))}
            onRename={(name) => perform({ kind: 'rename', name }, () => actions.renameProfile(profile.id, name))}
            onDuplicate={() => perform({ kind: 'duplicate', name: profile.name }, () => actions.duplicateProfile(profile.id))}
            onDelete={() => perform({ kind: 'delete', name: profile.name }, () => actions.deleteProfile(profile.id))}
          />
        ))}
      </ul>

      {creating && (
        <CreateProfileDialog
          busy={pending}
          error={error}
          onCancel={() => setCreating(false)}
          onCreate={(name) => perform({ kind: 'create', name }, () => actions.createProfile(name))}
        />
      )}
    </div>
  );
}
