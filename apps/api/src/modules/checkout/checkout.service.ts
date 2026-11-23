import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import {
  DELIVERY_ZONE_LABELS,
  money,
  type CheckoutQuote,
  type CheckoutQuoteLine,
  type DeliveryZone,
  type Order,
} from '@dostelo/types';
import type { CheckoutRequest } from '@dostelo/validation';
import {
  NoopTransactionRunner,
  TransactionRunner,
} from '../../prisma/transaction-runner';
import { SettingsRepository } from '../../store/settings.repository';
import { CatalogRepository } from '../catalog/repositories/catalog.repository';
import { CartsRepository } from '../carts/repositories/carts.repository';
import { CartsService } from '../carts/carts.service';
import { CartRecoveryService } from '../cart-recovery/cart-recovery.service';
import { CustomersService } from '../customers/customers.service';
import { InventoryRepository } from '../inventory/repositories/inventory.repository';
import { LeadsService } from '../leads/leads.service';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import { PaymentsService } from '../payments/payments.service';
import { VisitorsService } from '../visitors/visitors.service';
import { detectZone } from './detect-zone';

interface PricedLine extends CheckoutQuoteLine {
  sku: string;
}

/**
 * Checkout: server-side totals and order placement.
 *
 * Every price and total is computed here from the catalog and the
 * store rules; the client supplies only product/variant ids,
 * quantities, the address and the payment method. The rules mirror
 * the live storefront exactly:
 *
 * - Zone detected from the address (see detect-zone.ts); fees
 *   70 / 100 / 150 taka by zone, in minor units.
 * - Cash on Delivery adds 10 taka, always, even when delivery
 *   itself is free.
 * - Free delivery on a customer's first order, tracked per
 *   customer through the orders repository count.
 * - The admin free delivery offer switch (settings, default off)
 *   waives the zone fee for everyone while it is on.
 * - Orders require a customer: a registered customerId, or contact
 *   details that find-or-create the customer record.
 *
 * Placement writes commit in one transaction
 * (docs/PRISMA_MIGRATION.md): order row, status event, stock
 * reservation, payment attempt, order payment status, customer
 * counters, lead conversion and cart recovery marking. Customer
 * resolution and pricing happen before the transaction opens.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly catalog: CatalogRepository,
    private readonly carts: CartsRepository,
    private readonly cartsService: CartsService,
    private readonly customers: CustomersService,
    private readonly orders: OrdersRepository,
    private readonly inventory: InventoryRepository,
    private readonly settings: SettingsRepository,
    private readonly payments: PaymentsService,
    private readonly visitors: VisitorsService,
    private readonly leads: LeadsService,
    private readonly cartRecovery: CartRecoveryService,
    @Optional()
    private readonly transactions: TransactionRunner = new NoopTransactionRunner(),
  ) {}

  /** Resolves the effective lines from inline lines or a cart. */
  private async resolveLines(
    dto: CheckoutRequest,
  ): Promise<{ productId: string; variantId: string; quantity: number }[]> {
    if (dto.cartId) {
      const cart = await this.carts.findById(dto.cartId);
      if (!cart) {
        throw new NotFoundException(`Cart not found: ${dto.cartId}`);
      }
      if (cart.status !== 'active') {
        throw new BadRequestException(`Cart ${cart.id} is ${cart.status}`);
      }
      if (cart.items.length === 0) {
        throw new BadRequestException('Cart is empty');
      }
      return cart.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      }));
    }
    return dto.lines ?? [];
  }

  /** Prices each line from the catalog. Throws on unknown or
   * inactive variants so a quote never invents a price. */
  private async priceLines(
    lines: { productId: string; variantId: string; quantity: number }[],
  ): Promise<PricedLine[]> {
    const priced: PricedLine[] = [];
    for (const line of lines) {
      const found = await this.catalog.findVariant(
        line.productId,
        line.variantId,
      );
      if (!found || !found.variant.isActive) {
        throw new NotFoundException(
          `Variant not found: ${line.productId}/${line.variantId}`,
        );
      }
      const unitMinor = found.variant.price.amountMinor;
      priced.push({
        productId: line.productId,
        variantId: line.variantId,
        productName: found.product.name,
        variantName: found.variant.name,
        sku: found.variant.sku,
        quantity: line.quantity,
        unitPrice: money(unitMinor),
        lineTotal: money(unitMinor * line.quantity),
      });
    }
    return priced;
  }

  /** The customer a quote belongs to, when one can be identified:
   * by customerId, or by the checkout contact phone/email. Guests
   * quote as first-order customers, matching the storefront. */
  private async orderCountFor(dto: CheckoutRequest): Promise<number> {
    if (dto.customerId) {
      const customer = await this.customers.findStored(dto.customerId);
      return this.orders.countByCustomer(customer.id);
    }
    if (dto.customer) {
      const byPhone = await this.customers.findStoredByPhone(dto.customer.phone);
      if (byPhone) return this.orders.countByCustomer(byPhone.id);
      if (dto.customer.email) {
        const byEmail = await this.customers.findStoredByEmail(dto.customer.email);
        if (byEmail) return this.orders.countByCustomer(byEmail.id);
      }
      return 0;
    }
    return 0;
  }

  async quote(dto: CheckoutRequest): Promise<CheckoutQuote> {
    const priced = await this.priceLines(await this.resolveLines(dto));
    const subtotalMinor = priced.reduce(
      (sum, line) => sum + line.lineTotal.amountMinor,
      0,
    );
    const addressText = [
      dto.address.addressLine,
      dto.address.area ?? '',
      dto.address.city,
    ]
      .filter(Boolean)
      .join(' ');
    const zone = detectZone(dto.address.district, addressText);

    const orderCount = await this.orderCountFor(dto);
    const settings = await this.settings.get();
    /** The fee table lives in the store settings (Website
     * Management); its defaults are the live 70 / 100 / 150 taka
     * zone fees and the 10 taka COD fee. */
    const zoneFeeMinor = zone
      ? {
          'dhaka-city': settings.deliveryFees.dhakaCityMinor,
          'dhaka-sub-city': settings.deliveryFees.dhakaSubCityMinor,
          'outside-dhaka': settings.deliveryFees.outsideDhakaMinor,
        }[zone as DeliveryZone]
      : 0;
    let freeDeliveryReason: CheckoutQuote['freeDeliveryReason'] = null;
    if (settings.freeDeliveryOffer) {
      freeDeliveryReason = 'admin-offer';
    } else if (orderCount === 0) {
      freeDeliveryReason = 'first-order';
    }
    const freeDelivery = freeDeliveryReason !== null;
    const deliveryFeeMinor = freeDelivery ? 0 : zoneFeeMinor;
    const codFeeMinor =
      dto.paymentMethod === 'cod' ? settings.deliveryFees.codFeeMinor : 0;

    return {
      zone,
      zoneLabel: zone ? DELIVERY_ZONE_LABELS[zone] : null,
      paymentMethod: dto.paymentMethod,
      lines: priced.map(({ sku: _sku, ...line }) => line),
      subtotal: money(subtotalMinor),
      deliveryFee: money(deliveryFeeMinor),
      codFee: money(codFeeMinor),
      discount: money(0),
      total: money(subtotalMinor + deliveryFeeMinor + codFeeMinor),
      freeDelivery,
      freeDeliveryReason,
      firstOrderFreeDelivery: freeDeliveryReason === 'first-order',
    };
  }

  async placeOrder(dto: CheckoutRequest): Promise<Order> {
    // 1. Resolve the customer the order belongs to.
    let customerId: string;
    if (dto.customerId) {
      customerId = (await this.customers.findStored(dto.customerId)).id;
    } else if (dto.customer) {
      customerId = (
        await this.customers.findOrCreateForCheckout(dto.customer)
      ).id;
    } else {
      throw new BadRequestException(
        'An account is needed to order: provide customerId or customer contact details',
      );
    }

    // 2. Price the lines and compute totals for this customer.
    const lines = await this.resolveLines(dto);
    const quote = await this.quote({ ...dto, customerId });
    if (!quote.zone) {
      throw new BadRequestException(
        'Could not detect a delivery zone from the address',
      );
    }
    const priced = await this.priceLines(lines);

    // 3. Validate stock for every line before reserving anything.
    for (const line of priced) {
      const record = await this.inventory.getStock(line.variantId);
      const available = record ? record.onHand - record.reserved : 0;
      if (available < line.quantity) {
        throw new BadRequestException(
          `Insufficient stock for variant ${line.variantId}: requested ${line.quantity}, available ${available}`,
        );
      }
    }

    // 4. Create the order with the legacy number format.
    const now = new Date().toISOString();
    const order: Order = {
      id: randomUUID(),
      orderNumber: await this.nextOrderNumber(),
      customerId,
      status: 'pending',
      paymentStatus: 'initiated',
      address: {
        fullName: dto.address.fullName,
        phone: dto.address.phone,
        addressLine: dto.address.addressLine,
        area: dto.address.area ?? null,
        city: dto.address.city,
        district: dto.address.district,
        deliveryZone: quote.zone,
      },
      items: priced.map((line) => ({
        id: randomUUID(),
        orderId: '',
        productId: line.productId,
        variantId: line.variantId,
        productName: line.productName,
        variantName: line.variantName,
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
      subtotal: quote.subtotal,
      deliveryFee: quote.deliveryFee,
      codFee: quote.codFee,
      discount: quote.discount,
      total: quote.total,
      firstOrderFreeDelivery: quote.firstOrderFreeDelivery,
      adminNote: null,
      createdAt: now,
      updatedAt: now,
    };
    for (const item of order.items) item.orderId = order.id;

    // Steps 4 to 7 commit together: the order, its first status
    // event, the stock reservation, the payment attempt, the
    // customer counters, lead conversion and cart recovery.
    await this.transactions.run(async (tx) => {
      await this.orders.create(order, tx);
      await this.orders.addStatusEvent(
        {
          id: randomUUID(),
          orderId: order.id,
          status: 'pending',
          note: 'Order placed',
          actorId: customerId,
          createdAt: now,
        },
        tx,
      );

      // 5. Reserve the stock, create the payment attempt through
      // the payments module (it owns the attempt's lifecycle from
      // here: COD collection, manual verification, gateway
      // sessions), mirror its status onto the order, and count the
      // order against the customer (drives the first-order rule).
      await this.inventory.reserve(
        order.id,
        priced.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
        })),
        tx,
      );
      const payment = await this.payments.initiateForCheckout(
        order,
        dto.paymentMethod,
        tx,
      );
      order.paymentStatus = payment.status;
      await this.orders.save(order, tx);
      await this.customers.recordOrder(
        customerId,
        quote.total.amountMinor,
        tx,
      );
      // 6. Buyer Intelligence (Phase 5): snapshot the customer's
      // open leads BEFORE any linking for this order, so conversion
      // below converts exactly the leads that existed beforehand.
      // A candidate raised by this order's own guest-checkout link
      // is not in the snapshot and stays open as a follow-up lead.
      const openLeadIdsBeforeOrder = new Set(
        await this.leads.openLeadIdsForCustomer(customerId, tx),
      );
      // When the order carries a first-party visitor id, the
      // guest's browsing history links to this customer as a Guest
      // Checkout identity (or stays Known Customer when already
      // authenticated-linked). Any open lead for the customer then
      // converts: the person bought.
      if (dto.visitorId) {
        await this.visitors.linkGuestCheckout(customerId, dto.visitorId, tx);
      }
      await this.leads.markConvertedForCustomer(
        customerId,
        order.orderNumber,
        openLeadIdsBeforeOrder,
        tx,
      );
      // 7. Cart recovery (Phase 6): an order from this cart, or by
      // this customer covering the recovery cart's lines, recovers
      // any open abandoned-cart recovery and cancels its pending
      // steps, so the customer is never chased after buying.
      await this.cartRecovery.markRecoveredForOrder(
        {
          customerId,
          cartId: dto.cartId ?? null,
          orderNumber: order.orderNumber,
          lines: priced.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
          })),
        },
        tx,
      );
      if (dto.cartId) {
        await this.cartsService.markConverted(dto.cartId, tx);
      }
    });
    return order;
  }

  /** Legacy order number format: BP- plus 6 digits. */
  private async nextOrderNumber(): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = `BP-${randomInt(100000, 1000000)}`;
      if (!(await this.orders.findByNumber(candidate))) return candidate;
    }
    throw new BadRequestException('Could not allocate an order number');
  }
}
