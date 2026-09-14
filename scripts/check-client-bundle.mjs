// Fails the build if a browser bundle contains server secrets.
// Usage: node scripts/check-client-bundle.mjs apps/web/.next/static
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Shapes of secrets that must never reach the browser. */
export const SECRET_PATTERNS = [
  ['Stripe secret key', /\b[sr]k_(?:live|test)_[A-Za-z0-9]{10,}/],
  ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9+/=]{16,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['database URL with credentials', /\bpostgres(?:ql)?:\/\/[^\s'"`:@/]+:[^\s'"`@/]+@/],
  ['GitHub token', /\bgh[opsu]_[A-Za-z0-9]{20,}/]
];

/** Server-only variables whose actual values must not appear in a bundle either. */
export const SECRET_VARIABLES = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'DATABASE_URL',
  'LICENSE_SIGNING_PRIVATE_KEY',
  'LICENSE_CODE_PEPPER',
  'DASHBOARD_PASSWORD',
  'ADMIN_GITHUB_CLIENT_SECRET',
  'ADMIN_SESSION_SECRET',
  'ADMIN_ASSERTION_SECRET',
  'SMTP_URL',
  'PADDLE_API_KEY',
  'PADDLE_WEBHOOK_SECRET'
];

/** Findings in one file's text: pattern names and names of environment variables whose values leaked. */
export function findSecrets(text, env = {}) {
  const findings = SECRET_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  for (const name of SECRET_VARIABLES) {
    const value = env[name];
    if (typeof value === 'string' && value.length >= 8 && text.includes(value)) findings.push(`value of ${name}`);
  }
  return findings;
}

async function* files(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(?:js|mjs|css|html|json|txt|map)$/.test(entry.name)) yield path;
  }
}

export async function checkDirectory(directory, env = process.env) {
  const problems = [];
  for await (const file of files(directory)) {
    for (const finding of findSecrets(await readFile(file, 'utf8'), env)) {
      problems.push(`${relative(process.cwd(), file)}: ${finding}`);
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const directory = process.argv[2] ?? 'apps/web/.next/static';
  const problems = await checkDirectory(directory);
  if (problems.length > 0) {
    console.error(`Secrets found in the client bundle:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`No secrets found in ${directory}.`);
}
