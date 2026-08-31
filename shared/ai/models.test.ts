import { describe, it, expect } from 'vitest';
import { isRouteModelValid, resolveModelId, modelsForRoute } from './models';
import { estimateCost } from './pricing';

describe('claude-cli route', () => {
  it('maps cli models to the provider aliases', () => {
    expect(resolveModelId('claude-cli', 'cli-opus')).toBe('opus');
    expect(resolveModelId('claude-cli', 'cli-sonnet')).toBe('sonnet');
    expect(resolveModelId('claude-cli', 'cli-haiku')).toBe('haiku');
    expect(resolveModelId('claude-cli', 'cli-fable')).toBe('fable');
  });

  it('lists exactly the four cli models', () => {
    expect(modelsForRoute('claude-cli')).toEqual(['cli-opus', 'cli-sonnet', 'cli-haiku', 'cli-fable']);
  });

  it('rejects cli models on other routes and vice versa', () => {
    expect(isRouteModelValid('gateway', 'cli-opus')).toBe(false);
    expect(isRouteModelValid('claude-cli', 'gpt-4o')).toBe(false);
    expect(() => resolveModelId('anthropic', 'cli-opus')).toThrow();
  });

  it('costs nothing — CLI runs bill against the subscription', () => {
    expect(estimateCost('cli-opus', { tokensIn: 1_000_000, tokensOut: 1_000_000 })).toBe(0);
  });

  it('still prices gateway models', () => {
    expect(estimateCost('gpt-4o-mini', { tokensIn: 1_000_000, tokensOut: 0 })).toBeCloseTo(0.15);
  });
});
