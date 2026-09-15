import type { TwitchAuthState } from '../../../shared/live';
import { TwitchOAuthClient, TwitchOAuthError, authState, type TwitchCredentials } from './oauth';

export type TwitchAuthListener = {
  onState: (state: TwitchAuthState) => void;
  onCredentials: (credentials: TwitchCredentials | null) => void;
  onOpenUrl: (url: string) => void;
  onError: (code: 'permission-required' | 'authorization-revoked' | 'network') => void;
};

export class TwitchAuthManager {
  private state: TwitchAuthState = { status: 'signed-out' };
  private credentials: TwitchCredentials | null = null;
  private generation = 0;

  constructor(private readonly client: TwitchOAuthClient, private readonly listener: TwitchAuthListener) {}

  getState(): TwitchAuthState { return structuredClone(this.state); }
  getCredentials(): TwitchCredentials | null { return this.credentials ? { ...this.credentials } : null; }

  async configure(credentials: TwitchCredentials | null): Promise<void> {
    this.credentials = credentials;
    if (!credentials) return this.setState({ status: 'signed-out' });
    try {
      let active = credentials;
      if (Date.parse(active.expiresAt) <= Date.now() + 60_000) {
        active = await this.client.refresh(active.refreshToken);
        this.credentials = active;
        this.listener.onCredentials(active);
      }
      this.setState(authState(await this.client.validate(active.accessToken)));
    } catch (error) {
      this.credentials = null;
      this.listener.onCredentials(null);
      this.setState({ status: 'expired' });
      this.listener.onError(error instanceof TwitchOAuthError && error.code === 'denied' ? 'permission-required' : 'authorization-revoked');
    }
  }

  async start(): Promise<void> {
    const generation = ++this.generation;
    const device = await this.client.startDeviceAuthorization();
    this.setState({ status: 'authorizing', userCode: device.userCode, verificationUri: device.verificationUri, expiresAt: device.expiresAt });
    this.listener.onOpenUrl(device.verificationUri);
    while (generation === this.generation && Date.parse(device.expiresAt) > Date.now()) {
      await new Promise((resolve) => setTimeout(resolve, device.intervalMs));
      if (generation !== this.generation) return;
      try {
        const credentials = await this.client.exchangeDeviceCode(device.deviceCode);
        const identity = await this.client.validate(credentials.accessToken);
        this.credentials = credentials;
        this.listener.onCredentials(credentials);
        this.setState(authState(identity));
        return;
      } catch (error) {
        if (error instanceof TwitchOAuthError && error.code === 'pending') continue;
        this.setState(error instanceof TwitchOAuthError && error.code === 'expired' ? { status: 'expired' } : { status: 'signed-out' });
        this.listener.onError(error instanceof TwitchOAuthError && error.code === 'denied' ? 'permission-required' : 'network');
        return;
      }
    }
    if (generation === this.generation) this.setState({ status: 'expired' });
  }

  async disconnect(): Promise<void> {
    this.generation++;
    const accessToken = this.credentials?.accessToken;
    this.credentials = null;
    this.listener.onCredentials(null);
    this.setState({ status: 'signed-out' });
    if (accessToken) await this.client.revoke(accessToken).catch(() => undefined);
  }

  private setState(state: TwitchAuthState): void {
    this.state = state;
    this.listener.onState(structuredClone(state));
  }
}
