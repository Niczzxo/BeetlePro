import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type {
  BackupSummary,
  DataExportRecord,
  DataExportResult,
  MaintenanceResult,
  StoredBackup,
  SystemHealth,
} from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsRepository } from '../../store/settings.repository';
import { AuditService } from '../audit/audit.service';
import { CartRecoveryRepository } from '../cart-recovery/repositories/cart-recovery.repository';
import { CatalogRepository } from '../catalog/repositories/catalog.repository';
import { CustomersRepository } from '../customers/repositories/customers.repository';
import { IntegrationsService } from '../integrations/integrations.service';
import { LeadsRepository } from '../leads/repositories/leads.repository';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import { PaymentsRepository } from '../payments/repositories/payments.repository';
import { ShippingRepository } from '../shipping/repositories/shipping.repository';
import { BackupRepository } from './repositories/backup.repository';

/** Collections an export can include, in document order. */
export const EXPORT_COLLECTIONS = [
  'categories',
  'products',
  'customers',
  'orders',
  'payments',
  'leads',
  'abandonedCarts',
  'shipments',
  'settings',
] as const;

/** How many stored backups the create flow keeps. */
export const BACKUP_RETENTION_KEEP = 10;

/**
 * Backup and maintenance (admin master structure module 25,
 * redesign). Exports keep the original schema and contents
 * exactly: catalogue, customers with password hashes stripped
 * at this one assembly point, orders, payments, leads and
 * recovery records, shipments, store settings. A selective
 * export filters the same schema by collection.
 *
 * Backups are the same snapshot stored server-side in the
 * application database with a SHA-256 checksum; downloads
 * verify the checksum before serving. Retention keeps the
 * newest BACKUP_RETENTION_KEEP backups and prunes the rest,
 * audited. Restore is deliberately NOT implemented: applying a
 * snapshot safely needs per-collection transactional writes
 * with a safety backup first, and a partial restore is worse
 * than none, so the summary reports it unavailable.
 *
 * Maintenance offers only real operations: a health check
 * (database connectivity and latency in Prisma mode, Redis
 * configuration presence, integration summary, uptime) and a
 * database ANALYZE in Prisma mode. There is no application
 * cache namespace to flush and no search index to rebuild, so
 * neither action exists here.
 */
@Injectable()
export class BackupService {
  constructor(
    private readonly backup: BackupRepository,
    private readonly catalog: CatalogRepository,
    private readonly customers: CustomersRepository,
    private readonly orders: OrdersRepository,
    private readonly payments: PaymentsRepository,
    private readonly leads: LeadsRepository,
    private readonly recovery: CartRecoveryRepository,
    private readonly shipping: ShippingRepository,
    private readonly settings: SettingsRepository,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly integrations?: IntegrationsService,
  ) {}

  private async buildDocument(
    collections?: string[],
  ): Promise<{
    document: DataExportResult['export'];
    counts: Record<string, number>;
    included: string[];
  }> {
    const wanted = new Set(
      (collections && collections.length > 0
        ? collections
        : [...EXPORT_COLLECTIONS]
      ).filter((name) =>
        (EXPORT_COLLECTIONS as readonly string[]).includes(name),
      ),
    );
    const storedCustomers = await this.customers.list();
    const customers = storedCustomers.map((stored) => {
      const { passwordHash: _passwordHash, ...publicCustomer } = stored;
      return publicCustomer;
    });
    const settings = await this.settings.get();
    const all: Record<string, unknown[]> = {
      categories: await this.catalog.listCategories(),
      products: await this.catalog.listProducts(),
      customers,
      orders: await this.orders.listAll(),
      payments: await this.payments.list({}),
      leads: await this.leads.list(),
      abandonedCarts: await this.recovery.list(),
      shipments: await this.shipping.list({}),
      settings: [settings] as unknown[],
    };
    const stores: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const name of EXPORT_COLLECTIONS) {
      if (!wanted.has(name)) continue;
      stores[name] = all[name]!;
      counts[name] = all[name]!.length;
    }
    return {
      document: { exportedAt: new Date().toISOString(), stores },
      counts,
      included: Object.keys(stores),
    };
  }

  async createExport(
    actor?: AuthPrincipal | null,
    collections?: string[],
  ): Promise<DataExportResult> {
    const { document, counts, included } =
      await this.buildDocument(collections);
    const byteSize = Buffer.byteLength(JSON.stringify(document), 'utf8');
    const record: DataExportRecord = {
      id: randomUUID(),
      requestedById: actor?.id ?? null,
      counts,
      collections: included,
      byteSize,
      createdAt: document.exportedAt,
    };
    await this.backup.create(record);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'backup.exported',
        entityType: 'data-export',
        entityId: record.id,
        metadata: { counts, collections: included, byteSize },
      });
    }
    return { record, export: document };
  }

  async listExports(): Promise<DataExportRecord[]> {
    return this.backup.list();
  }

  /** Create a stored backup: the full snapshot, checksummed,
   * kept in the database, with retention pruning after. */
  async createBackup(
    actor?: AuthPrincipal | null,
  ): Promise<StoredBackup> {
    const { document, counts, included } = await this.buildDocument();
    const snapshot = JSON.stringify(document);
    const checksum = createHash('sha256').update(snapshot).digest('hex');
    const record = {
      id: randomUUID(),
      createdById: actor?.id ?? null,
      byteSize: Buffer.byteLength(snapshot, 'utf8'),
      checksum,
      collections: included,
      snapshot,
      createdAt: document.exportedAt,
    };
    await this.backup.createStoredBackup(record);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'backup.created',
        entityType: 'stored-backup',
        entityId: record.id,
        metadata: { counts, byteSize: record.byteSize, checksum },
      });
    }
    await this.pruneBackups(actor);
    const view = (await this.backup.listStoredBackups()).find(
      (entry) => entry.id === record.id,
    );
    return (
      view ?? {
        id: record.id,
        createdById: record.createdById,
        byteSize: record.byteSize,
        checksum,
        status: 'ready',
        collections: included,
        createdAt: record.createdAt,
      }
    );
  }

  private async pruneBackups(
    actor?: AuthPrincipal | null,
  ): Promise<void> {
    const backups = await this.backup.listStoredBackups();
    const excess = backups.slice(BACKUP_RETENTION_KEEP);
    for (const old of excess) {
      await this.backup.deleteStoredBackup(old.id);
      if (actor && this.audit) {
        await this.audit.recordForPrincipal(actor, {
          action: 'backup.pruned',
          entityType: 'stored-backup',
          entityId: old.id,
          metadata: { retentionKeep: BACKUP_RETENTION_KEEP },
        });
      }
    }
  }

  async listBackups(): Promise<StoredBackup[]> {
    return this.backup.listStoredBackups();
  }

  /** Download a stored snapshot. The checksum is verified
   * against the stored bytes first; a mismatch refuses the
   * download and is audited. */
  async downloadBackup(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<{ filename: string; content: string; backup: StoredBackup }> {
    const record = await this.backup.findStoredBackup(id);
    if (!record) {
      throw new NotFoundException(`Backup not found: ${id}`);
    }
    const actual = createHash('sha256')
      .update(record.snapshot)
      .digest('hex');
    if (actual !== record.checksum) {
      if (actor && this.audit) {
        await this.audit.recordForPrincipal(actor, {
          action: 'backup.checksum-mismatch',
          entityType: 'stored-backup',
          entityId: id,
          metadata: { expected: record.checksum, actual },
        });
      }
      throw new BadRequestException(
        'Backup checksum mismatch: the stored snapshot does not match its recorded checksum, so it will not be served.',
      );
    }
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'backup.downloaded',
        entityType: 'stored-backup',
        entityId: id,
        metadata: { byteSize: record.byteSize },
      });
    }
    return {
      filename: `dostelo-backup-${record.createdAt.slice(0, 10)}-${record.id.slice(0, 8)}.json`,
      content: record.snapshot,
      backup: {
        id: record.id,
        createdById: record.createdById,
        byteSize: record.byteSize,
        checksum: record.checksum,
        status: 'ready',
        collections: record.collections,
        createdAt: record.createdAt,
      },
    };
  }

  async deleteBackup(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<{ deleted: boolean }> {
    const deleted = await this.backup.deleteStoredBackup(id);
    if (!deleted) {
      throw new NotFoundException(`Backup not found: ${id}`);
    }
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'backup.deleted',
        entityType: 'stored-backup',
        entityId: id,
        metadata: {},
      });
    }
    return { deleted: true };
  }

  async summary(): Promise<BackupSummary> {
    const [backups, exports] = await Promise.all([
      this.backup.listStoredBackups(),
      this.backup.list(),
    ]);
    const lastBackup = backups[0] ?? null;
    const lastExport = exports[0] ?? null;
    const candidates = [
      lastBackup ? { at: lastBackup.createdAt, bytes: lastBackup.byteSize } : null,
      lastExport ? { at: lastExport.createdAt, bytes: lastExport.byteSize } : null,
    ].filter((entry): entry is { at: string; bytes: number } => entry !== null);
    candidates.sort((a, b) => b.at.localeCompare(a.at));
    return {
      totalBackups: backups.length,
      totalExports: exports.length,
      lastBackupAt: lastBackup?.createdAt ?? null,
      lastArtifactBytes: candidates[0]?.bytes ?? null,
      storedBackupBytes: backups.reduce(
        (sum, entry) => sum + entry.byteSize,
        0,
      ),
      retentionKeep: BACKUP_RETENTION_KEEP,
      storageNote:
        'Backups are stored as snapshots in the application database on the API host. No external backup storage is connected.',
      restoreAvailable: false,
      restoreNote:
        'Restore is not available in this pass: a safe restore needs a pre-restore safety backup and per-collection transactional writes, and a partial restore is worse than none.',
    };
  }

  async health(): Promise<SystemHealth> {
    const mode = process.env.DATABASE_URL ? 'prisma' : 'in-memory';
    let connected: boolean | null = null;
    let latencyMs: number | null = null;
    if (mode === 'prisma' && this.prisma) {
      const started = Date.now();
      try {
        await this.prisma.client.$queryRaw`SELECT 1`;
        connected = true;
        latencyMs = Date.now() - started;
      } catch {
        connected = false;
        latencyMs = Date.now() - started;
      }
    }
    const statuses = this.integrations?.status() ?? [];
    return {
      checkedAt: new Date().toISOString(),
      database: { mode, connected, latencyMs },
      redisConfigured: Boolean(process.env.REDIS_URL),
      integrationsConfigured: statuses.filter((s) => s.configured).length,
      integrationsTotal: statuses.length,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  /** Run one real maintenance operation. Health is a read;
   * optimize runs ANALYZE against PostgreSQL in Prisma mode and
   * honestly reports unavailable in in-memory mode. */
  async runMaintenance(
    action: string,
    actor?: AuthPrincipal | null,
  ): Promise<MaintenanceResult> {
    const ranAt = new Date().toISOString();
    let result: MaintenanceResult;
    if (action === 'health') {
      const health = await this.health();
      result = {
        action: 'health',
        status: 'completed',
        detail:
          health.database.mode === 'prisma'
            ? `Database ${health.database.connected ? 'connected' : 'unreachable'} (${health.database.latencyMs ?? 0} ms). Redis ${health.redisConfigured ? 'configured' : 'not configured'}. Integrations ${health.integrationsConfigured} of ${health.integrationsTotal} configured. Uptime ${health.uptimeSeconds} seconds.`
            : `In-memory mode: no database connection to test. Redis ${health.redisConfigured ? 'configured' : 'not configured'}. Integrations ${health.integrationsConfigured} of ${health.integrationsTotal} configured. Uptime ${health.uptimeSeconds} seconds.`,
        ranAt,
      };
    } else if (action === 'optimize-database') {
      if (process.env.DATABASE_URL && this.prisma) {
        await this.prisma.client.$executeRawUnsafe('ANALYZE');
        result = {
          action: 'optimize-database',
          status: 'completed',
          detail:
            'ANALYZE completed: PostgreSQL table statistics are refreshed.',
          ranAt,
        };
      } else {
        result = {
          action: 'optimize-database',
          status: 'unavailable',
          detail:
            'Unavailable in in-memory mode: there is no PostgreSQL database to optimize.',
          ranAt,
        };
      }
    } else {
      throw new BadRequestException(
        `Unknown maintenance action: ${action}. Available: health, optimize-database.`,
      );
    }
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'backup.maintenance-run',
        entityType: 'maintenance',
        entityId: action,
        metadata: { status: result.status, detail: result.detail },
      });
    }
    return result;
  }
}
