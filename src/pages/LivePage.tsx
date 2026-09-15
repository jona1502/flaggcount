import { useEffect, useState, type FormEvent } from 'react';
import { isProfileUsable } from '../../shared/entitlements';
import type { AppModel } from '../app-shell/appModel';
import { PageHeader } from '../app-shell/PageHeader';
import { Button, Callout, Card, ConfirmDialog, EmptyState, Field, IconPlus, IconPoll, IconRefresh, Select } from '../components/ui';
import { ConnectionPanel } from '../dashboard/ConnectionPanel';
import { LiveCounterCard } from '../live/LiveCounterCard';
import { liveCounters } from '../live/liveCounters';
import type { PageProps } from './types';

type ProfileSwitcherProps = {
  model: AppModel;
  disabled: boolean;
  onSwitch: (profileId: string) => void;
  onManage: () => void;
};

function ProfileSwitcher({ model, disabled, onSwitch, onManage }: ProfileSwitcherProps): React.JSX.Element {
  const { state, entitlements, running } = model;
  const usable = state.settings.profiles.filter((profile) => isProfileUsable(state.settings, profile.id, entitlements));
  const [choice, setChoice] = useState(running.id);
  const [confirming, setConfirming] = useState(false);
  const chosen = usable.find((profile) => profile.id === choice);

  useEffect(() => setChoice(running.id), [running.id]);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (choice !== running.id) setConfirming(true);
  };

  return (
    <Card
      title="Aktives Profil"
      className="live-profile"
      actions={
        <Button variant="ghost" size="sm" onClick={onManage}>
          Profile verwalten
        </Button>
      }
    >
      {usable.length > 1 ? (
        <form className="live-profile-form" onSubmit={submit}>
          <Field id="live-profile" label="Profil">
            <Select value={choice} onChange={(event) => setChoice(event.target.value)}>
              {usable.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={disabled || choice === running.id}>
            Wechseln
          </Button>
        </form>
      ) : (
        <p className="live-profile-name">
          <strong>{running.name}</strong>
          <span>
            {running.counters.length} {running.counters.length === 1 ? 'Element' : 'Elemente'}
          </span>
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        title={`Zu „${chosen?.name ?? ''}“ wechseln?`}
        message="Laufende Runden werden beim Wechsel beendet. Danach laufen die Zähler und Abstimmungen des neuen Profils."
        confirmLabel="Ja, wechseln"
        tone="primary"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onSwitch(choice);
        }}
      />
    </Card>
  );
}

/** Everything needed during a stream: connection, profile and all running counters at once. */
export function LivePage({ model, pending, error, actions, navigate, desktop }: PageProps): React.JSX.Element {
  const { state, running, runningCounters, isPro } = model;
  const counters = liveCounters(model);
  const disabled = !state.sidecarRunning || pending;
  const alone = counters.length === 1;
  const [confirmAll, setConfirmAll] = useState(false);
  const paused = running.counters.filter((counter) => !runningCounters.some((candidate) => candidate.id === counter.id));
  const streamEnded = (error?.code === 'stream-ended' || error?.code === 'reconnect-failed') && state.connection.status === 'disconnected';
  const firstStored = running.counters[0]?.id;

  return (
    <div className="page live-page">
      <PageHeader
        title="Live-Steuerung"
        description="Stimmen, Ziele und Runden während des Streams."
        actions={
          counters.length > 1 && (
            <Button variant="danger-outline" icon={IconRefresh} disabled={disabled} onClick={() => setConfirmAll(true)}>
              Alle Runden zurücksetzen
            </Button>
          )
        }
      />

      <div className="live-toolbar" data-desktop={desktop}>
        <ConnectionPanel
          connection={state.connection}
          savedUsername={state.settings.username}
          sidecarRunning={state.sidecarRunning}
          pending={pending}
          initialPlatform={state.settings.liveSource?.platform}
          twitchAuth={state.twitchAuth}
          twitchAvailable={desktop}
          onConnect={(username, platform) => void actions.connect(username, platform)}
          onDisconnect={() => void actions.disconnect()}
          onStartTwitchAuth={() => void actions.startTwitchAuth()}
          onDisconnectTwitchAccount={() => void actions.disconnectTwitchAccount()}
        />
        {desktop && (
          <ProfileSwitcher
            model={model}
            disabled={disabled}
            onSwitch={(profileId) => void actions.switchProfile(profileId)}
            onManage={() => navigate({ page: 'profiles' })}
          />
        )}
      </div>

      {!state.sidecarRunning && (
        <Callout tone="danger" title="Verbindungsdienst nicht verfügbar">
          Audience Live startet den Dienst automatisch neu. Bis dahin lassen sich keine Stimmen zählen oder korrigieren.
        </Callout>
      )}

      {streamEnded && (
        <Callout
          tone="warning"
          title="Der LIVE ist beendet oder nicht mehr erreichbar"
          actions={
            state.settings.username && (
              <Button size="sm" icon={IconRefresh} disabled={disabled} onClick={() => void actions.connect(state.settings.username)}>
                Erneut verbinden
              </Button>
            )
          }
        >
          Die Stimmen der laufenden Runden bleiben erhalten, bis du sie zurücksetzt.
        </Callout>
      )}

      {paused.length > 0 && (
        <Callout
          tone={isPro ? 'warning' : 'pro'}
          title={paused.length === 1 ? '1 Element läuft gerade nicht' : `${paused.length} Elemente laufen gerade nicht`}
          actions={
            <Button size="sm" onClick={() => navigate({ page: 'license' })}>
              Lizenz & Konto
            </Button>
          }
        >
          {paused.map((counter) => `„${counter.name}“`).join(', ')}{' '}
          {isPro
            ? 'wird von deiner Lizenz gerade nicht freigegeben. Aktualisiere den Lizenzstatus.'
            : `${paused.length === 1 ? 'braucht' : 'brauchen'} Audience Live Pro. Alles bleibt gespeichert und läuft wieder, sobald Pro aktiv ist.`}
        </Callout>
      )}

      {counters.length === 0 ? (
        <EmptyState
          icon={IconPoll}
          title="Noch nichts zu steuern"
          description="Lege einen Zähler oder eine Abstimmung an. Sie erscheint dann hier mit großen Plus- und Minus-Schaltflächen."
          action={
            desktop && (
              <Button variant="primary" icon={IconPlus} onClick={() => navigate({ page: 'counters', create: true })}>
                Abstimmung erstellen
              </Button>
            )
          }
        />
      ) : (
        <div className="live-grid" data-count={counters.length}>
          {counters.map((counter) => (
            <LiveCounterCard
              key={counter.counterId}
              counter={counter}
              alone={alone}
              disabled={disabled}
              onAddVote={(optionId) => void (counter.addressable ? actions.addManualVote(counter.counterId, optionId) : actions.addManualVote())}
              onRemoveVote={(optionId) =>
                void (counter.addressable ? actions.removeManualVote(counter.counterId, optionId) : actions.removeManualVote())
              }
              onReset={() => void (counter.addressable ? actions.resetVotes(counter.counterId) : actions.resetVotes())}
              onSetTarget={
                counter.primary && (!counter.addressable || counter.counterId === firstStored) ? (target) => void actions.setTarget(target) : undefined
              }
              onEditTarget={desktop ? () => navigate({ page: 'counters', counterId: counter.counterId }) : undefined}
            />
          ))}
        </div>
      )}

      {desktop && counters.length > 0 && counters.every((counter) => counter.mode === 'single') && (
        <Card tone="muted" title="Mehr als ein Zähler?" description="Frag dein Publikum A oder B – mit einer Abstimmung, die hier direkt neben deinem Zähler läuft.">
          <div className="card-row">
            <Button icon={IconPoll} onClick={() => navigate({ page: 'counters', create: true })}>
              Abstimmung erstellen
            </Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmAll}
        title="Alle Runden zurücksetzen?"
        message="Die Stimmen aller Zähler und Abstimmungen werden gelöscht. Danach dürfen alle erneut abstimmen."
        confirmLabel="Ja, alle zurücksetzen"
        onCancel={() => setConfirmAll(false)}
        onConfirm={() => {
          setConfirmAll(false);
          void actions.resetVotes();
        }}
      />
    </div>
  );
}
