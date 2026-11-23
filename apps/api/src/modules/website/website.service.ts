import { Injectable, Optional } from '@nestjs/common';
import type { StoreSettingsView } from '@dostelo/types';
import type { StoreSettingsUpdate } from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  SettingsRepository,
  type StoreSettingsData,
} from '../../store/settings.repository';
import { AuditService } from '../audit/audit.service';

/**
 * Website and storefront management over the settings seam
 * (admin master structure module 19). The settings record is the
 * one source for the store profile, the free delivery offer
 * switch, the delivery fee table checkout charges, the manual
 * payment instructions and the loyalty rules (edited in the
 * Loyalty module). Updates merge over the stored record, so a
 * section can be saved without resending the rest.
 */
@Injectable()
export class WebsiteService {
  constructor(
    private readonly settings: SettingsRepository,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async getSettings(): Promise<StoreSettingsView> {
    const settings = await this.settings.get();
    return this.toView(settings);
  }

  async updateSettings(
    dto: StoreSettingsUpdate,
    actor?: AuthPrincipal | null,
  ): Promise<StoreSettingsView> {
    const current = await this.settings.get();
    const next: StoreSettingsData = {
      ...current,
      ...(dto.storeName !== undefined
        ? { storeName: dto.storeName }
        : {}),
      ...(dto.contactEmail !== undefined
        ? { contactEmail: dto.contactEmail }
        : {}),
      ...(dto.contactPhone !== undefined
        ? { contactPhone: dto.contactPhone }
        : {}),
      ...(dto.freeDeliveryOffer !== undefined
        ? { freeDeliveryOffer: dto.freeDeliveryOffer }
        : {}),
      ...(dto.deliveryFees !== undefined
        ? { deliveryFees: dto.deliveryFees }
        : {}),
      ...(dto.manualInstructions !== undefined
        ? { manualInstructions: dto.manualInstructions }
        : {}),
    };
    await this.settings.save(next);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'store-settings.updated',
        entityType: 'settings',
        entityId: 'store',
        metadata: {
          fields: Object.keys(dto),
          freeDeliveryOffer: next.freeDeliveryOffer,
          deliveryFees: next.deliveryFees,
        },
      });
    }
    return this.toView(next);
  }

  private toView(settings: StoreSettingsData): StoreSettingsView {
    return {
      storeName: settings.storeName,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      freeDeliveryOffer: settings.freeDeliveryOffer,
      deliveryFees: settings.deliveryFees,
      manualInstructions: settings.manualInstructions,
      loyaltyRules: settings.loyaltyRules,
    };
  }
}
