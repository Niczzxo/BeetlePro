import { describe, expect, it } from 'vitest';
import { createTestContext } from '../../testing/test-context';

/**
 * Automation service tests: the inventory lists the automations
 * that actually run, reads the live recovery settings, and
 * reports the reminder sequence as not-configured while no
 * messaging provider exists.
 */
describe('AutomationService', () => {
  it('lists the real automations with live recovery settings', async () => {
    const ctx = createTestContext();
    const items = await ctx.automation.list();
    expect(items.map((item) => item.key)).toEqual([
      'cart-recovery-detection',
      'cart-recovery-sequence',
      'lead-candidate-evaluation',
      'order-recovery-marking',
      'payment-order-sync',
    ]);
    const detection = items.find(
      (item) => item.key === 'cart-recovery-detection',
    )!;
    expect(detection.status).toBe('active');
    expect(detection.trigger).toContain('60 minutes');
    const sequence = items.find(
      (item) => item.key === 'cart-recovery-sequence',
    )!;
    expect(sequence.status).toBe('not-configured');
    expect(sequence.detail).toContain('whatsapp after 60 min');
    expect(sequence.settingsHref).toBe('/cart-recovery');
  });
});
