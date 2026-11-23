import { Injectable } from '@nestjs/common';
import { InMemoryDatabase } from './in-memory.store';
import {
  SettingsRepository,
  type StoreSettingsData,
} from './settings.repository';

@Injectable()
export class InMemorySettingsRepository extends SettingsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async get(): Promise<StoreSettingsData> {
    const settings = this.db.settings;
    return {
      freeDeliveryOffer: settings.freeDeliveryOffer,
      manualInstructions: { ...settings.manualInstructions },
      storeName: settings.storeName,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      deliveryFees: { ...settings.deliveryFees },
      loyaltyRules: { ...settings.loyaltyRules },
    };
  }

  async save(settings: StoreSettingsData): Promise<void> {
    this.db.settings.freeDeliveryOffer = settings.freeDeliveryOffer;
    this.db.settings.manualInstructions = {
      ...settings.manualInstructions,
    };
    this.db.settings.storeName = settings.storeName;
    this.db.settings.contactEmail = settings.contactEmail;
    this.db.settings.contactPhone = settings.contactPhone;
    this.db.settings.deliveryFees = { ...settings.deliveryFees };
    this.db.settings.loyaltyRules = { ...settings.loyaltyRules };
  }
}
