import type {
  AbandonedCart,
  RecoveryAttempt,
  RecoverySettings,
} from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

/**
 * Cart recovery persistence seam (Phase 6). The Prisma
 * implementation maps to the AbandonedCart, RecoveryAttempt and
 * RecoverySequenceStep models in the database schema.
 */
export abstract class CartRecoveryRepository {
  abstract create(
    recovery: AbandonedCart,
    tx?: Tx,
  ): Promise<AbandonedCart>;
  abstract save(recovery: AbandonedCart, tx?: Tx): Promise<void>;
  abstract findById(
    id: string,
    tx?: Tx,
  ): Promise<AbandonedCart | null>;
  abstract findByCartId(
    cartId: string,
    tx?: Tx,
  ): Promise<AbandonedCart | null>;
  abstract findByToken(
    token: string,
    tx?: Tx,
  ): Promise<AbandonedCart | null>;
  abstract list(tx?: Tx): Promise<AbandonedCart[]>;
  /** Recoveries still open (detected or in-recovery) for a
   * customer, newest first. */
  abstract findOpenForCustomer(
    customerId: string,
    tx?: Tx,
  ): Promise<AbandonedCart[]>;
  abstract createAttempt(
    attempt: RecoveryAttempt,
    tx?: Tx,
  ): Promise<RecoveryAttempt>;
  abstract saveAttempt(
    attempt: RecoveryAttempt,
    tx?: Tx,
  ): Promise<void>;
  abstract findAttempt(
    id: string,
    tx?: Tx,
  ): Promise<RecoveryAttempt | null>;
  abstract listAttempts(
    abandonedCartId: string,
    tx?: Tx,
  ): Promise<RecoveryAttempt[]>;
  /** The stored settings, seeding the defaults on first read. */
  abstract getSettings(tx?: Tx): Promise<RecoverySettings>;
  abstract saveSettings(
    settings: RecoverySettings,
    tx?: Tx,
  ): Promise<void>;
}
