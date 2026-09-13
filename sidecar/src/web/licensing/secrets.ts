import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Crockford base32 without I, L, O and U, so codes survive being read aloud or typed from an email. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 20;
const GROUP = 5;
const PREFIX = 'FC';

/** A new activation code with 100 random bits, e.g. `FC-7K2QM-9XH4D-PZ1RT-W8C3N`. */
export function generateActivationCode(random: (size: number) => Buffer = randomBytes): string {
  const bytes = random(CODE_LENGTH);
  const characters = [...bytes].map((byte) => ALPHABET[byte % 32]).join('');
  const groups = characters.match(new RegExp(`.{${GROUP}}`, 'g')) ?? [];
  return [PREFIX, ...groups].join('-');
}

/** Accepts codes with any case, separators and the usual look-alike letters; `null` if it cannot be a code. */
export function normalizeActivationCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 64) return null;
  let code = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (code.length === CODE_LENGTH + PREFIX.length && code.startsWith(PREFIX)) {
    code = code.slice(PREFIX.length);
  }
  return code.length === CODE_LENGTH && [...code].every((character) => ALPHABET.includes(character)) ? code : null;
}

/** Codes are stored only as keyed hashes; the pepper lives in the server environment, not the database. */
export function hashActivationCode(normalizedCode: string, pepper: string): string {
  return createHmac('sha256', pepper).update(normalizedCode).digest('hex');
}

/** Secret an activated installation proves itself with; 256 random bits. */
export function generateInstallationSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function secretMatches(secret: unknown, expectedHash: string): boolean {
  if (typeof secret !== 'string' || secret.length > 128) return false;
  const actual = Buffer.from(hashSecret(secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
