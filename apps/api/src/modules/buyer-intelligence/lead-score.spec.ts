import { describe, expect, it } from 'vitest';
import {
  computeLeadScore,
  scoreBand,
  scoreCartValue,
  scoreCheckoutProgress,
  scoreProductViews,
  scoreRecency,
  scoreRepeatSessions,
  type SessionFacts,
} from './lead-score';

const NOW = new Date('2026-11-23T12:00:00.000Z');

function facts(overrides: Partial<SessionFacts> = {}): SessionFacts {
  return {
    lastActivityAt: NOW.toISOString(),
    eventCounts: {},
    maxCartValueMinor: 0,
    visitorSessionCount: 1,
    ...overrides,
  };
}

describe('lead score signals', () => {
  it('scores recency in bands', () => {
    const hoursAgo = (hours: number) =>
      new Date(NOW.getTime() - hours * 3_600_000).toISOString();
    expect(scoreRecency(hoursAgo(1), NOW)).toBe(25);
    expect(scoreRecency(hoursAgo(24), NOW)).toBe(25);
    expect(scoreRecency(hoursAgo(3 * 24), NOW)).toBe(15);
    expect(scoreRecency(hoursAgo(20 * 24), NOW)).toBe(5);
    expect(scoreRecency(hoursAgo(40 * 24), NOW)).toBe(0);
  });

  it('scores product views at +4 each, capped at +20', () => {
    expect(scoreProductViews(0)).toBe(0);
    expect(scoreProductViews(3)).toBe(12);
    expect(scoreProductViews(5)).toBe(20);
    expect(scoreProductViews(12)).toBe(20);
  });

  it('scores repeat sessions at +5 each beyond the first, capped at +10', () => {
    expect(scoreRepeatSessions(1)).toBe(0);
    expect(scoreRepeatSessions(2)).toBe(5);
    expect(scoreRepeatSessions(3)).toBe(10);
    expect(scoreRepeatSessions(9)).toBe(10);
  });

  it('scores cart value in taka bands', () => {
    expect(scoreCartValue(0)).toBe(0);
    expect(scoreCartValue(1_000)).toBe(5);
    expect(scoreCartValue(50_000)).toBe(10);
    expect(scoreCartValue(100_000)).toBe(18);
    expect(scoreCartValue(200_000)).toBe(25);
    expect(scoreCartValue(900_000)).toBe(25);
  });

  it('scores checkout progress: start +15, step +10', () => {
    expect(scoreCheckoutProgress({})).toBe(0);
    expect(scoreCheckoutProgress({ 'checkout-start': 1 })).toBe(15);
    expect(scoreCheckoutProgress({ 'checkout-step': 2 })).toBe(10);
    expect(
      scoreCheckoutProgress({ 'checkout-start': 1, 'checkout-step': 1 }),
    ).toBe(25);
  });

  it('caps the total at 100 even when the signals sum higher', () => {
    const maxed = computeLeadScore(
      facts({
        eventCounts: {
          'product-view': 9,
          'checkout-start': 1,
          'checkout-step': 3,
        },
        maxCartValueMinor: 500_000,
        visitorSessionCount: 6,
      }),
      NOW,
    );
    // 25 + 20 + 10 + 25 + 25 = 105 before the cap.
    expect(maxed.score).toBe(100);
    expect(maxed.breakdown).toEqual({
      recency: 25,
      productViews: 20,
      repeatSessions: 10,
      cartValue: 25,
      checkoutProgress: 25,
    });
    expect(maxed.band).toBe('hot');
  });

  it('bands scores as hot, warm and cold', () => {
    expect(scoreBand(70)).toBe('hot');
    expect(scoreBand(100)).toBe('hot');
    expect(scoreBand(40)).toBe('warm');
    expect(scoreBand(69)).toBe('warm');
    expect(scoreBand(39)).toBe('cold');
    expect(scoreBand(0)).toBe('cold');
  });

  it('scores an empty fresh session as recency only', () => {
    const result = computeLeadScore(facts(), NOW);
    expect(result.score).toBe(25);
    expect(result.band).toBe('cold');
  });
});
