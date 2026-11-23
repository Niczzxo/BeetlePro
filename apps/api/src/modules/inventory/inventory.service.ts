import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { InventoryAdjust } from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import { AuditService } from '../audit/audit.service';
import {
  InventoryRepository,
  type StockView,
} from './repositories/inventory.repository';

@Injectable()
export class InventoryService {
  constructor(
    private readonly inventory: InventoryRepository,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private async toView(variantId: string): Promise<StockView> {
    const record = await this.inventory.getStock(variantId);
    if (!record) {
      throw new NotFoundException(`No stock for variant: ${variantId}`);
    }
    return {
      variantId,
      productId: record.productId,
      onHand: record.onHand,
      reserved: record.reserved,
      available: record.onHand - record.reserved,
    };
  }

  async getStock(variantId: string): Promise<StockView> {
    return this.toView(variantId);
  }

  async listStock(productId?: string): Promise<StockView[]> {
    return (await this.inventory.listStock(productId)).map((record) => ({
      variantId: record.variantId,
      productId: record.productId,
      onHand: record.onHand,
      reserved: record.reserved,
      available: record.onHand - record.reserved,
    }));
  }

  /** Staff adjustment, guarded at the route by inventory.adjust.
   * When an actor is supplied (the HTTP path), the adjustment is
   * written to the audit trail. */
  async adjust(
    variantId: string,
    dto: InventoryAdjust,
    actor?: AuthPrincipal | null,
  ): Promise<StockView> {
    await this.inventory.adjust(variantId, dto.delta);
    const view = await this.toView(variantId);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'inventory.adjusted',
        entityType: 'product-variant',
        entityId: variantId,
        metadata: {
          delta: dto.delta,
          reason: dto.reason ?? null,
          onHand: view.onHand,
          available: view.available,
        },
      });
    }
    return view;
  }

  /** Available quantity for cart and checkout validation. */
  async availableFor(variantId: string): Promise<number> {
    const record = await this.inventory.getStock(variantId);
    return record ? record.onHand - record.reserved : 0;
  }
}
