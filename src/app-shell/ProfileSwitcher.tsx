import { useState } from 'react';
import { isProfileUsable } from '../../shared/entitlements';
import { ConfirmDialog, IconButton, IconProfiles, Select } from '../components/ui';
import type { AppModel } from './appModel';

type ProfileSwitcherProps = {
  model: AppModel;
  disabled: boolean;
  onSwitch: (profileId: string) => void;
  onManage: () => void;
};

/** The running profile, switchable from every page. Switching ends running rounds, so it asks first. */
export function ProfileSwitcher({ model, disabled, onSwitch, onManage }: ProfileSwitcherProps): React.JSX.Element {
  const { state, entitlements, running } = model;
  const usable = state.settings.profiles.filter((profile) => isProfileUsable(state.settings, profile.id, entitlements));
  const [choice, setChoice] = useState<string | null>(null);
  const chosen = usable.find((profile) => profile.id === choice);

  if (usable.length <= 1) {
    return (
      <button type="button" className="shell-topbar-profile" onClick={onManage}>
        <IconProfiles size={16} />
        <span className="shell-topbar-muted">Profil</span>{' '}
        <span className="shell-topbar-strong">{running.name}</span>
      </button>
    );
  }

  return (
    <div className="shell-topbar-profile">
      <label htmlFor="topbar-profile" className="shell-topbar-muted">
        Profil
      </label>
      <Select
        id="topbar-profile"
        value={choice ?? running.id}
        disabled={disabled}
        onChange={(event) => setChoice(event.target.value === running.id ? null : event.target.value)}
      >
        {usable.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
          </option>
        ))}
      </Select>
      <IconButton label="Profile verwalten" icon={IconProfiles} size="sm" onClick={onManage} />
      <ConfirmDialog
        open={chosen !== undefined}
        title={`Zu „${chosen?.name ?? ''}“ wechseln?`}
        message="Laufende Runden werden beim Wechsel beendet. Danach laufen die Zähler und Abstimmungen des neuen Profils."
        confirmLabel="Ja, wechseln"
        tone="primary"
        onCancel={() => setChoice(null)}
        onConfirm={() => {
          setChoice(null);
          if (chosen) onSwitch(chosen.id);
        }}
      />
    </div>
  );
}
