import type { Pool, PoolClient } from 'pg';
import type {
  ActivationRequest,
  AuditEntry,
  InstallationRecord,
  LicenseListFilter,
  LicenseRecord,
  LicenseSearch,
  LicenseStore,
  ManualLicenseInput,
  ManualReason,
  SubscriptionStatus,
  SubscriptionUpdate,
  SupportChanges,
  SupportStatus
} from './store';

export type LicenseRow = {
  id: string;
  source: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  provider_status: SubscriptionStatus | null;
  current_period_ends_at: Date | null;
  scheduled_cancel_at: Date | null;
  canceled_at: Date | null;
  revoked_at: Date | null;
  manual_valid_until: Date | null;
  manual_reason: ManualReason | null;
  support_status: SupportStatus;
  support_note: string | null;
  provider_updated_at: Date | null;
  code_hash: string | null;
  code_issued_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type InstallationRow = {
  license_id: string;
  installation_id: string;
  secret_hash: string;
  activated_at: Date;
  last_seen_at: Date;
  deactivated_at: Date | null;
};

export const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

export function toLicense(row: LicenseRow): LicenseRecord {
  return {
    id: row.id,
    source: row.source,
    providerCustomerId: row.provider_customer_id,
    providerSubscriptionId: row.provider_subscription_id,
    providerStatus: row.provider_status,
    currentPeriodEndsAt: iso(row.current_period_ends_at),
    scheduledCancelAt: iso(row.scheduled_cancel_at),
    canceledAt: iso(row.canceled_at),
    revokedAt: iso(row.revoked_at),
    manualValidUntil: iso(row.manual_valid_until),
    manualReason: row.manual_reason,
    supportStatus: row.support_status,
    supportNote: row.support_note,
    providerUpdatedAt: iso(row.provider_updated_at),
    codeHash: row.code_hash,
    codeIssuedAt: iso(row.code_issued_at),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export function toInstallation(row: InstallationRow): InstallationRecord {
  return {
    licenseId: row.license_id,
    installationId: row.installation_id,
    secretHash: row.secret_hash,
    activatedAt: row.activated_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    deactivatedAt: iso(row.deactivated_at)
  };
}

export const LICENSE_COLUMNS = `id, source, provider_customer_id, provider_subscription_id, provider_status,
  current_period_ends_at, scheduled_cancel_at, canceled_at, revoked_at, manual_valid_until, manual_reason,
  support_status, support_note, provider_updated_at, code_hash, code_issued_at, created_at, updated_at`;

/** License, installation and webhook data in PostgreSQL. Run `migrate` before using it. */
export class PostgresLicenseStore implements LicenseStore {
  constructor(protected readonly pool: Pool) {}

  async applySubscription(update: SubscriptionUpdate, newId: () => string, now: string) {
    // One statement: inserts the license or updates it unless the stored state is newer than the event.
    const { rows } = await this.pool.query<LicenseRow & { inserted: boolean }>(
      `INSERT INTO licenses (id, source, provider_customer_id, provider_subscription_id, provider_status,
         current_period_ends_at, scheduled_cancel_at, canceled_at, provider_updated_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
       ON CONFLICT (source, provider_subscription_id) DO UPDATE SET
         provider_customer_id = EXCLUDED.provider_customer_id,
         provider_status = EXCLUDED.provider_status,
         current_period_ends_at = EXCLUDED.current_period_ends_at,
         scheduled_cancel_at = EXCLUDED.scheduled_cancel_at,
         canceled_at = EXCLUDED.canceled_at,
         provider_updated_at = EXCLUDED.provider_updated_at,
         updated_at = EXCLUDED.updated_at
       WHERE licenses.provider_updated_at <= EXCLUDED.provider_updated_at
       RETURNING ${LICENSE_COLUMNS}, (xmax = 0) AS inserted`,
      [
        newId(),
        update.provider,
        update.customerId,
        update.subscriptionId,
        update.status,
        update.currentPeriodEndsAt,
        update.scheduledCancelAt,
        update.canceledAt,
        update.occurredAt,
        now
      ]
    );
    const [row] = rows;
    if (row) {
      return { license: toLicense(row), created: row.inserted, applied: true };
    }
    const existing = await this.findBySubscription(update.provider, update.subscriptionId);
    if (!existing) throw new Error('The license disappeared while it was updated');
    return { license: existing, created: false, applied: false };
  }

  async findById(id: string) {
    return this.findLicense('id = $1', [id]);
  }

  async findBySubscription(provider: string, subscriptionId: string) {
    return this.findLicense('source = $1 AND provider_subscription_id = $2', [provider, subscriptionId]);
  }

  async findByCodeHash(codeHash: string) {
    return this.findLicense('code_hash = $1', [codeHash]);
  }

  async findByCustomer(provider: string, customerId: string) {
    const { rows } = await this.pool.query<LicenseRow>(
      `SELECT ${LICENSE_COLUMNS} FROM licenses WHERE source = $1 AND provider_customer_id = $2 ORDER BY created_at`,
      [provider, customerId]
    );
    return rows.map(toLicense);
  }

  async setActivationCode(licenseId: string, codeHash: string, now: string) {
    await this.pool.query('UPDATE licenses SET code_hash = $2, code_issued_at = $3, updated_at = $3 WHERE id = $1', [
      licenseId,
      codeHash,
      now
    ]);
  }

  async setRevoked(licenseId: string, revokedAt: string | null, now: string) {
    await this.pool.query('UPDATE licenses SET revoked_at = $2, updated_at = $3 WHERE id = $1', [licenseId, revokedAt, now]);
  }

  async activeInstallations(licenseId: string) {
    const { rows } = await this.pool.query<InstallationRow>(
      'SELECT * FROM installations WHERE license_id = $1 AND deactivated_at IS NULL ORDER BY activated_at',
      [licenseId]
    );
    return rows.map(toInstallation);
  }

  async findInstallation(licenseId: string, installationId: string) {
    const { rows } = await this.pool.query<InstallationRow>(
      'SELECT * FROM installations WHERE license_id = $1 AND installation_id = $2',
      [licenseId, installationId]
    );
    return rows[0] ? toInstallation(rows[0]) : null;
  }

  async activateInstallation(request: ActivationRequest) {
    return this.transaction(async (client) => {
      // Locking the license serializes activations of the same license.
      await client.query('SELECT id FROM licenses WHERE id = $1 FOR UPDATE', [request.licenseId]);
      if (request.replaceInstallationId && request.replaceInstallationId !== request.installationId) {
        await client.query(
          `UPDATE installations SET deactivated_at = $3
           WHERE license_id = $1 AND installation_id = $2 AND deactivated_at IS NULL`,
          [request.licenseId, request.replaceInstallationId, request.now]
        );
      }
      const { rows } = await client.query<{ others: string; active: boolean }>(
        `SELECT
           count(*) FILTER (WHERE installation_id <> $2 AND deactivated_at IS NULL) AS others,
           bool_or(installation_id = $2 AND deactivated_at IS NULL) AS active
         FROM installations WHERE license_id = $1`,
        [request.licenseId, request.installationId]
      );
      const others = Number(rows[0]?.others ?? 0);
      const alreadyActive = rows[0]?.active === true;
      if (!alreadyActive && others >= request.maxActive) {
        return 'limit-reached' as const;
      }
      await client.query(
        `INSERT INTO installations (license_id, installation_id, secret_hash, activated_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (license_id, installation_id) DO UPDATE SET
           secret_hash = EXCLUDED.secret_hash,
           last_seen_at = EXCLUDED.last_seen_at,
           activated_at = CASE WHEN installations.deactivated_at IS NULL THEN installations.activated_at ELSE EXCLUDED.activated_at END,
           deactivated_at = NULL`,
        [request.licenseId, request.installationId, request.secretHash, request.now]
      );
      return 'activated' as const;
    });
  }

  async touchInstallation(licenseId: string, installationId: string, now: string) {
    await this.pool.query('UPDATE installations SET last_seen_at = $3 WHERE license_id = $1 AND installation_id = $2', [
      licenseId,
      installationId,
      now
    ]);
  }

  async deactivateInstallation(licenseId: string, installationId: string, now: string) {
    const result = await this.pool.query(
      `UPDATE installations SET deactivated_at = $3
       WHERE license_id = $1 AND installation_id = $2 AND deactivated_at IS NULL`,
      [licenseId, installationId, now]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async beginWebhookEvent(eventId: string, eventType: string, occurredAt: string, now: string) {
    const { rows } = await this.pool.query(
      `INSERT INTO webhook_events (event_id, event_type, occurred_at, received_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id) DO UPDATE SET received_at = EXCLUDED.received_at
       WHERE webhook_events.processed_at IS NULL
       RETURNING event_id`,
      [eventId, eventType, occurredAt, now]
    );
    return rows.length > 0 ? ('new' as const) : ('duplicate' as const);
  }

  async completeWebhookEvent(eventId: string, now: string) {
    await this.pool.query('UPDATE webhook_events SET processed_at = $2 WHERE event_id = $1', [eventId, now]);
  }

  async abandonWebhookEvent(eventId: string) {
    await this.pool.query('DELETE FROM webhook_events WHERE event_id = $1 AND processed_at IS NULL', [eventId]);
  }

  async createManualLicense(input: ManualLicenseInput, id: string, now: string) {
    const { rows } = await this.pool.query<LicenseRow>(
      `INSERT INTO licenses (id, source, manual_reason, manual_valid_until, support_note, created_at, updated_at)
       VALUES ($1, 'manual', $2, $3, $4, $5, $5)
       RETURNING ${LICENSE_COLUMNS}`,
      [id, input.reason, input.validUntil, input.note, now]
    );
    const [row] = rows;
    if (!row) throw new Error('The manual license was not created');
    return toLicense(row);
  }

  async listLicenses(filter: LicenseListFilter, range: { offset: number; limit: number }) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const where = (column: string, value: unknown) => {
      values.push(value);
      conditions.push(`${column} = $${values.length}`);
    };
    const searchColumns: Record<Exclude<LicenseSearch['kind'], 'recent'>, string> = {
      id: 'id::text',
      reference: "upper(left(replace(id::text, '-', ''), 10))",
      customer: 'provider_customer_id',
      subscription: 'provider_subscription_id'
    };
    if (filter.search.kind !== 'recent') where(searchColumns[filter.search.kind], filter.search.value);
    if (filter.source) where('source', filter.source);
    if (filter.providerStatus) where('provider_status', filter.providerStatus);
    if (filter.supportStatus) where('support_status', filter.supportStatus);
    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [page, count] = await Promise.all([
      this.pool.query<LicenseRow>(
        `SELECT ${LICENSE_COLUMNS} FROM licenses ${clause} ORDER BY updated_at DESC, id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, range.limit, range.offset]
      ),
      this.pool.query<{ total: string }>(`SELECT count(*) AS total FROM licenses ${clause}`, values)
    ]);
    return { items: page.rows.map(toLicense), total: Number(count.rows[0]?.total ?? 0) };
  }

  async installations(licenseId: string) {
    const { rows } = await this.pool.query<InstallationRow>('SELECT * FROM installations WHERE license_id = $1 ORDER BY activated_at DESC', [
      licenseId
    ]);
    return rows.map(toInstallation);
  }

  async updateSupport(licenseId: string, changes: SupportChanges, now: string) {
    const { rows } = await this.pool.query<LicenseRow>(
      `UPDATE licenses SET
         support_status = COALESCE($2, support_status),
         support_note = CASE WHEN $3 THEN $4 ELSE support_note END,
         updated_at = $5
       WHERE id = $1
       RETURNING ${LICENSE_COLUMNS}`,
      [licenseId, changes.supportStatus ?? null, changes.supportNote !== undefined, changes.supportNote ?? null, now]
    );
    return rows[0] ? toLicense(rows[0]) : null;
  }

  async updateManualValidity(licenseId: string, validUntil: string | null, now: string) {
    const { rows } = await this.pool.query<LicenseRow>(
      `UPDATE licenses SET manual_valid_until = $2, updated_at = $3
       WHERE id = $1 AND source = 'manual'
       RETURNING ${LICENSE_COLUMNS}`,
      [licenseId, validUntil, now]
    );
    return rows[0] ? toLicense(rows[0]) : null;
  }

  async appendAudit(entry: AuditEntry) {
    await this.pool.query(
      `INSERT INTO admin_audit_log (id, admin_subject, action, license_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.id, entry.adminSubject, entry.action, entry.licenseId, JSON.stringify(entry.metadata), entry.createdAt]
    );
  }

  async listAudit(licenseId: string, limit: number) {
    const { rows } = await this.pool.query<{
      id: string;
      admin_subject: string;
      action: string;
      license_id: string | null;
      metadata: AuditEntry['metadata'];
      created_at: Date;
    }>(
      `SELECT id, admin_subject, action, license_id, metadata, created_at FROM admin_audit_log
       WHERE license_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [licenseId, limit]
    );
    return rows.map((row) => ({
      id: row.id,
      adminSubject: row.admin_subject,
      action: row.action,
      licenseId: row.license_id,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString()
    }));
  }

  async ping() {
    await this.pool.query('SELECT 1');
  }

  async close() {
    await this.pool.end();
  }

  protected async findLicense(where: string, values: unknown[]): Promise<LicenseRecord | null> {
    const { rows } = await this.pool.query<LicenseRow>(`SELECT ${LICENSE_COLUMNS} FROM licenses WHERE ${where}`, values);
    return rows[0] ? toLicense(rows[0]) : null;
  }

  protected async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
