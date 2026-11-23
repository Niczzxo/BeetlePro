import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CourierHttpClient,
  type CourierHttpRequest,
  type CourierHttpResponse,
} from './courier-http';
import { PathaoProvider } from './pathao.provider';
import { RedxProvider } from './redx.provider';
import { SteadfastProvider } from './steadfast.provider';

/**
 * Courier adapter tests (Phase 6, chunk 2). Every adapter is
 * exercised against a test double at the injectable HTTP client
 * boundary, never against a real courier. Configuration comes
 * from the environment at call time, so each test sets exactly
 * the variables it needs and the suite restores them after.
 */
const ENV_KEYS = [
  'PATHAO_CLIENT_ID',
  'PATHAO_CLIENT_SECRET',
  'PATHAO_USERNAME',
  'PATHAO_PASSWORD',
  'PATHAO_STORE_ID',
  'STEADFAST_API_KEY',
  'STEADFAST_SECRET_KEY',
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

const CREATE_INPUT = {
  orderNumber: 'BP-100001',
  recipientName: 'Test Buyer',
  recipientPhone: '01712345678',
  recipientAddress: 'House 5, Road 2, Mirpur 10, Dhaka, Dhaka',
  codAmountMinor: 186000,
  weightKg: 0.5,
  itemCount: 1,
};

function configurePathao(): void {
  process.env.PATHAO_CLIENT_ID = 'client-id';
  process.env.PATHAO_CLIENT_SECRET = 'client-secret';
  process.env.PATHAO_USERNAME = 'merchant@example.com';
  process.env.PATHAO_PASSWORD = 'merchant-password';
  process.env.PATHAO_STORE_ID = '42';
}

describe('courier status mapping', () => {
  const http = new FakeCourierHttpClient(() => ({ status: 200, body: {} }));

  it('maps the Pathao vocabulary onto every canonical state', () => {
    const pathao = new PathaoProvider(http);
    expect(pathao.mapStatus('pending')).toBe('created');
    expect(pathao.mapStatus('Pickup Requested')).toBe('created');
    expect(pathao.mapStatus('Picked')).toBe('picked-up');
    expect(pathao.mapStatus('in_transit')).toBe('in-transit');
    expect(pathao.mapStatus('Out for Delivery')).toBe('in-transit');
    expect(pathao.mapStatus('delivered')).toBe('delivered');
    expect(pathao.mapStatus('partial_delivered')).toBe('delivered');
    expect(pathao.mapStatus('returned')).toBe('returned');
    expect(pathao.mapStatus('cancelled')).toBe('cancelled');
    expect(pathao.mapStatus('delivery_failed')).toBe('failed');
    expect(pathao.mapStatus('something-unlisted')).toBeNull();
  });

  it('maps the Steadfast vocabulary, with unknown left unmapped', () => {
    const steadfast = new SteadfastProvider(http);
    expect(steadfast.mapStatus('pending')).toBe('created');
    expect(steadfast.mapStatus('in_transit')).toBe('in-transit');
    expect(steadfast.mapStatus('delivered')).toBe('delivered');
    expect(steadfast.mapStatus('partial_delivered')).toBe('delivered');
    expect(steadfast.mapStatus('cancelled')).toBe('cancelled');
    expect(steadfast.mapStatus('hold')).toBe('created');
    expect(steadfast.mapStatus('unknown')).toBeNull();
  });

  it('maps the RedX vocabulary, with pickup-pending read as created', () => {
    const redx = new RedxProvider(http);
    expect(redx.mapStatus('pickup-pending')).toBe('created');
    expect(redx.mapStatus('pickup-completed')).toBe('picked-up');
    expect(redx.mapStatus('in-transit')).toBe('in-transit');
    expect(redx.mapStatus('delivered')).toBe('delivered');
    expect(redx.mapStatus('returned')).toBe('returned');
    expect(redx.mapStatus('delivery-failed')).toBe('failed');
    expect(redx.mapStatus('cancelled')).toBe('cancelled');
  });
});

describe('Pathao adapter against a test double', () => {
  it('grants a token, books the parcel and returns the consignment id', async () => {
    configurePathao();
    const http = new FakeCourierHttpClient((request) => {
      if (request.url.endsWith('/issue-token')) {
        return { status: 200, body: { access_token: 'tok-1' } };
      }
      return {
        status: 200,
        body: {
          code: 200,
          data: { consignment_id: 'PATH-123', delivery_status: 'pending' },
        },
      };
    });
    const pathao = new PathaoProvider(http);
    const result = await pathao.createParcel(CREATE_INPUT);
    expect(result.outcome).toBe('created');
    expect(result.trackingId).toBe('PATH-123');
    const create = http.requests.find((request) =>
      request.url.endsWith('/aladdin/api/v1/orders'),
    );
    expect(create?.headers?.authorization).toBe('Bearer tok-1');
    const body = create?.body as Record<string, unknown>;
    expect(body.merchant_order_id).toBe('BP-100001');
    expect(body.store_id).toBe(42);
    // Minor units become taka only at this boundary.
    expect(body.amount_to_collect).toBe(1860);
    expect(body.recipient_phone).toBe('01712345678');
  });

  it('reads a status and maps it', async () => {
    configurePathao();
    const http = new FakeCourierHttpClient((request) => {
      if (request.url.endsWith('/issue-token')) {
        return { status: 200, body: { access_token: 'tok-1' } };
      }
      return {
        status: 200,
        body: { data: { delivery_status: 'in_transit' } },
      };
    });
    const pathao = new PathaoProvider(http);
    const result = await pathao.fetchStatus('PATH-123');
    expect(result.outcome).toBe('ok');
    expect(result.canonical).toBe('in-transit');
    expect(result.rawStatus).toBe('in_transit');
  });

  it('records a refusal as failed, never as created', async () => {
    configurePathao();
    const http = new FakeCourierHttpClient((request) => {
      if (request.url.endsWith('/issue-token')) {
        return { status: 200, body: { access_token: 'tok-1' } };
      }
      return { status: 200, body: { code: 401, message: 'Store not found' } };
    });
    const pathao = new PathaoProvider(http);
    const result = await pathao.createParcel(CREATE_INPUT);
    expect(result.outcome).toBe('failed');
    expect(result.trackingId).toBeNull();
    expect(result.detail).toContain('Store not found');
  });
});

describe('Steadfast adapter against a test double', () => {
  it('books with the key headers and reads the consignment envelope', async () => {
    process.env.STEADFAST_API_KEY = 'api-key';
    process.env.STEADFAST_SECRET_KEY = 'secret-key';
    const http = new FakeCourierHttpClient(() => ({
      status: 200,
      body: {
        status: 200,
        message: 'Consignment has been created successfully.',
        consignment: { consignment_id: 9001, invoice: 'BP-100001' },
      },
    }));
    const steadfast = new SteadfastProvider(http);
    const result = await steadfast.createParcel(CREATE_INPUT);
    expect(result.outcome).toBe('created');
    // A numeric consignment id is normalised to its string form.
    expect(result.trackingId).toBe('9001');
    const create = http.requests[0];
    expect(create?.url).toContain('/create_order');
    expect(create?.headers?.['api-key']).toBe('api-key');
    expect(create?.headers?.['secret-key']).toBe('secret-key');
    const body = create?.body as Record<string, unknown>;
    expect(body.invoice).toBe('BP-100001');
    expect(body.cod_amount).toBe(1860);
  });

  it('reads delivery_status by consignment id', async () => {
    process.env.STEADFAST_API_KEY = 'api-key';
    process.env.STEADFAST_SECRET_KEY = 'secret-key';
    const http = new FakeCourierHttpClient(() => ({
      status: 200,
      body: { status: 200, delivery_status: 'delivered' },
    }));
    const steadfast = new SteadfastProvider(http);
    const result = await steadfast.fetchStatus('9001');
    expect(result.outcome).toBe('ok');
    expect(result.canonical).toBe('delivered');
    expect(http.requests[0]?.url).toContain('/status_by_cid/9001');
  });
});

describe('RedX adapter against a test double', () => {
  it('books with the access token header and reads data.tracking_id', async () => {
    process.env.REDX_ACCESS_TOKEN = 'redx-token';
    const http = new FakeCourierHttpClient(() => ({
      status: 200,
      body: { data: { tracking_id: 'REX-77', status: 'pickup-pending' } },
    }));
    const redx = new RedxProvider(http);
    const result = await redx.createParcel(CREATE_INPUT);
    expect(result.outcome).toBe('created');
    expect(result.trackingId).toBe('REX-77');
    const create = http.requests[0];
    expect(create?.url).toContain('/parcel');
    expect(create?.headers?.['api-access-token']).toBe('redx-token');
    const body = create?.body as Record<string, unknown>;
    expect(body.merchant_invoice_id).toBe('BP-100001');
    expect(body.cash_collection_amount).toBe(1860);
  });
});

describe('not-configured honesty at the adapter boundary', () => {
  it('every adapter refuses cleanly with no credentials set', async () => {
    const http = new FakeCourierHttpClient(() => {
      throw new Error('the network must not be touched');
    });
    for (const provider of [
      new PathaoProvider(http),
      new SteadfastProvider(http),
      new RedxProvider(http),
    ]) {
      expect(provider.isConfigured()).toBe(false);
      const created = await provider.createParcel(CREATE_INPUT);
      expect(created.outcome).toBe('not-configured');
      expect(created.trackingId).toBeNull();
      expect(created.detail).toContain('not configured');
      const status = await provider.fetchStatus('ANY-1');
      expect(status.outcome).toBe('not-configured');
      expect(status.canonical).toBeNull();
    }
    expect(http.requests).toHaveLength(0);
  });

  it('names the missing Pathao variables', () => {
    const http = new FakeCourierHttpClient(() => ({ status: 200, body: {} }));
    const detail = new PathaoProvider(http).notConfiguredDetail();
    expect(detail).toContain('PATHAO_CLIENT_ID');
    expect(detail).toContain('PATHAO_STORE_ID');
  });
});
