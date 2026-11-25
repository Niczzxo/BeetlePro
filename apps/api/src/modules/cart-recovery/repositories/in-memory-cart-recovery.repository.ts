import { Injectable } from '@nestjs/common';
import {
  DEFAULT_RECOVERY_SETTINGS,
  type AbandonedCart,
  type RecoveryAttempt,
  type RecoverySettings,
} from '@dostelo/types';
import { recoveryConfig } from '../../../config/recovery.config';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import { CartRecoveryRepository } from './cart-recovery.repository';

@Injectable()
export class InMemoryCartRecoveryRepository extends CartRecoveryRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async create(recovery: AbandonedCart): Promise<AbandonedCart> {
    this.db.abandonedCarts.set(recovery.id, recovery);
    return recovery;
  }

  async save(recovery: AbandonedCart): Promise<void> {
    this.db.abandonedCarts.set(recovery.id, recovery);
  }

  async findById(id: string): Promise<AbandonedCart | null> {
    return this.db.abandonedCarts.get(id) ?? null;
  }

  async findByCartId(cartId: string): Promise<AbandonedCart | null> {
    for (const recovery of this.db.abandonedCarts.values()) {
      if (recovery.cartId === cartId) return recovery;
    }
    return null;
  }

  async findByToken(token: string): Promise<AbandonedCart | null> {
    for (const recovery of this.db.abandonedCarts.values()) {
      if (recovery.recoveryToken === token) return recovery;
    }
    return null;
  }

  async list(): Promise<AbandonedCart[]> {
    return [...this.db.abandonedCarts.values()].sort((a, b) =>
      b.detectedAt.localeCompare(a.detectedAt),
    );
  }

  async findOpenForCustomer(customerId: string): Promise<AbandonedCart[]> {
    return (await this.list()).filter(
      (recovery) =>
        recovery.customerId === customerId &&
        (recovery.status === 'detected' ||
          recovery.status === 'in-recovery'),
    );
  }

  async createAttempt(attempt: RecoveryAttempt): Promise<RecoveryAttempt> {
    this.db.recoveryAttempts.set(attempt.id, attempt);
    return attempt;
  }

  async saveAttempt(attempt: RecoveryAttempt): Promise<void> {
    this.db.recoveryAttempts.set(attempt.id, attempt);
  }

  async findAttempt(id: string): Promise<RecoveryAttempt | null> {
    return this.db.recoveryAttempts.get(id) ?? null;
  }

  async listAttempts(abandonedCartId: string): Promise<RecoveryAttempt[]> {
    return [...this.db.recoveryAttempts.values()]
      .filter((attempt) => attempt.abandonedCartId === abandonedCartId)
      .sort((a, b) => a.stepNumber - b.stepNumber);
  }

  async getSettings(): Promise<RecoverySettings> {
    if (!this.db.recoverySettings) {
      const config = recoveryConfig();
      this.db.recoverySettings = {
        enabled: true,
        sequenceEnabled: true,
        abandonedAfterMinutes: config.abandonedAfterMinutes,
        tokenTtlDays: config.tokenTtlDays,
        steps: DEFAULT_RECOVERY_SETTINGS.steps.map((step) => ({
          ...step,
        })),
      };
    }
    return this.db.recoverySettings;
  }

  async saveSettings(settings: RecoverySettings): Promise<void> {
    this.db.recoverySettings = settings;
  }
}
