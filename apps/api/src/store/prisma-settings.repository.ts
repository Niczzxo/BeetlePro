import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import {
  DEFAULT_STORE_SETTINGS,
  SettingsRepository,
  type StoreSettingsData,
} from './settings.repository';

const SETTINGS_ID = 'store';

/** The settings fields beyond the original pair, stored as one
 * JSON column (the recoverySettings precedent): the store
 * profile, the delivery fee table and the loyalty rules. */
type ExtendedSettings = Pick<
  StoreSettingsData,
  | 'storeName'
  | 'contactEmail'
  | 'contactPhone'
  | 'deliveryFees'
  | 'loyaltyRules'
  | 'returnWindowDays'
  | 'automationLeadEvaluationEnabled'
  | 'allowCod'
  | 'storeLive'
  | 'slaTargets'
  | 'loyaltyPointRules'
>;

function extendedFrom(
  settings: StoreSettingsData,
): ExtendedSettings {
  return {
    storeName: settings.storeName,
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone,
    deliveryFees: settings.deliveryFees,
    loyaltyRules: settings.loyaltyRules,
    returnWindowDays: settings.returnWindowDays,
    automationLeadEvaluationEnabled:
      settings.automationLeadEvaluationEnabled,
    allowCod: settings.allowCod,
    storeLive: settings.storeLive,
    slaTargets: settings.slaTargets,
    loyaltyPointRules: settings.loyaltyPointRules,
  };
}

/**
 * Prisma store settings over the StoreSettings singleton row
 * (id "store"). The row is created with the defaults on first
 * read, mirroring how the in-memory store initialises its
 * settings record.
 */
@Injectable()
export class PrismaSettingsRepository extends SettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  async get(tx?: Tx): Promise<StoreSettingsData> {
    const db = this.db(tx);
    const fallback = DEFAULT_STORE_SETTINGS;
    const row = await db.storeSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        freeDeliveryOffer: fallback.freeDeliveryOffer,
        manualInstructions:
          fallback.manualInstructions as Prisma.InputJsonValue,
        extendedSettings: extendedFrom(fallback) as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
    const extended = (row.extendedSettings as Partial<ExtendedSettings> | null) ?? {};
    return {
      freeDeliveryOffer: row.freeDeliveryOffer,
      manualInstructions:
        (row.manualInstructions as StoreSettingsData['manualInstructions']) ??
        fallback.manualInstructions,
      storeName: extended.storeName ?? fallback.storeName,
      contactEmail: extended.contactEmail ?? fallback.contactEmail,
      contactPhone: extended.contactPhone ?? fallback.contactPhone,
      deliveryFees: extended.deliveryFees ?? fallback.deliveryFees,
      loyaltyRules: extended.loyaltyRules ?? fallback.loyaltyRules,
      returnWindowDays:
        extended.returnWindowDays ?? fallback.returnWindowDays,
      automationLeadEvaluationEnabled:
        extended.automationLeadEvaluationEnabled ??
        fallback.automationLeadEvaluationEnabled,
      allowCod: extended.allowCod ?? fallback.allowCod,
      storeLive: extended.storeLive ?? fallback.storeLive,
      slaTargets: extended.slaTargets ?? fallback.slaTargets,
      loyaltyPointRules:
        extended.loyaltyPointRules ?? fallback.loyaltyPointRules,
    };
  }

  async save(settings: StoreSettingsData, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    await db.storeSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        freeDeliveryOffer: settings.freeDeliveryOffer,
        manualInstructions:
          settings.manualInstructions as Prisma.InputJsonValue,
        extendedSettings: extendedFrom(settings) as unknown as Prisma.InputJsonValue,
      },
      update: {
        freeDeliveryOffer: settings.freeDeliveryOffer,
        manualInstructions:
          settings.manualInstructions as Prisma.InputJsonValue,
        extendedSettings: extendedFrom(settings) as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
