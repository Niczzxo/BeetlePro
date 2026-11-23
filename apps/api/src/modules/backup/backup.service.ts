import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  DataExportRecord,
  DataExportResult,
} from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import { SettingsRepository } from '../../store/settings.repository';
import { AuditService } from '../audit/audit.service';
import { CartRecoveryRepository } from '../cart-recovery/repositories/cart-recovery.repository';
import { CatalogRepository } from '../catalog/repositories/catalog.repository';
import { CustomersRepository } from '../customers/repositories/customers.repository';
import { LeadsRepository } from '../leads/repositories/leads.repository';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import { PaymentsRepository } from '../payments/repositories/payments.repository';
import { ShippingRepository } from '../shipping/repositories/shipping.repository';
import { BackupRepository } from './repositories/backup.repository';

/**
 * Backup and maintenance (admin master structure module 25),
 * export half: a staff-triggered JSON export of the platform's
 * core stores, produced by the API and returned to the
 * requester as the download. Customer records are exported in
 * their public shape: password hashes are stripped here, at the
 * one place exports are assembled. The export is not sent to
 * any external storage; no such integration exists and the
 * record says only what was exported and when.
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
  ) {}

  async createExport(
    actor?: AuthPrincipal | null,
  ): Promise<DataExportResult> {
    const storedCustomers = await this.customers.list();
    const customers = storedCustomers.map((stored) => {
      const { passwordHash: _passwordHash, ...publicCustomer } = stored;
      return publicCustomer;
    });
    const settings = await this.settings.get();
    const stores: Record<string, unknown[]> = {
      categories: await this.catalog.listCategories(),
      products: await this.catalog.listProducts(),
      customers,
      orders: await this.orders.listAll(),
      payments: await this.payments.list({}),
      leads: await this.leads.list(),
      abandonedCarts: await this.recovery.list(),
      shipments: await this.shipping.list({}),
    };
    const counts: Record<string, number> = {};
    for (const [name, rows] of Object.entries(stores)) {
      counts[name] = rows.length;
    }
    counts['settings'] = 1;
    const record: DataExportRecord = {
      id: randomUUID(),
      requestedById: actor?.id ?? null,
      counts,
      createdAt: new Date().toISOString(),
    };
    await this.backup.create(record);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'backup.exported',
        entityType: 'data-export',
        entityId: record.id,
        metadata: { counts },
      });
    }
    return {
      record,
      export: {
        exportedAt: record.createdAt,
        stores: {
          ...stores,
          settings: [settings] as unknown[],
        },
      },
    };
  }

  async listExports(): Promise<DataExportRecord[]> {
    return this.backup.list();
  }
}
