import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type WaitlistResult = 'ok' | 'invalid-email' | 'consent-required' | 'full';

type WaitlistEntry = {
  email: string;
  consentedAt: string;
};

const MAX_EMAIL_LENGTH = 254;
const MAX_WAITLIST_ENTRIES = 10_000;
const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length > 3 && email.length <= MAX_EMAIL_LENGTH && SIMPLE_EMAIL.test(email) ? email : null;
}

/** Stores only the contact address and consent time; writes are serialized and atomic. */
export class WaitlistStore {
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  async subscribe(emailValue: unknown, consentValue: unknown): Promise<WaitlistResult> {
    const email = normalizeEmail(emailValue);
    if (!email) return 'invalid-email';
    if (consentValue !== true) return 'consent-required';

    let result: WaitlistResult = 'ok';
    await this.update((entries) => {
      if (entries.some((entry) => entry.email === email)) return entries;
      if (entries.length >= MAX_WAITLIST_ENTRIES) {
        result = 'full';
        return entries;
      }
      return [...entries, { email, consentedAt: this.now().toISOString() }];
    });
    return result;
  }

  async unsubscribe(emailValue: unknown): Promise<WaitlistResult> {
    const email = normalizeEmail(emailValue);
    if (!email) return 'invalid-email';
    await this.update((entries) => entries.filter((entry) => entry.email !== email));
    // Deliberately identical whether the address was present, preventing membership disclosure.
    return 'ok';
  }

  private async load(): Promise<WaitlistEntry[]> {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8')) as unknown;
      if (!Array.isArray(value)) return [];
      return value.filter(
        (entry): entry is WaitlistEntry =>
          typeof entry === 'object' &&
          entry !== null &&
          normalizeEmail((entry as Record<string, unknown>)['email']) === (entry as Record<string, unknown>)['email'] &&
          typeof (entry as Record<string, unknown>)['consentedAt'] === 'string'
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return [];
      throw error;
    }
  }

  private update(change: (entries: WaitlistEntry[]) => WaitlistEntry[]): Promise<void> {
    const write = async (): Promise<void> => {
      const entries = change(await this.load());
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, `${JSON.stringify(entries, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.path);
      await chmod(this.path, 0o600);
    };
    this.pending = this.pending.then(write, write);
    return this.pending;
  }
}
