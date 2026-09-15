import type { FlagCountActions } from '../api/useFlagCount';
import type { AppModel } from '../app-shell/appModel';
import { ConnectionPanel } from './ConnectionPanel';

type LiveConnectionProps = {
  model: AppModel;
  pending: boolean;
  actions: FlagCountActions;
  /** Twitch sign-in is only available in the desktop app. */
  desktop: boolean;
  bare?: boolean;
};

/** The connection form wired to the app state, shared by the overview and the drawer of the top bar. */
export function LiveConnection({ model: { state }, pending, actions, desktop, bare }: LiveConnectionProps): React.JSX.Element {
  return (
    <ConnectionPanel
      bare={bare}
      connection={state.connection}
      savedUsername={state.settings.username}
      sidecarRunning={state.sidecarRunning}
      pending={pending}
      initialPlatform={state.settings.liveSource?.platform}
      twitchAuth={state.twitchAuth}
      twitchAvailable={desktop}
      onConnect={(username, platform) => void (platform ? actions.connect(username, platform) : actions.connect(username))}
      onDisconnect={() => void actions.disconnect()}
      onStartTwitchAuth={() => void actions.startTwitchAuth()}
      onDisconnectTwitchAccount={() => void actions.disconnectTwitchAccount()}
    />
  );
}
