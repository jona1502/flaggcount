import { PageHeader } from '../app-shell/PageHeader';
import { ProfilesPanel } from '../profiles/ProfilesPanel';
import type { PageProps } from './types';

export function ProfilesPage({ model, pending, actions, navigate }: PageProps): React.JSX.Element {
  return (
    <div className="page">
      <PageHeader title="Profile" description="Stream-Formate speichern und zwischen ihnen wechseln." />
      <ProfilesPanel
        settings={model.state.settings}
        license={model.state.license}
        disabled={pending}
        onCreate={(name) => void actions.createProfile(name)}
        onDuplicate={(profileId) => void actions.duplicateProfile(profileId)}
        onRename={(profileId, name) => void actions.renameProfile(profileId, name)}
        onDelete={(profileId) => void actions.deleteProfile(profileId)}
        onSwitch={(profileId) => void actions.switchProfile(profileId)}
        onShowPro={() => navigate({ page: 'license' })}
      />
    </div>
  );
}
