import type {
  AbandonedCart,
  RecoveryAttempt,
  RecoverySettings,
} from '@dostelo/types';

/**
 * Cart recovery persistence seam (Phase 6). The Prisma
 * implementation maps to the AbandonedCart, RecoveryAttempt and
 * RecoverySequenceStep models in the database schema.
 */
export abstract class CartRecoveryRepository {
  abstract create(recovery: AbandonedCart): AbandonedCart;
  abstract save(recovery: AbandonedCart): void;
  abstract findById(id: string): AbandonedCart | null;
  abstract findByCartId(cartId: string): AbandonedCart | null;
  abstract findByToken(token: string): AbandonedCart | null;
  abstract list(): AbandonedCart[];
  /** Recoveries still open (detected or in-recovery) for a
   * customer, newest first. */
  abstract findOpenForCustomer(customerId: string): AbandonedCart[];
  abstract createAttempt(attempt: RecoveryAttempt): RecoveryAttempt;
  abstract saveAttempt(attempt: RecoveryAttempt): void;
  abstract findAttempt(id: string): RecoveryAttempt | null;
  abstract listAttempts(abandonedCartId: string): RecoveryAttempt[];
  /** The stored settings, seeding the defaults on first read. */
  abstract getSettings(): RecoverySettings;
  abstract saveSettings(settings: RecoverySettings): void;
}
