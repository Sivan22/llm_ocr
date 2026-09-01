import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  ocrPageViaServer: vi.fn(async () => ({ text: 'server', costSource: 'provider' })),
  correctPageViaServer: vi.fn(async () => ({ corrections: [], costSource: 'provider' })),
}));

vi.mock('./providers', () => ({
  createModel: vi.fn(() => ({ __browserModel: true })),
}));

vi.mock('../../shared/ai/ocr', () => ({
  ocrPage: vi.fn(async () => ({ text: 'browser' })),
}));

import { effectiveConcurrency, runOcrPage, SERVER_CONCURRENCY_CAP, CLAUDE_CLI_CONCURRENCY } from './dispatch';
import { ocrPageViaServer } from '../lib/api';
import { ocrPage } from '../../shared/ai/ocr';
import { DEFAULT_SETTINGS } from '../store/settings';

describe('effectiveConcurrency', () => {
  it('leaves browser-direct runs alone — they fan out to the provider, not to us', () => {
    expect(effectiveConcurrency(50, 'gateway', false)).toBe(50);
  });

  it('caps server-mode runs at the browser per-origin connection limit', () => {
    // 50 concurrent POSTs to one origin queue behind ~6 connections and fail
    // as "Failed to fetch" — see Mugah pdf-proofread orchestrator.
    expect(effectiveConcurrency(50, 'gateway', true)).toBe(SERVER_CONCURRENCY_CAP);
  });

  it('never raises a lower batch size', () => {
    expect(effectiveConcurrency(3, 'gateway', true)).toBe(3);
  });

  it('caps claude-cli harder — one subprocess per page', () => {
    expect(effectiveConcurrency(50, 'claude-cli', true)).toBe(CLAUDE_CLI_CONCURRENCY);
  });
});

describe('runOcrPage', () => {
  const settings = { ...DEFAULT_SETTINGS, route: 'gateway' as const, model: 'gemini-3.1-pro' as const };

  it('uses the server when it is available', async () => {
    const res = await runOcrPage({
      settings, serverAvailable: true, imageDataUrl: 'data:image/png;base64,aGk=',
    });
    expect(res.text).toBe('server');
    expect(ocrPageViaServer).toHaveBeenCalled();
    expect(ocrPage).not.toHaveBeenCalled();
  });

  it('falls back to the in-browser provider when the server is absent', async () => {
    const res = await runOcrPage({
      settings, serverAvailable: false, imageDataUrl: 'data:image/png;base64,aGk=',
    });
    expect(res.text).toBe('browser');
    expect(ocrPage).toHaveBeenCalled();
  });
});
