import { useState } from 'react';
import { PageHeader } from '../app-shell/PageHeader';
import { Button, Callout, Card, ConfirmDialog, EmptyState, IconPlus, IconPoll, IconRefresh } from '../components/ui';
import { LiveConnection } from '../dashboard/LiveConnection';
import { LiveCounterCard } from '../live/LiveCounterCard';
import { liveCounters } from '../live/liveCounters';
import { SetupStrip } from '../live/SetupStrip';
import type { PageProps } from './types';

/**
 * The overview: connecting, the setup steps still open and every running counter at once.
 * Connection and profile stay reachable from the top bar on every other page.
 */
export function LivePage({ model, pending, error, actions, navigate, desktop }: PageProps): React.JSX.Element {
  const { state, running, runningCounters, isPro } = model;
  const counters = liveCounters(model);
  const disabled = !state.sidecarRunning || pending;
  const alone = counters.length === 1;
  const [confirmAll, setConfirmAll] = useState(false);
  const paused = running.counters.filter((counter) => !runningCounters.some((candidate) => candidate.id === counter.id));
  const disconnected = state.connection.status === 'disconnected';
  const streamEnded = (error?.code === 'stream-ended' || error?.code === 'reconnect-failed') && disconnected;
  const firstStored = running.counters[0]?.id;

  const headerActions = (desktop || counters.length > 1) && (
    <>
      {desktop && (
        <Button icon={IconPlus} onClick={() => navigate({ page: 'counters', create: true })}>
          Neues Element
        </Button>
      )}
      {counters.length > 1 && (
        <Button variant="danger-outline" icon={IconRefresh} disabled={disabled} onClick={() => setConfirmAll(true)}>
          Alle Runden zurücksetzen
        </Button>
      )}
    </>
  );

  return (
    <div className="page live-page">
      <PageHeader title="Übersicht" description="Verbindung, Stimmen und Runden während des Streams." actions={headerActions} />

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
              Pro & Lizenz
            </Button>
          }
        >
          {paused.map((counter) => `„${counter.name}“`).join(', ')}{' '}
          {isPro
            ? 'wird von deiner Lizenz gerade nicht freigegeben. Aktualisiere den Lizenzstatus.'
            : `${paused.length === 1 ? 'braucht' : 'brauchen'} Audience Live Pro. Alles bleibt gespeichert und läuft wieder, sobald Pro aktiv ist.`}
        </Callout>
      )}

      {/* Connecting is the first thing to do before a stream; once live, the top bar keeps the status. */}
      {disconnected && (
        <div className="live-connect">
          <LiveConnection model={model} pending={pending} actions={actions} desktop={desktop} />
        </div>
      )}

      {desktop && <SetupStrip model={model} onNavigate={navigate} />}

      {counters.length === 0 ? (
        <EmptyState
          icon={IconPoll}
          title="Noch nichts zu steuern"
          description="Lege einen Zähler oder eine Abstimmung an. Sie erscheint dann hier mit großen Plus- und Minus-Schaltflächen."
          action={
            desktop && (
              <Button variant="primary" icon={IconPlus} onClick={() => navigate({ page: 'counters', create: true })}>
                Erstes Element erstellen
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
