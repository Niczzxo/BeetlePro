import { Injectable } from '@nestjs/common';
import {
  DEFAULT_POINTS_RULES,
  DEFAULT_SLA_TARGETS,
} from '@dostelo/types';
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
      returnWindowDays: settings.returnWindowDays ?? 30,
      automationLeadEvaluationEnabled:
        settings.automationLeadEvaluationEnabled ?? true,
      allowCod: settings.allowCod ?? true,
      storeLive: settings.storeLive ?? true,
      slaTargets: structuredClone(
        settings.slaTargets ?? DEFAULT_SLA_TARGETS,
      ),
      loyaltyPointRules: (
        settings.loyaltyPointRules ?? DEFAULT_POINTS_RULES
      ).map((rule) => ({ ...rule })),
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
    this.db.settings.returnWindowDays = settings.returnWindowDays;
    this.db.settings.automationLeadEvaluationEnabled =
      settings.automationLeadEvaluationEnabled;
    this.db.settings.allowCod = settings.allowCod;
    this.db.settings.storeLive = settings.storeLive;
    this.db.settings.slaTargets = settings.slaTargets;
    this.db.settings.loyaltyPointRules = settings.loyaltyPointRules;
  }
}
