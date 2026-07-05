import { describe, it, expect } from 'vitest';
import { isRouteModelValid, resolveModelId, createModel } from './providers';
import type { Settings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../store/settings';

describe('providers', () => {
  it('resolves direct anthropic model id', () => {
    expect(resolveModelId('anthropic', 'claude-opus-4-8')).toBe('claude-opus-4-8');
  });

  it('resolves gateway model id with prefix', () => {
    expect(resolveModelId('gateway', 'claude-opus-4-8')).toBe('anthropic/claude-opus-4-8');
    expect(resolveModelId('gateway', 'gemini-3.1-pro')).toBe('google/gemini-3.1-pro-preview');
    expect(resolveModelId('gateway', 'gpt-4o')).toBe('openai/gpt-4o');
  });

  it('rejects invalid route+model pairs', () => {
    expect(isRouteModelValid('anthropic', 'gemini-3.1-pro')).toBe(false);
    expect(() => resolveModelId('anthropic', 'gemini-3.1-pro')).toThrow();
  });

  it('createModel throws when key for active route is missing', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, route: 'anthropic', model: 'claude-opus-4-8' };
    s.apiKeys = { anthropic: '', google: '', openai: '', gateway: '' };
    expect(() => createModel(s)).toThrow(/Anthropic API key/);
  });

  it('createModel succeeds with key present', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, route: 'gateway', model: 'gemini-3.1-pro' };
    s.apiKeys = { anthropic: '', google: '', openai: '', gateway: 'sk-test' };
    expect(() => createModel(s)).not.toThrow();
  });
});
