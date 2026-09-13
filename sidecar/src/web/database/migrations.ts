import type { Pool, PoolClient } from 'pg';

export type Migration = {
  version: number;
  name: string;
  sql: string;
};

/**
 * Append-only: released migrations are never edited, only followed by new ones. Every table holds the
 * minimum the product needs; no names, email addresses of buyers, payment data or TikTok identities.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'licenses',
    sql: `
      CREATE TABLE licenses (
        id uuid PRIMARY KEY,
        provider text NOT NULL,
        customer_id text NOT NULL,
        subscription_id text NOT NULL,
        status text NOT NULL CHECK (status IN ('active', 'trialing', 'past_due', 'paused', 'canceled')),
        current_period_ends_at timestamptz,
        scheduled_cancel_at timestamptz,
        canceled_at timestamptz,
        revoked_at timestamptz,
        provider_updated_at timestamptz NOT NULL,
        code_hash text UNIQUE,
        code_issued_at timestamptz,
        support_status text NOT NULL DEFAULT 'none',
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        UNIQUE (provider, subscription_id)
      );
      CREATE INDEX licenses_customer ON licenses (provider, customer_id);

      CREATE TABLE installations (
        license_id uuid NOT NULL REFERENCES licenses (id) ON DELETE CASCADE,
        installation_id text NOT NULL,
        secret_hash text NOT NULL,
        activated_at timestamptz NOT NULL,
        last_seen_at timestamptz NOT NULL,
        deactivated_at timestamptz,
        PRIMARY KEY (license_id, installation_id)
      );

      CREATE TABLE webhook_events (
        event_id text PRIMARY KEY,
        event_type text NOT NULL,
        occurred_at timestamptz NOT NULL,
        received_at timestamptz NOT NULL,
        processed_at timestamptz
      );
    `
  }
];

/** Arbitrary constant that serializes concurrent migration runs, e.g. two containers starting at once. */
const MIGRATION_LOCK = 470_115_022;

async function inTransaction(client: PoolClient, work: () => Promise<void>): Promise<void> {
  await client.query('BEGIN');
  try {
    await work();
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/** Applies every pending migration in order, each in its own transaction. Returns the applied versions. */
export async function migrate(pool: Pool, migrations: readonly Migration[] = MIGRATIONS): Promise<number[]> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query<{ version: number }>('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.version));
    const newlyApplied: number[] = [];

    for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
      if (applied.has(migration.version)) continue;
      await inTransaction(client, async () => {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [migration.version, migration.name]);
      });
      newlyApplied.push(migration.version);
    }
    return newlyApplied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => undefined);
    client.release();
  }
}
