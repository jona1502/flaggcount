import type { Entitlements } from '../../../shared/entitlements';
import {
  evaluateEntitlement,
  parseSignedEntitlement,
  type EntitlementVerifier,
  type InstallationSummary,
  type LicenseErrorCode,
  type LicenseEvaluation,
  type LicenseState,
  type SignedEntitlement
} from '../../../shared/licensing';
import type { LogLevel, SidecarEvent } from '../protocol';

export type LicenseCredentials = {
  licenseId: string;
  /** Proves this installation to the license service. Kept in the operating system's secret store by Tauri. */
  secret: string;
};

export type LicenseConfiguration = {
  installationId: string;
  credentials: LicenseCredentials | null;
  /** The stored entitlement as Tauri read it from disk; checked again here. */
  entitlement: unknown;
};

export type LicenseManagerOptions = {
  send: (event: SidecarEvent) => void;
  /** Base URL of the FlagCount server that runs the license service. */
  baseUrl: string;
  verify: EntitlementVerifier;
  /** Called whenever the unlocked plan or features change. */
  onEntitlements: (entitlements: Entitlements) => void;
  log?: (level: LogLevel, message: string) => void;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  /** How often a stored entitlement is checked for its refresh date. */
  checkIntervalMs?: number;
};

type ApiResponse = { status: number; body: Record<string, unknown> } | { status: 'network' };

const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function failure(response: ApiResponse): LicenseErrorCode {
  if (response.status === 'network') return 'network';
  return response.status === 429 ? 'rate-limited' : 'unavailable';
}

function parseInstallations(value: unknown): InstallationSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
    const { installationId, activatedAt, lastSeenAt } = record;
    return typeof installationId === 'string' && typeof activatedAt === 'string' && typeof lastSeenAt === 'string'
      ? [{ installationId, activatedAt, lastSeenAt }]
      : [];
  });
}

/**
 * Activates, refreshes and deactivates FlagCount Pro on this computer. Without a license, without a
 * network or with an unreachable server the app keeps running: Free always works, and Pro keeps working
 * offline until its entitlement expires.
 */
export class LicenseManager {
  private installationId: string | null = null;
  private credentials: LicenseCredentials | null = null;
  private entitlement: SignedEntitlement | null = null;
  private lastError: LicenseErrorCode | null = null;
  private installations: InstallationSummary[] = [];
  private unlocked = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  private readonly request: typeof fetch;

  constructor(private readonly options: LicenseManagerOptions) {
    this.now = options.now ?? Date.now;
    this.request = options.fetch ?? fetch;
  }

  getState(): LicenseState {
    return { ...this.evaluate().info, installations: [...this.installations] };
  }

  getEntitlements(): Entitlements {
    return this.evaluate().entitlements;
  }

  async configure(configuration: LicenseConfiguration): Promise<void> {
    this.installationId = configuration.installationId;
    this.credentials = configuration.credentials;
    this.entitlement = parseSignedEntitlement(configuration.entitlement);
    this.publish();

    if (!this.timer) {
      this.timer = setInterval(() => {
        if (this.credentials && this.evaluate().info.needsRefresh) void this.refresh();
      }, this.options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS);
      this.timer.unref?.();
    }
    if (this.credentials && (!this.entitlement || this.evaluate().info.needsRefresh)) {
      await this.refresh();
    }
  }

  async activate(code: string, replaceInstallationId?: string): Promise<void> {
    if (!this.installationId) return;
    const response = await this.post('/api/v1/licenses/activate', {
      code,
      installationId: this.installationId,
      ...(replaceInstallationId ? { replaceInstallationId } : {})
    });

    this.installations = [];
    if (response.status === 200) {
      const { licenseId, activationSecret } = response.body;
      const entitlement = parseSignedEntitlement(response.body['entitlement']);
      const checked = entitlement ? this.evaluate(entitlement) : null;
      if (typeof licenseId !== 'string' || typeof activationSecret !== 'string' || checked?.info.plan !== 'pro') {
        // Also the case if this app does not know the server's signing key yet.
        this.lastError = 'invalid-response';
        this.log('warn', 'License activation returned an entitlement that could not be verified');
      } else {
        this.credentials = { licenseId, secret: activationSecret };
        this.entitlement = entitlement;
        this.lastError = null;
        this.persist();
        this.log('info', 'License activated');
      }
    } else if (response.status === 409) {
      this.installations = parseInstallations(response.body['installations']);
      this.lastError = 'installation-limit';
    } else if (response.status === 400) {
      this.lastError = response.body['error'] === 'invalid-installation' ? 'invalid-installation' : 'invalid-code';
    } else if (response.status === 403) {
      this.lastError = 'license-inactive';
    } else {
      this.lastError = failure(response);
    }
    this.publish();
  }

  async refresh(): Promise<void> {
    if (!this.credentials || !this.installationId) {
      this.lastError = null;
      this.publish();
      return;
    }
    const response = await this.post('/api/v1/licenses/refresh', this.credentialBody());

    if (response.status === 200) {
      const entitlement = parseSignedEntitlement(response.body['entitlement']);
      if (entitlement && this.evaluate(entitlement).info.plan === 'pro') {
        this.entitlement = entitlement;
        this.lastError = null;
        this.persist();
      } else {
        this.lastError = 'invalid-response';
      }
    } else if (response.status === 401) {
      // The server no longer knows this installation, e.g. after it was deactivated elsewhere.
      this.credentials = null;
      this.entitlement = null;
      this.lastError = 'invalid-installation';
      this.persist();
      this.log('info', 'The license service no longer accepts this installation');
    } else if (response.status === 403) {
      // Cancelled, refunded or paused: Pro ends, the installation stays known for a reversal.
      this.entitlement = null;
      this.lastError = 'license-inactive';
      this.persist();
      this.log('info', 'The license is no longer active');
    } else {
      // Offline or server trouble: the stored entitlement keeps working until it expires.
      this.lastError = failure(response);
    }
    this.publish();
  }

  async deactivate(): Promise<void> {
    if (!this.credentials || !this.installationId) return;
    const response = await this.post('/api/v1/licenses/deactivate', this.credentialBody());
    if (response.status === 204 || response.status === 401) {
      this.credentials = null;
      this.entitlement = null;
      this.lastError = null;
      this.persist();
      this.log('info', 'License deactivated on this computer');
    } else {
      this.lastError = failure(response);
    }
    this.publish();
  }

  async openCustomerPortal(): Promise<void> {
    if (!this.credentials || !this.installationId) return;
    const response = await this.post('/api/v1/billing/portal', this.credentialBody());
    const url = response.status === 200 ? response.body['url'] : null;
    if (typeof url === 'string' && url.startsWith('https://')) {
      this.lastError = null;
      this.options.send({ type: 'openUrl', url });
    } else {
      this.lastError = response.status === 401 ? 'invalid-installation' : failure(response);
    }
    this.publish();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private evaluate(entitlement: SignedEntitlement | null = this.entitlement): LicenseEvaluation {
    return evaluateEntitlement(this.installationId ? entitlement : null, {
      installationId: this.installationId ?? '',
      now: this.now(),
      verify: this.options.verify,
      lastError: this.lastError
    });
  }

  private credentialBody(): Record<string, string> {
    return {
      licenseId: this.credentials?.licenseId ?? '',
      installationId: this.installationId ?? '',
      secret: this.credentials?.secret ?? ''
    };
  }

  private publish(): void {
    const evaluation = this.evaluate();
    this.options.send({ type: 'license', license: { ...evaluation.info, installations: [...this.installations] } });
    const unlocked = JSON.stringify([evaluation.entitlements.plan, [...evaluation.entitlements.features].sort()]);
    if (unlocked !== this.unlocked) {
      this.unlocked = unlocked;
      this.options.onEntitlements(evaluation.entitlements);
    }
  }

  /** Hands credentials and entitlement to Tauri, which stores them; `null` removes them. */
  private persist(): void {
    this.options.send({ type: 'licenseCredentials', credentials: this.credentials, entitlement: this.entitlement });
  }

  private async post(path: string, body: unknown): Promise<ApiResponse> {
    try {
      const response = await this.request(`${this.options.baseUrl.replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000)
      });
      let parsed: Record<string, unknown> = {};
      try {
        const json: unknown = await response.json();
        if (typeof json === 'object' && json !== null && !Array.isArray(json)) parsed = json as Record<string, unknown>;
      } catch {
        // Empty or non-JSON bodies, e.g. 204.
      }
      return { status: response.status, body: parsed };
    } catch {
      return { status: 'network' };
    }
  }

  private log(level: LogLevel, message: string): void {
    this.options.log?.(level, message);
  }
}
