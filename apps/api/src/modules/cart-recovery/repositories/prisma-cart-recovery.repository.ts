import { Injectable } from '@nestjs/common';
import {
  DEFAULT_RECOVERY_SETTINGS,
  type AbandonedCart,
  type RecoveryAttempt,
  type RecoverySettings,
} from '@dostelo/types';
import type {
  AbandonedCart as AbandonedCartRow,
  RecoveryAttempt as RecoveryAttemptRow,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { recoveryConfig } from '../../../config/recovery.config';
import { DEFAULT_MANUAL_INSTRUCTIONS } from '../../../store/settings.repository';
import { date, fromEnum, iso, toEnum, toMoney } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import { CartRecoveryRepository } from './cart-recovery.repository';

const SETTINGS_ID = 'store';

/**
 * Prisma cart recovery repository over AbandonedCart,
 * RecoveryAttempt and RecoverySequenceStep. The recovery
 * settings' two scalars (abandonedAfterMinutes, tokenTtlDays)
 * live in the StoreSettings singleton's recoverySettings JSON;
 * the steps live in RecoverySequenceStep rows keyed by
 * stepNumber. First read seeds the same defaults the in-memory
 * repository seeds (environment config plus the default
 * sequence).
 */
@Injectable()
export class PrismaCartRecoveryRepository extends CartRecoveryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private toRecovery(row: AbandonedCartRow): AbandonedCart {
    return {
      id: row.id,
      cartId: row.cartId,
      customerId: row.customerId,
      visitorId: row.visitorId,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      contactEmail: row.contactEmail,
      contactBasis: row.contactBasis as AbandonedCart['contactBasis'],
      cartTotal: toMoney(row.cartTotalMinor, row.currency),
      itemCount: row.itemCount,
      status: fromEnum(row.status),
      closeReason: row.closeReason,
      recoveryToken: row.recoveryToken,
      tokenExpiresAt: iso(row.tokenExpiresAt),
      detectedAt: iso(row.detectedAt),
      lastActivityAt: iso(row.lastActivityAt),
      recoveredOrderNumber: row.recoveredOrderNumber,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private recoveryData(recovery: AbandonedCart) {
    return {
      cartId: recovery.cartId,
      customerId: recovery.customerId,
      visitorId: recovery.visitorId,
      contactName: recovery.contactName,
      contactPhone: recovery.contactPhone,
      contactEmail: recovery.contactEmail,
      contactBasis: recovery.contactBasis,
      cartTotalMinor: recovery.cartTotal.amountMinor,
      currency: recovery.cartTotal.currency,
      itemCount: recovery.itemCount,
      status: toEnum<AbandonedCartRow['status']>(recovery.status),
      closeReason: recovery.closeReason,
      recoveryToken: recovery.recoveryToken,
      tokenExpiresAt: date(recovery.tokenExpiresAt),
      detectedAt: date(recovery.detectedAt),
      lastActivityAt: date(recovery.lastActivityAt),
      recoveredOrderNumber: recovery.recoveredOrderNumber,
    };
  }

  async create(
    recovery: AbandonedCart,
    tx?: Tx,
  ): Promise<AbandonedCart> {
    const row = await this.db(tx).abandonedCart.create({
      data: {
        id: recovery.id,
        createdAt: date(recovery.createdAt),
        ...this.recoveryData(recovery),
      },
    });
    return this.toRecovery(row);
  }

  async save(recovery: AbandonedCart, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const existing = await db.abandonedCart.findUnique({
      where: { id: recovery.id },
    });
    if (!existing) {
      await this.create(recovery, tx);
      return;
    }
    await db.abandonedCart.update({
      where: { id: recovery.id },
      data: this.recoveryData(recovery),
    });
  }

  async findById(
    id: string,
    tx?: Tx,
  ): Promise<AbandonedCart | null> {
    const row = await this.db(tx).abandonedCart.findUnique({
      where: { id },
    });
    return row ? this.toRecovery(row) : null;
  }

  async findByCartId(
    cartId: string,
    tx?: Tx,
  ): Promise<AbandonedCart | null> {
    const row = await this.db(tx).abandonedCart.findUnique({
      where: { cartId },
    });
    return row ? this.toRecovery(row) : null;
  }

  async findByToken(
    token: string,
    tx?: Tx,
  ): Promise<AbandonedCart | null> {
    const row = await this.db(tx).abandonedCart.findUnique({
      where: { recoveryToken: token },
    });
    return row ? this.toRecovery(row) : null;
  }

  async list(tx?: Tx): Promise<AbandonedCart[]> {
    const rows = await this.db(tx).abandonedCart.findMany({
      orderBy: [{ detectedAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toRecovery(row));
  }

  async findOpenForCustomer(
    customerId: string,
    tx?: Tx,
  ): Promise<AbandonedCart[]> {
    const rows = await this.db(tx).abandonedCart.findMany({
      where: {
        customerId,
        status: { in: ['DETECTED', 'IN_RECOVERY'] },
      },
      orderBy: [{ detectedAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toRecovery(row));
  }

  private toAttempt(row: RecoveryAttemptRow): RecoveryAttempt {
    return {
      id: row.id,
      abandonedCartId: row.abandonedCartId,
      stepNumber: row.stepNumber,
      channel: fromEnum(row.channel),
      templateKey: row.templateKey,
      scheduledFor: iso(row.scheduledFor),
      executedAt: row.executedAt ? iso(row.executedAt) : null,
      status: fromEnum(row.status),
      outcome: row.outcome as RecoveryAttempt['outcome'],
      communicationLogId: row.communicationLogId,
      queueJobId: row.queueJobId,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private attemptData(attempt: RecoveryAttempt) {
    return {
      abandonedCartId: attempt.abandonedCartId,
      stepNumber: attempt.stepNumber,
      channel: toEnum<RecoveryAttemptRow['channel']>(attempt.channel),
      templateKey: attempt.templateKey,
      scheduledFor: date(attempt.scheduledFor),
      executedAt: attempt.executedAt ? date(attempt.executedAt) : null,
      status: toEnum<RecoveryAttemptRow['status']>(attempt.status),
      outcome: attempt.outcome,
      communicationLogId: attempt.communicationLogId,
      queueJobId: attempt.queueJobId,
    };
  }

  async createAttempt(
    attempt: RecoveryAttempt,
    tx?: Tx,
  ): Promise<RecoveryAttempt> {
    const row = await this.db(tx).recoveryAttempt.create({
      data: {
        id: attempt.id,
        createdAt: date(attempt.createdAt),
        ...this.attemptData(attempt),
      },
    });
    return this.toAttempt(row);
  }

  async saveAttempt(attempt: RecoveryAttempt, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const existing = await db.recoveryAttempt.findUnique({
      where: { id: attempt.id },
    });
    if (!existing) {
      await this.createAttempt(attempt, tx);
      return;
    }
    await db.recoveryAttempt.update({
      where: { id: attempt.id },
      data: this.attemptData(attempt),
    });
  }

  async findAttempt(
    id: string,
    tx?: Tx,
  ): Promise<RecoveryAttempt | null> {
    const row = await this.db(tx).recoveryAttempt.findUnique({
      where: { id },
    });
    return row ? this.toAttempt(row) : null;
  }

  async listAttempts(
    abandonedCartId: string,
    tx?: Tx,
  ): Promise<RecoveryAttempt[]> {
    const rows = await this.db(tx).recoveryAttempt.findMany({
      where: { abandonedCartId },
      orderBy: [{ stepNumber: 'asc' }],
    });
    return rows.map((row) => this.toAttempt(row));
  }

  async getSettings(tx?: Tx): Promise<RecoverySettings> {
    const db = this.db(tx);
    const [scalarsRow, stepRows] = await Promise.all([
      db.storeSettings.findUnique({ where: { id: SETTINGS_ID } }),
      db.recoverySequenceStep.findMany({
        orderBy: [{ stepNumber: 'asc' }],
      }),
    ]);
    const scalars = scalarsRow?.recoverySettings as {
      abandonedAfterMinutes?: number;
      tokenTtlDays?: number;
    } | null;
    if (scalars && stepRows.length > 0) {
      return {
        abandonedAfterMinutes: scalars.abandonedAfterMinutes ?? 60,
        tokenTtlDays: scalars.tokenTtlDays ?? 30,
        steps: stepRows.map((row) => ({
          stepNumber: row.stepNumber,
          delayMinutes: row.delayMinutes,
          channel: fromEnum(row.channel),
          templateKey: row.templateKey,
        })),
      };
    }
    const config = recoveryConfig();
    const seeded: RecoverySettings = {
      abandonedAfterMinutes: config.abandonedAfterMinutes,
      tokenTtlDays: config.tokenTtlDays,
      steps: DEFAULT_RECOVERY_SETTINGS.steps.map((step) => ({ ...step })),
    };
    await this.saveSettings(seeded, tx);
    return seeded;
  }

  async saveSettings(
    settings: RecoverySettings,
    tx?: Tx,
  ): Promise<void> {
    const db = this.db(tx);
    const scalars = {
      abandonedAfterMinutes: settings.abandonedAfterMinutes,
      tokenTtlDays: settings.tokenTtlDays,
    } as Prisma.InputJsonValue;
    await db.storeSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        freeDeliveryOffer: false,
        manualInstructions:
          DEFAULT_MANUAL_INSTRUCTIONS as Prisma.InputJsonValue,
        recoverySettings: scalars,
      },
      update: { recoverySettings: scalars },
    });
    await db.recoverySequenceStep.deleteMany({});
    for (const step of settings.steps) {
      await db.recoverySequenceStep.create({
        data: {
          stepNumber: step.stepNumber,
          delayMinutes: step.delayMinutes,
          channel: toEnum(step.channel),
          templateKey: step.templateKey,
        },
      });
    }
  }
}
