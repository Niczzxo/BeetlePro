import {
  BadRequestException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  money,
  type AbandonedCart,
  type Cart,
  type CommunicationLog,
  type LeadContactBasis,
  type Money,
  type RecoveryAttempt,
  type RecoveryCartView,
  type RecoverySettings,
  type RecoveryStep,
} from '@dostelo/types';
import type { RecoverySettingsUpdate } from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import { recoveryConfig } from '../../config/recovery.config';
import type { StoredCustomer } from '../../store/in-memory.store';
import { AuditService } from '../audit/audit.service';
import { CatalogRepository } from '../catalog/repositories/catalog.repository';
import { CartsService } from '../carts/carts.service';
import { CartsRepository } from '../carts/repositories/carts.repository';
import { CommunicationsService } from '../communications/communications.service';
import { findTemplate } from '../communications/templates/message-templates';
import { CustomersService } from '../customers/customers.service';
import { JobQueue } from '../jobs/job-queue';
import { VisitorsService } from '../visitors/visitors.service';
import { CartRecoveryRepository } from './repositories/cart-recovery.repository';

export interface AbandonedCartDetail {
  recovery: AbandonedCart;
  attempts: RecoveryAttempt[];
  communications: CommunicationLog[];
}

export interface ScanResult {
  detected: number;
  closed: number;
}

export interface RecoveredOrderInput {
  customerId: string;
  cartId: string | null;
  orderNumber: string;
  lines: { variantId: string; quantity: number }[];
}

interface ResolvedContact {
  customerId: string;
  visitorId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  basis: LeadContactBasis;
}

const OPEN_STATUSES: AbandonedCart['status'][] = [
  'detected',
  'in-recovery',
];

/**
 * Abandoned Cart Recovery (Phase 6), following the workflow in
 * docs/ADMIN_PORTAL.md.
 *
 * Detection: a cart is abandoned when it still holds items, is
 * not converted, has been inactive for at least the configured
 * threshold (stored settings, seeded from
 * CART_ABANDONED_AFTER_MINUTES), and has a contact path: a
 * customer on the cart, or a tracked visitor session (the cart's
 * session token) already linked to a customer. A cart with no
 * contact path is never flagged: there is nobody the store may
 * contact. The cart's own status is left 'active' so a returning
 * customer can still check out with it; the AbandonedCart record
 * is the recovery state.
 *
 * Sequence: the stored steps run through the JobQueue seam, one
 * job per attempt, so cancellation is deterministic. Each step
 * sends through the CommunicationsService, which enforces
 * suppression and consent and records the honest outcome
 * (including not-configured providers). A suppression or consent
 * refusal stops the sequence: the person said no, and later
 * steps would only be refused again. A missing address for one
 * channel does not stop later steps on other channels.
 *
 * Recovery: checkout calls markRecoveredForOrder after placing
 * an order. A recovery matches when the order came from the
 * recovery's cart, or when the same customer's order covers every
 * line of the recovery's cart. Matching cancels every pending
 * step, so a customer who buys is never chased.
 */
@Injectable()
export class CartRecoveryService implements OnModuleInit {
  constructor(
    private readonly recovery: CartRecoveryRepository,
    private readonly carts: CartsRepository,
    private readonly cartsService: CartsService,
    private readonly catalog: CatalogRepository,
    private readonly customers: CustomersService,
    private readonly visitors: VisitorsService,
    private readonly communications: CommunicationsService,
    private readonly queue: JobQueue,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.registerJobs();
    // The recurring detection scan: the handler re-arms itself,
    // so the worker runs for the life of the process. The staff
    // scan endpoint runs the same scan on demand.
    const config = recoveryConfig();
    this.queue.enqueue(
      'cart-recovery.scan',
      {},
      {
        delayMs: config.scanIntervalMinutes * 60_000,
        jobId: 'cart-recovery.scan.recurring',
      },
    );
  }

  /** Registers the queue processors. Split from onModuleInit so
   * tests can wire the same processors onto a fake-clock queue. */
  registerJobs(): void {
    this.queue.registerProcessor(
      'cart-recovery.scan',
      async () => {
        await this.scan();
        const config = recoveryConfig();
        this.queue.enqueue(
          'cart-recovery.scan',
          {},
          {
            delayMs: config.scanIntervalMinutes * 60_000,
            jobId: 'cart-recovery.scan.recurring',
          },
        );
      },
    );
    this.queue.registerProcessor(
      'cart-recovery.execute-step',
      async (payload: {
        abandonedCartId: string;
        stepNumber: number;
      }) => {
        await this.executeStep(payload.abandonedCartId, payload.stepNumber);
      },
    );
  }

  // -- Detection ---------------------------------------------------

  /**
   * Scans every cart once. Idempotent: a cart with an open
   * recovery is not re-detected, but its recovery is closed when
   * the cart was emptied, and marked recovered when the cart
   * converted through a path that did not notify recovery.
   */
  async scan(nowMs: number = Date.now()): Promise<ScanResult> {
    const settings = this.recovery.getSettings();
    const thresholdMs = settings.abandonedAfterMinutes * 60_000;
    let detected = 0;
    let closed = 0;

    for (const cart of this.carts.list()) {
      const existing = this.recovery.findByCartId(cart.id);
      if (existing && OPEN_STATUSES.includes(existing.status)) {
        if (cart.status === 'converted') {
          this.applyRecovered(existing, null);
        } else if (cart.items.length === 0) {
          this.applyClosed(existing, 'cart-emptied');
          closed += 1;
        }
        continue;
      }
      if (existing) continue;
      if (cart.status === 'converted') continue;
      if (cart.items.length === 0) continue;
      const inactiveMs = nowMs - Date.parse(cart.updatedAt);
      if (inactiveMs < thresholdMs) continue;
      const contact = this.resolveContact(cart);
      if (!contact) continue;

      const now = new Date(nowMs).toISOString();
      const view = this.cartsService.toView(cart);
      const recovery: AbandonedCart = {
        id: randomUUID(),
        cartId: cart.id,
        customerId: contact.customerId,
        visitorId: contact.visitorId,
        contactName: contact.name,
        contactPhone: contact.phone,
        contactEmail: contact.email,
        contactBasis: contact.basis,
        cartTotal: view.subtotal,
        itemCount: cart.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
        status: 'detected',
        closeReason: null,
        recoveryToken: randomBytes(24).toString('base64url'),
        tokenExpiresAt: new Date(
          nowMs + settings.tokenTtlDays * 24 * 60 * 60_000,
        ).toISOString(),
        detectedAt: now,
        lastActivityAt: cart.updatedAt,
        recoveredOrderNumber: null,
        createdAt: now,
        updatedAt: now,
      };
      this.recovery.create(recovery);
      detected += 1;
      this.audit.record({
        actorType: 'system',
        actorId: null,
        action: 'cart-recovery.detected',
        entityType: 'abandoned-cart',
        entityId: recovery.id,
        metadata: {
          cartId: cart.id,
          customerId: contact.customerId,
          itemCount: recovery.itemCount,
          totalMinor: recovery.cartTotal.amountMinor,
        },
      });
      const firstStep = settings.steps
        .slice()
        .sort((a, b) => a.stepNumber - b.stepNumber)[0];
      if (firstStep) {
        this.scheduleStep(recovery, firstStep, nowMs);
      } else {
        this.applyClosed(recovery, 'sequence-exhausted');
      }
    }
    return { detected, closed };
  }

  // -- Step execution ------------------------------------------------

  /**
   * Executes one scheduled step. Called by the queue processor
   * and by the staff run-step endpoint. Late firings against a
   * finished recovery are harmless no-ops.
   */
  async executeStep(
    abandonedCartId: string,
    stepNumber: number,
  ): Promise<void> {
    const recovery = this.recovery.findById(abandonedCartId);
    if (!recovery || !OPEN_STATUSES.includes(recovery.status)) {
      return;
    }
    const attempt = this.recovery
      .listAttempts(abandonedCartId)
      .find(
        (item) =>
          item.stepNumber === stepNumber && item.status === 'scheduled',
      );
    if (!attempt) return;
    attempt.queueJobId = null;

    const cart = this.carts.findById(recovery.cartId);
    if (!cart || cart.status === 'converted') {
      attempt.status = 'skipped';
      this.recovery.saveAttempt(attempt);
      this.applyRecovered(recovery, null);
      return;
    }
    if (cart.items.length === 0) {
      attempt.status = 'skipped';
      this.recovery.saveAttempt(attempt);
      this.applyClosed(recovery, 'cart-emptied');
      return;
    }

    const settings = this.recovery.getSettings();
    const step = settings.steps.find(
      (item) => item.stepNumber === stepNumber,
    );
    const channel = step?.channel ?? attempt.channel;
    const to =
      channel === 'email' ? recovery.contactEmail : recovery.contactPhone;

    let outcome: RecoveryAttempt['outcome'];
    let communicationLogId: string | null = null;
    if (!to) {
      outcome = 'skipped-no-contact';
      attempt.status = 'executed';
      attempt.executedAt = new Date().toISOString();
      attempt.outcome = outcome;
      this.recovery.saveAttempt(attempt);
    } else {
      const view = this.cartsService.toView(cart);
      const entry = await this.communications.send({
        channel,
        to,
        customerId: recovery.customerId,
        visitorId: recovery.visitorId,
        abandonedCartId: recovery.id,
        templateKey: step?.templateKey ?? attempt.templateKey,
        variables: {
          firstName: recovery.contactName?.split(' ')[0] ?? 'there',
          itemCount: cart.items.reduce(
            (sum, item) => sum + item.quantity,
            0,
          ),
          total: formatMoney(view.subtotal),
          recoveryLink: `${recoveryConfig().storefrontUrl}/recover/${recovery.recoveryToken}`,
        },
        purpose: 'cart-recovery',
      });
      outcome = entry.status;
      communicationLogId = entry.id;
      attempt.status = 'executed';
      attempt.executedAt = new Date().toISOString();
      attempt.outcome = outcome;
      attempt.communicationLogId = communicationLogId;
      this.recovery.saveAttempt(attempt);
    }

    this.audit.record({
      actorType: 'system',
      actorId: null,
      action: 'cart-recovery.step-executed',
      entityType: 'abandoned-cart',
      entityId: recovery.id,
      metadata: { stepNumber, channel, outcome },
    });

    if (recovery.status === 'recovered' || recovery.status === 'closed') {
      return;
    }
    if (outcome === 'refused-suppressed' || outcome === 'refused-consent') {
      // The person said no. Later steps would only be refused
      // again, so the sequence stops here.
      this.applyClosed(recovery, 'contact-refused');
      return;
    }
    const nextStep = settings.steps
      .filter((item) => item.stepNumber > stepNumber)
      .sort((a, b) => a.stepNumber - b.stepNumber)[0];
    recovery.status = 'in-recovery';
    recovery.updatedAt = new Date().toISOString();
    this.recovery.save(recovery);
    if (nextStep) {
      this.scheduleStep(recovery, nextStep, Date.now());
    } else {
      this.applyClosed(recovery, 'sequence-exhausted');
    }
  }

  /** Runs the next scheduled step immediately (operations and
   * tests). The step's queue job is cancelled first so it cannot
   * fire twice. */
  async runNextStep(
    id: string,
    actor: AuthPrincipal,
  ): Promise<AbandonedCartDetail> {
    const recovery = this.getRecovery(id);
    if (!OPEN_STATUSES.includes(recovery.status)) {
      throw new BadRequestException(
        `Recovery ${id} is ${recovery.status}; no step can run`,
      );
    }
    const next = this.recovery
      .listAttempts(id)
      .find((attempt) => attempt.status === 'scheduled');
    if (!next) {
      throw new BadRequestException(
        `Recovery ${id} has no scheduled step to run`,
      );
    }
    if (next.queueJobId) this.queue.cancel(next.queueJobId);
    await this.executeStep(id, next.stepNumber);
    this.audit.recordForPrincipal(actor, {
      action: 'cart-recovery.step-run',
      entityType: 'abandoned-cart',
      entityId: id,
      metadata: { stepNumber: next.stepNumber },
    });
    return this.getDetail(id);
  }

  // -- Recovery and closure -------------------------------------------

  /**
   * Marks recoveries recovered after an order placement. Called
   * by checkout; never throws into the order flow. Returns how
   * many recoveries matched.
   */
  markRecoveredForOrder(input: RecoveredOrderInput): number {
    try {
      let matched = 0;
      for (const recovery of this.recovery.findOpenForCustomer(
        input.customerId,
      )) {
        const byCart =
          input.cartId !== null && recovery.cartId === input.cartId;
        if (!byCart && !this.orderCoversCart(input, recovery)) {
          continue;
        }
        this.applyRecovered(recovery, input.orderNumber);
        matched += 1;
      }
      return matched;
    } catch {
      return 0;
    }
  }

  private orderCoversCart(
    input: RecoveredOrderInput,
    recovery: AbandonedCart,
  ): boolean {
    const cart = this.carts.findById(recovery.cartId);
    if (!cart || cart.items.length === 0) return false;
    const ordered = new Map<string, number>();
    for (const line of input.lines) {
      ordered.set(
        line.variantId,
        (ordered.get(line.variantId) ?? 0) + line.quantity,
      );
    }
    return cart.items.every(
      (item) => (ordered.get(item.variantId) ?? 0) >= item.quantity,
    );
  }

  cancelRecovery(
    id: string,
    actor: AuthPrincipal,
  ): AbandonedCart {
    const recovery = this.getRecovery(id);
    if (!OPEN_STATUSES.includes(recovery.status)) {
      throw new BadRequestException(
        `Recovery ${id} is already ${recovery.status}`,
      );
    }
    recovery.status = 'cancelled';
    recovery.updatedAt = new Date().toISOString();
    this.recovery.save(recovery);
    this.cancelPendingAttempts(recovery.id);
    this.audit.recordForPrincipal(actor, {
      action: 'cart-recovery.cancelled',
      entityType: 'abandoned-cart',
      entityId: recovery.id,
      metadata: { cartId: recovery.cartId },
    });
    return recovery;
  }

  private applyRecovered(
    recovery: AbandonedCart,
    orderNumber: string | null,
  ): void {
    if (!OPEN_STATUSES.includes(recovery.status)) return;
    recovery.status = 'recovered';
    recovery.recoveredOrderNumber = orderNumber;
    recovery.updatedAt = new Date().toISOString();
    this.recovery.save(recovery);
    this.cancelPendingAttempts(recovery.id);
    this.audit.record({
      actorType: 'system',
      actorId: null,
      action: 'cart-recovery.recovered',
      entityType: 'abandoned-cart',
      entityId: recovery.id,
      metadata: { cartId: recovery.cartId, orderNumber },
    });
  }

  private applyClosed(
    recovery: AbandonedCart,
    reason: string,
  ): void {
    if (!OPEN_STATUSES.includes(recovery.status)) return;
    recovery.status = 'closed';
    recovery.closeReason = reason;
    recovery.updatedAt = new Date().toISOString();
    this.recovery.save(recovery);
    this.cancelPendingAttempts(recovery.id);
  }

  private cancelPendingAttempts(abandonedCartId: string): void {
    for (const attempt of this.recovery.listAttempts(abandonedCartId)) {
      if (attempt.status !== 'scheduled') continue;
      if (attempt.queueJobId) {
        this.queue.cancel(attempt.queueJobId);
        attempt.queueJobId = null;
      }
      attempt.status = 'cancelled';
      attempt.updatedAt = new Date().toISOString();
      this.recovery.saveAttempt(attempt);
    }
  }

  private scheduleStep(
    recovery: AbandonedCart,
    step: RecoveryStep,
    fromMs: number,
  ): RecoveryAttempt {
    const now = new Date().toISOString();
    const attempt: RecoveryAttempt = {
      id: randomUUID(),
      abandonedCartId: recovery.id,
      stepNumber: step.stepNumber,
      channel: step.channel,
      templateKey: step.templateKey,
      scheduledFor: new Date(
        fromMs + step.delayMinutes * 60_000,
      ).toISOString(),
      executedAt: null,
      status: 'scheduled',
      outcome: null,
      communicationLogId: null,
      queueJobId: null,
      createdAt: now,
      updatedAt: now,
    };
    attempt.queueJobId = this.queue.enqueue(
      'cart-recovery.execute-step',
      { abandonedCartId: recovery.id, stepNumber: step.stepNumber },
      {
        delayMs: step.delayMinutes * 60_000,
        jobId: `recovery-step:${attempt.id}`,
      },
    );
    this.recovery.createAttempt(attempt);
    return attempt;
  }

  // -- Contact resolution ----------------------------------------------

  /**
   * The contact path for a cart, or null when there is nobody the
   * store may contact. Sources, in order: the cart's customer;
   * the tracked visitor session behind the cart's session token,
   * when that session is already linked to a customer. Details
   * come from the customer record. The basis mirrors the leads
   * rule: a customer with a password registered an account;
   * a passwordless record was created by submitting details at
   * checkout.
   */
  private resolveContact(cart: Cart): ResolvedContact | null {
    let customerId = cart.customerId;
    let visitorId: string | null = null;
    if (cart.sessionToken) {
      const session = this.visitors.getSession(cart.sessionToken);
      if (session) {
        visitorId = session.visitorId;
        customerId = customerId ?? session.customerId;
      }
    }
    if (!customerId) return null;
    let customer: StoredCustomer;
    try {
      customer = this.customers.findStored(customerId);
    } catch {
      return null;
    }
    const phone = customer.phone || null;
    const email = customer.email;
    if (!phone && !email) return null;
    return {
      customerId: customer.id,
      visitorId,
      name: customer.fullName,
      phone,
      email,
      basis: customer.passwordHash ? 'account' : 'checkout',
    };
  }

  // -- Reads -------------------------------------------------------------

  list(filter: { status?: AbandonedCart['status'] }): AbandonedCart[] {
    return this.recovery
      .list()
      .filter(
        (recovery) => !filter.status || recovery.status === filter.status,
      );
  }

  getRecovery(id: string): AbandonedCart {
    const recovery = this.recovery.findById(id);
    if (!recovery) {
      throw new NotFoundException(`Abandoned cart not found: ${id}`);
    }
    return recovery;
  }

  getDetail(id: string): AbandonedCartDetail {
    const recovery = this.getRecovery(id);
    return {
      recovery,
      attempts: this.recovery.listAttempts(id),
      communications: this.communications.listLog({
        abandonedCartId: id,
      }),
    };
  }

  // -- Settings -----------------------------------------------------------

  getSettings(): RecoverySettings {
    return this.recovery.getSettings();
  }

  updateSettings(
    dto: RecoverySettingsUpdate,
    actor: AuthPrincipal,
  ): RecoverySettings {
    const current = this.recovery.getSettings();
    const next: RecoverySettings = {
      abandonedAfterMinutes:
        dto.abandonedAfterMinutes ?? current.abandonedAfterMinutes,
      tokenTtlDays: dto.tokenTtlDays ?? current.tokenTtlDays,
      steps: dto.steps ?? current.steps,
    };
    if (dto.steps) {
      const numbers = dto.steps
        .map((step) => step.stepNumber)
        .sort((a, b) => a - b);
      const sequential = numbers.every(
        (value, index) => value === index + 1,
      );
      if (!sequential) {
        throw new BadRequestException(
          'Recovery steps must be numbered sequentially from 1 without gaps or duplicates',
        );
      }
      for (const step of dto.steps) {
        const template = findTemplate(step.templateKey);
        if (!template) {
          throw new BadRequestException(
            `Unknown message template: ${step.templateKey}`,
          );
        }
        if (template.channel !== step.channel) {
          throw new BadRequestException(
            `Template ${step.templateKey} is for ${template.channel}, not ${step.channel}`,
          );
        }
      }
      next.steps = dto.steps
        .slice()
        .sort((a, b) => a.stepNumber - b.stepNumber);
    }
    this.recovery.saveSettings(next);
    this.audit.recordForPrincipal(actor, {
      action: 'cart-recovery.settings-updated',
      entityType: 'settings',
      entityId: 'cart-recovery',
      metadata: {
        abandonedAfterMinutes: next.abandonedAfterMinutes,
        tokenTtlDays: next.tokenTtlDays,
        stepCount: next.steps.length,
      },
    });
    return next;
  }

  // -- Public recovery token ------------------------------------------------

  /**
   * The public recovery link target. Prices are read from the
   * current catalog, as the brief asks, and the view never
   * carries contact details, a customer id or a visitor id.
   * Recovered, closed, cancelled and expired tokens answer with
   * their honest status and no items.
   */
  getByToken(token: string): RecoveryCartView {
    const recovery = this.recovery.findByToken(token);
    if (!recovery) {
      throw new NotFoundException('Recovery link not found');
    }
    const empty = {
      items: [],
      subtotal: money(0),
      expiresAt: recovery.tokenExpiresAt,
    };
    if (recovery.status === 'recovered') {
      return {
        status: 'recovered',
        message:
          'This bag has already been checked out. Thank you for your order.',
        ...empty,
      };
    }
    if (recovery.status === 'closed' || recovery.status === 'cancelled') {
      return {
        status: recovery.status,
        message: 'This recovery link is no longer active.',
        ...empty,
      };
    }
    if (Date.parse(recovery.tokenExpiresAt) <= Date.now()) {
      return {
        status: 'expired',
        message: 'This recovery link has expired.',
        ...empty,
      };
    }
    const cart = this.carts.findById(recovery.cartId);
    if (!cart || cart.items.length === 0) {
      return {
        status: 'closed',
        message: 'This bag is empty, so there is nothing to recover.',
        ...empty,
      };
    }
    let subtotalMinor = 0;
    const items = cart.items.map((item) => {
      const found = this.catalog.findVariant(
        item.productId,
        item.variantId,
      );
      const unitMinor =
        found?.variant.price.amountMinor ?? item.unitPrice.amountMinor;
      const lineTotalMinor = unitMinor * item.quantity;
      subtotalMinor += lineTotalMinor;
      return {
        productId: item.productId,
        variantId: item.variantId,
        productName: found?.product.name ?? item.productId,
        variantName: found?.variant.name ?? item.variantId,
        quantity: item.quantity,
        unitPrice: money(unitMinor),
        lineTotal: money(lineTotalMinor),
      };
    });
    return {
      status: 'active',
      message: null,
      items,
      subtotal: money(subtotalMinor),
      expiresAt: recovery.tokenExpiresAt,
    };
  }
}

/** Formats a Money value for message templates: "BDT 1850.00". */
export function formatMoney(value: Money): string {
  return `${value.currency} ${(value.amountMinor / 100).toFixed(2)}`;
}
