import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  permissionsForRoles,
  type Courier,
  type Order,
  type OrderStatus,
} from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createTestContext,
  findVariant,
  type TestContext,
} from '../../testing/test-context';
import { ShippingService } from './shipping.service';
import {
  CourierHttpClient,
  type CourierHttpRequest,
  type CourierHttpResponse,
} from './providers/courier-http';
import { CourierProviderRegistry } from './providers/courier-provider.registry';
import { PathaoProvider } from './providers/pathao.provider';
import { RedxProvider } from './providers/redx.provider';
import { SteadfastProvider } from './providers/steadfast.provider';

/**
 * Shipping service tests (Phase 6, chunk 2): booking rules,
 * not-configured honesty, status refresh through a courier test
 * double, and the signed courier webhook flow including order
 * advancement through the legal status flow.
 */
const DHAKA_ADDRESS = {
  fullName: 'Test Buyer',
  phone: '01712345678',
  addressLine: 'House 5, Road 2, Mirpur 10',
  city: 'Dhaka',
  district: 'Dhaka',
};

const actor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-delivery-1',
  name: 'Delivery Tester',
  roles: ['delivery-manager'],
  permissions: permissionsForRoles(['delivery-manager']),
};

const ENV_KEYS = [
  'PATHAO_CLIENT_ID',
  'PATHAO_CLIENT_SECRET',
  'PATHAO_USERNAME',
  'PATHAO_PASSWORD',
  'PATHAO_STORE_ID',
  'STEADFAST_API_KEY',
  'STEADFAST_SECRET_KEY',
  'STEADFAST_WEBHOOK_SECRET',
  'REDX_ACCESS_TOKEN',
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

class FakeCourierHttpClient extends CourierHttpClient {
  readonly requests: CourierHttpRequest[] = [];

  constructor(
    private readonly handler: (
      request: CourierHttpRequest,
    ) => CourierHttpResponse,
  ) {
    super();
  }

  async request(
    input: CourierHttpRequest,
  ): Promise<CourierHttpResponse> {
    this.requests.push(input);
    return this.handler(input);
  }
}

/** A ShippingService over the test context's stores, with the
 * real adapters pointed at the given HTTP test double. */
function shippingWithHttp(
  ctx: TestContext,
  http: CourierHttpClient,
): ShippingService {
  const registry = new CourierProviderRegistry(
    new PathaoProvider(http),
    new SteadfastProvider(http),
    new RedxProvider(http),
  );
  return new ShippingService(
    ctx.shippingRepo,
    ctx.ordersService,
    ctx.paymentsRepo,
    registry,
    ctx.audit,
  );
}

function configurePathao(): void {
  process.env.PATHAO_CLIENT_ID = 'client-id';
  process.env.PATHAO_CLIENT_SECRET = 'client-secret';
  process.env.PATHAO_USERNAME = 'merchant@example.com';
  process.env.PATHAO_PASSWORD = 'merchant-password';
  process.env.PATHAO_STORE_ID = '42';
}

function configureSteadfast(): void {
  process.env.STEADFAST_API_KEY = 'api-key';
  process.env.STEADFAST_SECRET_KEY = 'secret-key';
}

async function placeOrder(
  ctx: TestContext,
  paymentMethod: 'cod' | 'bkash' = 'cod',
): Promise<Order> {
  const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
  return ctx.checkout.placeOrder({
    customer: {
      fullName: 'Shipment Buyer',
      phone: '01812345678',
      email: 'shipment@example.com',
    },
    lines: [
      { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
    ],
    address: DHAKA_ADDRESS,
    paymentMethod,
  });
}

const FORWARD: OrderStatus[] = [
  'confirmed',
  'processing',
  'packed',
  'ready-to-ship',
  'shipped',
  'out-for-delivery',
  'delivered',
];

async function walkOrderTo(
  ctx: TestContext,
  orderNumber: string,
  target: OrderStatus,
): Promise<void> {
  if (target === 'cancelled') {
    await ctx.ordersService.transition(orderNumber, { status: 'cancelled' }, actor);
    return;
  }
  const start = FORWARD.indexOf(
    (await ctx.ordersService.getByNumber(orderNumber)).status,
  );
  for (let i = start + 1; i <= FORWARD.indexOf(target); i++) {
    await ctx.ordersService.transition(
      orderNumber,
      { status: FORWARD[i] as OrderStatus },
      actor,
    );
  }
}

function pathaoHttp(state: { deliveryStatus: string }) {
  return new FakeCourierHttpClient((request) => {
    if (request.url.endsWith('/issue-token')) {
      return { status: 200, body: { access_token: 'tok-1' } };
    }
    if (request.method === 'POST') {
      return {
        status: 200,
        body: {
          code: 200,
          data: { consignment_id: 'PATH-123', delivery_status: 'pending' },
        },
      };
    }
    return {
      status: 200,
      body: { data: { delivery_status: state.deliveryStatus } },
    };
  });
}

function steadfastHttp() {
  return new FakeCourierHttpClient(() => ({
    status: 200,
    body: {
      status: 200,
      consignment: { consignment_id: 9001, invoice: 'BP' },
    },
  }));
}

describe('shipment creation rules', () => {
  it('refuses a pending order, naming the state', async () => {
    const ctx = createTestContext();
    const order = await placeOrder(ctx);
    await expect(
      ctx.shipping.createShipment(
        { orderNumber: order.orderNumber, courier: 'pathao' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ctx.shipping.createShipment(
        { orderNumber: order.orderNumber, courier: 'pathao' },
        actor,
      ),
    ).rejects.toThrow(/pending/);
  });

  it('refuses a cancelled order', async () => {
    const ctx = createTestContext();
    const order = await placeOrder(ctx);
    await walkOrderTo(ctx, order.orderNumber, 'cancelled');
    await expect(
      ctx.shipping.createShipment(
        { orderNumber: order.orderNumber, courier: 'pathao' },
        actor,
      ),
    ).rejects.toThrow(/cancelled/);
  });

  it('refuses a delivered order', async () => {
    const ctx = createTestContext();
    const order = await placeOrder(ctx);
    await walkOrderTo(ctx, order.orderNumber, 'delivered');
    await expect(
      ctx.shipping.createShipment(
        { orderNumber: order.orderNumber, courier: 'pathao' },
        actor,
      ),
    ).rejects.toThrow(/delivered/);
  });

  it('answers 404 for an unknown order number', async () => {
    const ctx = createTestContext();
    await expect(
      ctx.shipping.createShipment(
        { orderNumber: 'BP-000000', courier: 'pathao' },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a second active booking for the same order', async () => {
    configurePathao();
    const ctx = createTestContext();
    const shipping = shippingWithHttp(ctx, pathaoHttp({ deliveryStatus: 'pending' }));
    const order = await placeOrder(ctx);
    await walkOrderTo(ctx, order.orderNumber, 'confirmed');
    const first = await shipping.createShipment(
      { orderNumber: order.orderNumber, courier: 'pathao' },
      actor,
    );
    expect(first.status).toBe('created');
    await expect(
      shipping.createShipment(
        { orderNumber: order.orderNumber, courier: 'steadfast' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('not-configured honesty', () => {
  it('records a not-configured shipment per courier, with no tracking id', async () => {
    const ctx = createTestContext();
    const couriers: Array<{ courier: Courier; missing: string }> = [
      { courier: 'pathao', missing: 'PATHAO_CLIENT_ID' },
      { courier: 'steadfast', missing: 'STEADFAST_API_KEY' },
      { courier: 'redx', missing: 'REDX_ACCESS_TOKEN' },
    ];
    for (const { courier, missing } of couriers) {
      const order = await placeOrder(ctx);
      await walkOrderTo(ctx, order.orderNumber, 'confirmed');
      const shipment = await ctx.shipping.createShipment(
        { orderNumber: order.orderNumber, courier },
        actor,
      );
      expect(shipment.status).toBe('not-configured');
      expect(shipment.trackingId).toBeNull();
      expect(shipment.notConfiguredReason).toContain(missing);
      const detail = await ctx.shipping.getDetail(shipment.id);
      expect(detail.events).toHaveLength(1);
      expect(detail.events[0]?.source).toBe('create');
      expect(detail.events[0]?.status).toBe('not-configured');
    }
    const listed = await ctx.shipping.listShipments({ courier: 'redx' });
    expect(listed).toHaveLength(1);
    expect(
      ctx.db.auditLogs.filter((entry) => entry.action === 'shipment.created'),
    ).toHaveLength(3);
  });
});

describe('configured booking through the Pathao double', () => {
  it('books the parcel, snapshots the recipient and the COD total', async () => {
    configurePathao();
    const ctx = createTestContext();
    const http = pathaoHttp({ deliveryStatus: 'pending' });
    const shipping = shippingWithHttp(ctx, http);
    const order = await placeOrder(ctx);
    await walkOrderTo(ctx, order.orderNumber, 'ready-to-ship');
    const shipment = await shipping.createShipment(
      { orderNumber: order.orderNumber, courier: 'pathao' },
      actor,
    );
    expect(shipment.status).toBe('created');
    expect(shipment.trackingId).toBe('PATH-123');
    expect(shipment.recipientName).toBe('Test Buyer');
    expect(shipment.recipientPhone).toBe('01712345678');
    expect(shipment.recipientAddress).toContain('Mirpur 10');
    // A COD order collects its full total at the door.
    expect(shipment.codAmount.amountMinor).toBe(order.total.amountMinor);
    expect(shipment.weightKg).toBe(0.5);
    const create = http.requests.find(
      (request) => request.method === 'POST' && request.url.includes('/orders'),
    );
    const body = create?.body as Record<string, unknown>;
    expect(body.merchant_order_id).toBe(order.orderNumber);
    expect(body.amount_to_collect).toBe(order.total.amountMinor / 100);
  });

  it('collects nothing for a prepaid order', async () => {
    configurePathao();
    const ctx = createTestContext();
    const shipping = shippingWithHttp(ctx, pathaoHttp({ deliveryStatus: 'pending' }));
    const order = await placeOrder(ctx, 'bkash');
    await walkOrderTo(ctx, order.orderNumber, 'confirmed');
    const shipment = await shipping.createShipment(
      { orderNumber: order.orderNumber, courier: 'pathao' },
      actor,
    );
    expect(shipment.status).toBe('created');
    expect(shipment.codAmount.amountMinor).toBe(0);
  });
});

describe('status refresh', () => {
  it('applies the courier status and walks the order to shipped legally', async () => {
    configurePathao();
    const ctx = createTestContext();
    const state = { deliveryStatus: 'pending' };
    const shipping = shippingWithHttp(ctx, pathaoHttp(state));
    const order = await placeOrder(ctx);
    await walkOrderTo(ctx, order.orderNumber, 'confirmed');
    const shipment = await shipping.createShipment(
      { orderNumber: order.orderNumber, courier: 'pathao' },
      actor,
    );
    state.deliveryStatus = 'in_transit';
    const result = await shipping.refreshStatus(shipment.id, actor);
    expect(result.refreshed).toBe(true);
    expect(result.shipment.status).toBe('in-transit');
    expect(result.shipment.lastRawStatus).toBe('in_transit');
    const after = await ctx.ordersService.getByNumber(order.orderNumber);
    expect(after.status).toBe('shipped');
    // The order moved only along legal flow steps.
    const events = (await ctx.ordersService.getDetail(order.orderNumber)).events;
    expect(events.map((event) => event.status)).toEqual([
      'pending',
      'confirmed',
      'processing',
      'packed',
      'ready-to-ship',
      'shipped',
    ]);
    const shipmentEvents = (await ctx.shipping.getDetail(shipment.id)).events;
    expect(shipmentEvents.map((event) => event.source)).toEqual([
      'create',
      'refresh',
    ]);
  });

  it('is an honest no-op when the courier status is unchanged', async () => {
    configurePathao();
    const ctx = createTestContext();
    const state = { deliveryStatus: 'pending' };
    const shipping = shippingWithHttp(ctx, pathaoHttp(state));
    const order = await placeOrder(ctx);
    await walkOrderTo(ctx, order.orderNumber, 'confirmed');
    const shipment = await shipping.createShipment(
      { orderNumber: order.orderNumber, courier: 'pathao' },
      actor,
    );
    state.deliveryStatus = 'in_transit';
    await shipping.refreshStatus(shipment.id, actor);
    const again = await shipping.refreshStatus(shipment.id, actor);
    expect(again.refreshed).toBe(false);
    expect(again.refreshNote).toContain('unchanged');
    expect((await ctx.shipping.getDetail(shipment.id)).events).toHaveLength(2);
  });

  it('cannot refresh a shipment the courier never booked', async () => {
    const ctx = createTestContext();
    const order = await placeOrder(ctx);
    await walkOrderTo(ctx, order.orderNumber, 'confirmed');
    const shipment = await ctx.shipping.createShipment(
      { orderNumber: order.orderNumber, courier: 'pathao' },
      actor,
    );
    expect(shipment.status).toBe('not-configured');
    const result = await ctx.shipping.refreshStatus(shipment.id, actor);
    expect(result.refreshed).toBe(false);
    expect(result.refreshNote).toContain('no tracking id');
    expect((await ctx.shipping.getDetail(shipment.id)).events).toHaveLength(1);
  });
});

describe('courier webhooks', () => {
  const SECRET = 'steadfast-webhook-secret';

  function sign(rawBody: string, secret: string): string {
    return createHmac('sha256', secret).update(rawBody).digest('hex');
  }

  async function bookedSteadfast(ctx: TestContext) {
    configureSteadfast();
    process.env.STEADFAST_WEBHOOK_SECRET = SECRET;
    const shipping = shippingWithHttp(ctx, steadfastHttp());
    const order = await placeOrder(ctx);
    await walkOrderTo(ctx, order.orderNumber, 'confirmed');
    const shipment = await shipping.createShipment(
      { orderNumber: order.orderNumber, courier: 'steadfast' },
      actor,
    );
    expect(shipment.trackingId).toBe('9001');
    return { shipping, order, shipment };
  }

  it('rejects deliveries when no webhook secret is configured', async () => {
    const ctx = createTestContext();
    await expect(
      ctx.shipping.handleCourierWebhook(
        'steadfast',
        { consignment_id: '9001', delivery_status: 'delivered' },
        'whatever',
        '{}',
      ),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('rejects a bad signature and records nothing', async () => {
    const ctx = createTestContext();
    process.env.STEADFAST_WEBHOOK_SECRET = SECRET;
    const payload = { consignment_id: '9001', delivery_status: 'delivered' };
    const rawBody = JSON.stringify(payload);
    await expect(
      ctx.shipping.handleCourierWebhook(
        'steadfast',
        payload,
        'deadbeef',
        rawBody,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(ctx.db.courierWebhookEvents.size).toBe(0);
  });

  it('answers 404 for a courier with no adapter', async () => {
    const ctx = createTestContext();
    await expect(
      ctx.shipping.handleCourierWebhook('paperfly', {}, undefined, '{}'),
    ).rejects.toThrow(NotFoundException);
  });

  it('applies a delivered update, advances the order, and dedupes redelivery', async () => {
    const ctx = createTestContext();
    const { shipping, order, shipment } = await bookedSteadfast(ctx);
    const payload = {
      consignment_id: '9001',
      delivery_status: 'delivered',
      event_id: 'evt-delivered-1',
    };
    const rawBody = JSON.stringify(payload);
    const result = await shipping.handleCourierWebhook(
      'steadfast',
      payload,
      sign(rawBody, SECRET),
      rawBody,
    );
    expect(result).toMatchObject({
      received: true,
      duplicate: false,
      applied: true,
      shipmentId: shipment.id,
    });
    expect((await ctx.shipping.getDetail(shipment.id)).shipment.status).toBe(
      'delivered',
    );
    const after = await ctx.ordersService.getByNumber(order.orderNumber);
    expect(after.status).toBe('delivered');
    const orderEvents = (await ctx.ordersService.getDetail(order.orderNumber)).events;
    expect(orderEvents.map((event) => event.status)).toEqual([
      'pending',
      'confirmed',
      'processing',
      'packed',
      'ready-to-ship',
      'shipped',
      'out-for-delivery',
      'delivered',
    ]);
    const shipmentEvents = (await ctx.shipping.getDetail(shipment.id)).events;
    expect(shipmentEvents).toHaveLength(2);
    expect(shipmentEvents[1]?.source).toBe('webhook');

    const duplicate = await shipping.handleCourierWebhook(
      'steadfast',
      payload,
      sign(rawBody, SECRET),
      rawBody,
    );
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.applied).toBe(false);
    expect((await ctx.shipping.getDetail(shipment.id)).events).toHaveLength(2);
    expect(
      ctx.db.auditLogs.some(
        (entry) =>
          entry.action === 'shipment.status-updated' &&
          entry.actorType === 'system',
      ),
    ).toBe(true);
  });

  it('records a delivery for an unknown tracking id without applying it', async () => {
    const ctx = createTestContext();
    process.env.STEADFAST_WEBHOOK_SECRET = SECRET;
    const payload = {
      consignment_id: 'NOPE-1',
      delivery_status: 'delivered',
      event_id: 'evt-unknown-1',
    };
    const rawBody = JSON.stringify(payload);
    const result = await ctx.shipping.handleCourierWebhook(
      'steadfast',
      payload,
      sign(rawBody, SECRET),
      rawBody,
    );
    expect(result.applied).toBe(false);
    expect(result.shipmentId).toBeNull();
    expect(result.reason).toContain('No shipment matches');
    const duplicate = await ctx.shipping.handleCourierWebhook(
      'steadfast',
      payload,
      sign(rawBody, SECRET),
      rawBody,
    );
    expect(duplicate.duplicate).toBe(true);
  });

  it('records an unhandled courier status without applying it', async () => {
    const ctx = createTestContext();
    const { shipping, shipment } = await bookedSteadfast(ctx);
    const payload = {
      consignment_id: '9001',
      delivery_status: 'unknown',
      event_id: 'evt-unknown-status',
    };
    const rawBody = JSON.stringify(payload);
    const result = await shipping.handleCourierWebhook(
      'steadfast',
      payload,
      sign(rawBody, SECRET),
      rawBody,
    );
    expect(result.applied).toBe(false);
    expect(result.reason).toContain('Unhandled courier status');
    expect((await ctx.shipping.getDetail(shipment.id)).shipment.status).toBe(
      'created',
    );
  });

  it('moves a delivered order to returned, and only from delivered', async () => {
    const ctx = createTestContext();
    const { shipping, order, shipment } = await bookedSteadfast(ctx);
    const deliveredPayload = {
      consignment_id: '9001',
      delivery_status: 'delivered',
      event_id: 'evt-d1',
    };
    const deliveredBody = JSON.stringify(deliveredPayload);
    await shipping.handleCourierWebhook(
      'steadfast',
      deliveredPayload,
      sign(deliveredBody, SECRET),
      deliveredBody,
    );
    const returnedPayload = {
      consignment_id: '9001',
      delivery_status: 'returned',
      event_id: 'evt-r1',
    };
    const returnedBody = JSON.stringify(returnedPayload);
    const result = await shipping.handleCourierWebhook(
      'steadfast',
      returnedPayload,
      sign(returnedBody, SECRET),
      returnedBody,
    );
    expect(result.applied).toBe(true);
    expect((await ctx.shipping.getDetail(shipment.id)).shipment.status).toBe(
      'returned',
    );
    expect((await ctx.ordersService.getByNumber(order.orderNumber)).status).toBe(
      'returned',
    );
  });

  it('records a return reported before delivery without walking the order through delivered', async () => {
    const ctx = createTestContext();
    const { shipping, order, shipment } = await bookedSteadfast(ctx);
    const payload = {
      consignment_id: '9001',
      delivery_status: 'returned',
      event_id: 'evt-early-return',
    };
    const rawBody = JSON.stringify(payload);
    const result = await shipping.handleCourierWebhook(
      'steadfast',
      payload,
      sign(rawBody, SECRET),
      rawBody,
    );
    expect(result.applied).toBe(true);
    expect((await ctx.shipping.getDetail(shipment.id)).shipment.status).toBe(
      'returned',
    );
    // The order was only confirmed: it must not pass through
    // delivered (which would collect COD) on its way anywhere.
    expect((await ctx.ordersService.getByNumber(order.orderNumber)).status).toBe(
      'confirmed',
    );
  });
});
