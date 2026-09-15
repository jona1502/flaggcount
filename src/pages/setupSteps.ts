import type { AppModel } from '../app-shell/appModel';
import type { Route } from '../app-shell/navigation';

export type SetupStepId = 'connection' | 'profile' | 'elements' | 'overlay' | 'license';

export type SetupStep = {
  id: SetupStepId;
  title: string;
  detail: string;
  done: boolean;
  /** Leads straight to the place where the step is completed. */
  action: { label: string; route: Route };
};

function licenseStep({ state }: AppModel): Pick<SetupStep, 'done' | 'detail'> {
  const { license } = state;
  if (license.plan === 'pro') {
    return license.needsRefresh
      ? { done: false, detail: 'Die Pro-Lizenz sollte online bestätigt werden. Pro funktioniert bis dahin weiter.' }
      : { done: true, detail: 'Audience Live Pro ist auf diesem Computer bestätigt.' };
  }
  if (license.status === 'expired' || license.status === 'invalid') {
    return { done: false, detail: 'Pro ist auf diesem Computer nicht aktiv. Audience Live läuft als Free weiter.' };
  }
  return { done: true, detail: 'Audience Live Free – ohne Konto und ohne Lizenz nutzbar.' };
}

/** The first-start checklist of the overview. */
export function setupSteps(model: AppModel): SetupStep[] {
  const { state, running } = model;
  const connected = state.connection.status === 'connected';
  const elements = running.counters.length;
  return [
    {
      id: 'connection',
      title: 'TikTok-Konto verbunden',
      done: connected,
      detail: connected
        ? `Verbunden mit @${state.connection.username ?? ''}`
        : 'Gib deinen TikTok-Namen ein und verbinde dich, sobald dein LIVE läuft.',
      action: { label: 'Zum Cockpit', route: { page: 'live' } }
    },
    {
      id: 'profile',
      title: 'Aktives Profil gewählt',
      done: true,
      detail: `„${running.name}“ läuft.`,
      action: { label: 'Profile verwalten', route: { page: 'profiles' } }
    },
    {
      id: 'elements',
      title: 'Zähler oder Abstimmung angelegt',
      done: elements > 0,
      detail:
        elements > 0
          ? `${elements} ${elements === 1 ? 'Element' : 'Elemente'} im Profil: ${running.counters.map((counter) => counter.name).join(', ')}`
          : 'Lege einen Zähler oder eine Abstimmung an.',
      action: { label: 'Neues Element', route: { page: 'counters', create: true } }
    },
    {
      id: 'overlay',
      title: 'Overlay verfügbar',
      done: state.overlayUrl !== null,
      detail: state.overlayUrl ? 'Die Overlay-URL ist bereit zum Kopieren.' : 'Die URL erscheint, sobald der Verbindungsdienst läuft.',
      action: { label: 'Overlay einrichten', route: { page: 'overlays' } }
    },
    { id: 'license', title: 'Lizenzstatus aktuell', ...licenseStep(model), action: { label: 'Lizenz prüfen', route: { page: 'license' } } }
  ];
}
