import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ai/claude-cli.js', () => ({
  claudeCliAvailable: vi.fn(async () => true),
}));

import { availableRoutes, healthRoutes } from './health.js';
import { claudeCliAvailable } from '../ai/claude-cli.js';

describe('availableRoutes', () => {
  it('lists only routes whose key is present in the env', () => {
    expect(availableRoutes({ AI_GATEWAY_API_KEY: 'sk-test' })).toEqual(['gateway']);
  });

  it('ignores blank keys', () => {
    expect(availableRoutes({ AI_GATEWAY_API_KEY: '   ', OPENAI_API_KEY: 'sk-o' })).toEqual(['openai']);
  });

  it('returns an empty list when nothing is configured', () => {
    expect(availableRoutes({})).toEqual([]);
  });
});

describe('GET /api/health', () => {
  beforeEach(() => vi.mocked(claudeCliAvailable).mockResolvedValue(true));

  it('reports status, the probed CLI flag, and the key-backed routes', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test';
    const res = await healthRoutes.request('/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', claudeCli: true, routes: ['gateway'] });
  });

  it('reports claudeCli false when the probe fails', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test';
    vi.mocked(claudeCliAvailable).mockResolvedValue(false);
    const res = await healthRoutes.request('/');
    expect(await res.json()).toMatchObject({ claudeCli: false });
  });
});
