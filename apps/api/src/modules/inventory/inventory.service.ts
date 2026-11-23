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

  private toView(variantId: string): StockView {
    const record = this.inventory.getStock(variantId);
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

  getStock(variantId: string): StockView {
    return this.toView(variantId);
  }

  listStock(productId?: string): StockView[] {
    return this.inventory
      .listStock(productId)
      .map((record) => ({
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
  adjust(
    variantId: string,
    dto: InventoryAdjust,
    actor?: AuthPrincipal | null,
  ): StockView {
    this.inventory.adjust(variantId, dto.delta);
    const view = this.toView(variantId);
    if (actor && this.audit) {
      this.audit.recordForPrincipal(actor, {
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
  availableFor(variantId: string): number {
    const record = this.inventory.getStock(variantId);
    return record ? record.onHand - record.reserved : 0;
  }
}
