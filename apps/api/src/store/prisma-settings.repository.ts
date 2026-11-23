import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import {
  DEFAULT_STORE_SETTINGS,
  SettingsRepository,
  type StoreSettingsData,
} from './settings.repository';

const SETTINGS_ID = 'store';

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
      },
      update: {},
    });
    return {
      freeDeliveryOffer: row.freeDeliveryOffer,
      manualInstructions:
        (row.manualInstructions as StoreSettingsData['manualInstructions']) ??
        fallback.manualInstructions,
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
      },
      update: {
        freeDeliveryOffer: settings.freeDeliveryOffer,
        manualInstructions:
          settings.manualInstructions as Prisma.InputJsonValue,
      },
    });
  }
}
