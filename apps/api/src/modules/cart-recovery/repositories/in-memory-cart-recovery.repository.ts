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

  create(recovery: AbandonedCart): AbandonedCart {
    this.db.abandonedCarts.set(recovery.id, recovery);
    return recovery;
  }

  save(recovery: AbandonedCart): void {
    this.db.abandonedCarts.set(recovery.id, recovery);
  }

  findById(id: string): AbandonedCart | null {
    return this.db.abandonedCarts.get(id) ?? null;
  }

  findByCartId(cartId: string): AbandonedCart | null {
    for (const recovery of this.db.abandonedCarts.values()) {
      if (recovery.cartId === cartId) return recovery;
    }
    return null;
  }

  findByToken(token: string): AbandonedCart | null {
    for (const recovery of this.db.abandonedCarts.values()) {
      if (recovery.recoveryToken === token) return recovery;
    }
    return null;
  }

  list(): AbandonedCart[] {
    return [...this.db.abandonedCarts.values()].sort((a, b) =>
      b.detectedAt.localeCompare(a.detectedAt),
    );
  }

  findOpenForCustomer(customerId: string): AbandonedCart[] {
    return this.list().filter(
      (recovery) =>
        recovery.customerId === customerId &&
        (recovery.status === 'detected' ||
          recovery.status === 'in-recovery'),
    );
  }

  createAttempt(attempt: RecoveryAttempt): RecoveryAttempt {
    this.db.recoveryAttempts.set(attempt.id, attempt);
    return attempt;
  }

  saveAttempt(attempt: RecoveryAttempt): void {
    this.db.recoveryAttempts.set(attempt.id, attempt);
  }

  findAttempt(id: string): RecoveryAttempt | null {
    return this.db.recoveryAttempts.get(id) ?? null;
  }

  listAttempts(abandonedCartId: string): RecoveryAttempt[] {
    return [...this.db.recoveryAttempts.values()]
      .filter((attempt) => attempt.abandonedCartId === abandonedCartId)
      .sort((a, b) => a.stepNumber - b.stepNumber);
  }

  getSettings(): RecoverySettings {
    if (!this.db.recoverySettings) {
      const config = recoveryConfig();
      this.db.recoverySettings = {
        abandonedAfterMinutes: config.abandonedAfterMinutes,
        tokenTtlDays: config.tokenTtlDays,
        steps: DEFAULT_RECOVERY_SETTINGS.steps.map((step) => ({
          ...step,
        })),
      };
    }
    return this.db.recoverySettings;
  }

  saveSettings(settings: RecoverySettings): void {
    this.db.recoverySettings = settings;
  }
}
