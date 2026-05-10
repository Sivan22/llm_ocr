import { describe, it, expect } from 'vitest';
import { rateFor, estimateCost } from './pricing';

describe('pricing', () => {
  it('returns rates for known model', () => {
    const r = rateFor('claude-opus-4-7');
    expect(r.inputPerMillion).toBeGreaterThan(0);
    expect(r.outputPerMillion).toBeGreaterThan(0);
  });

  it('throws for unknown model', () => {
    expect(() => rateFor('made-up-model' as any)).toThrow();
  });

  it('computes cost from token counts', () => {
    const cost = estimateCost('claude-opus-4-7', { tokensIn: 1_000_000, tokensOut: 1_000_000 });
    const r = rateFor('claude-opus-4-7');
    expect(cost).toBeCloseTo(r.inputPerMillion + r.outputPerMillion, 5);
  });
});
