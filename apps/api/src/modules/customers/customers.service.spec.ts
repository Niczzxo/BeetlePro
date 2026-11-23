import { describe, expect, it } from 'vitest';
import {
  createTestContext,
  type TestContext,
} from '../../testing/test-context';

async function register(
  ctx: TestContext,
  fullName: string,
  email: string,
  phone: string,
) {
  return ctx.customers.register({
    fullName,
    email,
    phone,
    password: 'buyer-pass-123',
  });
}

describe('CustomersService staff list (Phase 4 chunk 2)', () => {
  it('lists every customer newest first, without password hashes', async () => {
    const ctx = createTestContext();
    await register(ctx, 'Ayesha Rahman', 'ayesha@example.com', '01711111111');
    await register(ctx, 'Tanvir Hasan', 'tanvir@example.com', '01722222222');

    const items = ctx.customers.listStaff();
    expect(items).toHaveLength(2);
    expect(items[0]?.fullName).toBe('Tanvir Hasan');
    expect(items[1]?.fullName).toBe('Ayesha Rahman');
    for (const item of items) {
      expect(item).not.toHaveProperty('passwordHash');
    }
  });

  it('includes passwordless checkout customers in the list', async () => {
    const ctx = createTestContext();
    ctx.customers.findOrCreateForCheckout({
      fullName: 'Guest Buyer',
      phone: '01733333333',
    });
    const items = ctx.customers.listStaff();
    expect(items.map((item) => item.fullName)).toContain('Guest Buyer');
  });

  it('searches across name, email and phone, case-insensitively', async () => {
    const ctx = createTestContext();
    await register(ctx, 'Ayesha Rahman', 'ayesha@example.com', '01711111111');
    await register(ctx, 'Tanvir Hasan', 'tanvir@example.com', '01722222222');

    expect(
      ctx.customers.listStaff({ search: 'AYESHA' }).map((c) => c.fullName),
    ).toEqual(['Ayesha Rahman']);
    expect(
      ctx.customers
        .listStaff({ search: 'tanvir@example' })
        .map((c) => c.fullName),
    ).toEqual(['Tanvir Hasan']);
    expect(
      ctx.customers.listStaff({ search: '0172222' }).map((c) => c.fullName),
    ).toEqual(['Tanvir Hasan']);
    expect(ctx.customers.listStaff({ search: 'nobody' })).toEqual([]);
  });

  it('honours the limit', async () => {
    const ctx = createTestContext();
    await register(ctx, 'Buyer One', 'one@example.com', '01711111111');
    await register(ctx, 'Buyer Two', 'two@example.com', '01722222222');
    await register(ctx, 'Buyer Three', 'three@example.com', '01733333333');
    expect(ctx.customers.listStaff({ limit: 2 })).toHaveLength(2);
  });
});
