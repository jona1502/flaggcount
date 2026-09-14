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
  },
  {
    version: 2,
    name: 'provider_neutral_licenses',
    sql: `
      ALTER TABLE licenses RENAME COLUMN provider TO source;
      ALTER TABLE licenses RENAME COLUMN customer_id TO provider_customer_id;
      ALTER TABLE licenses RENAME COLUMN subscription_id TO provider_subscription_id;
      ALTER TABLE licenses RENAME COLUMN status TO provider_status;
      ALTER INDEX licenses_customer RENAME TO licenses_provider_customer;

      ALTER TABLE licenses DROP CONSTRAINT licenses_status_check;
      ALTER TABLE licenses
        ALTER COLUMN provider_customer_id DROP NOT NULL,
        ALTER COLUMN provider_subscription_id DROP NOT NULL,
        ALTER COLUMN provider_status DROP NOT NULL,
        ALTER COLUMN provider_updated_at DROP NOT NULL,
        ADD COLUMN manual_valid_until timestamptz,
        ADD COLUMN manual_reason text,
        ADD COLUMN support_note text,
        ADD CONSTRAINT licenses_provider_status_check CHECK (provider_status IN
          ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'paused', 'unpaid', 'canceled')),
        ADD CONSTRAINT licenses_manual_reason_check CHECK (manual_reason IN ('support', 'creator', 'testing', 'promotion')),
        ADD CONSTRAINT licenses_support_status_check CHECK (support_status IN ('none', 'blocked')),
        ADD CONSTRAINT licenses_support_note_length CHECK (char_length(support_note) <= 500),
        -- Manual licenses never carry invented provider ids; provider licenses never carry a manual reason.
        ADD CONSTRAINT licenses_source_fields CHECK (
          (source = 'manual'
            AND provider_customer_id IS NULL AND provider_subscription_id IS NULL
            AND provider_status IS NULL AND provider_updated_at IS NULL AND manual_reason IS NOT NULL)
          OR (source <> 'manual'
            AND provider_customer_id IS NOT NULL AND provider_subscription_id IS NOT NULL
            AND provider_status IS NOT NULL AND provider_updated_at IS NOT NULL
            AND manual_reason IS NULL AND manual_valid_until IS NULL)
        );

      CREATE TABLE admin_audit_log (
        id uuid PRIMARY KEY,
        admin_subject text NOT NULL,
        action text NOT NULL,
        license_id uuid REFERENCES licenses (id) ON DELETE SET NULL,
        metadata jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL
      );
      CREATE INDEX admin_audit_log_license ON admin_audit_log (license_id, created_at);
      CREATE INDEX admin_audit_log_created ON admin_audit_log (created_at);
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
