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
    return {
      freeDeliveryOffer: this.db.settings.freeDeliveryOffer,
      manualInstructions: { ...this.db.settings.manualInstructions },
    };
  }

  async save(settings: StoreSettingsData): Promise<void> {
    this.db.settings.freeDeliveryOffer = settings.freeDeliveryOffer;
    this.db.settings.manualInstructions = {
      ...settings.manualInstructions,
    };
  }
}
