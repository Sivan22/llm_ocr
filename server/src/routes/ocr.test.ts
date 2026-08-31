import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ai/providers.js', () => ({
  createServerModel: vi.fn(async () => ({ __model: true })),
}));

vi.mock('../../../shared/ai/ocr.js', () => ({
  ocrPage: vi.fn(async () => ({ text: 'שלום', tokensIn: 11, tokensOut: 22 })),
}));

import { ocrRoutes } from './ocr.js';
import { ocrPage } from '../../../shared/ai/ocr.js';

const body = {
  route: 'gateway',
  model: 'gemini-3.1-pro',
  image: 'aGVsbG8=',
  imageMediaType: 'image/png',
  prompt: 'do ocr',
};

function post(payload: unknown) {
  return ocrRoutes.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('POST /api/ocr', () => {
  // Each test's mock-call assertions look at index 0 of the call history, so the
  // history must not carry calls over from earlier tests in this file.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns text, usage and the cost source', async () => {
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      text: 'שלום',
      tokensIn: 11,
      tokensOut: 22,
      costSource: 'provider',
    });
  });

  it('tags claude-cli runs so the client can show them as subscription spend', async () => {
    const res = await post({ ...body, route: 'claude-cli', model: 'cli-opus' });
    expect(await res.json()).toMatchObject({ costSource: 'claude-cli' });
  });

  it('rebuilds a data URL for the model call', async () => {
    await post(body);
    expect(vi.mocked(ocrPage).mock.calls[0][1]).toBe('data:image/png;base64,aGVsbG8=');
  });

  it('rejects an image over the 15MB base64 cap', async () => {
    const res = await post({ ...body, image: 'a'.repeat(15_000_001) });
    expect(res.status).toBe(400);
  });

  it('rejects a model that does not belong to the route', async () => {
    const res = await post({ ...body, model: 'cli-opus' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/not available on route/);
  });

  it('reports provider failures as 502 with the message', async () => {
    vi.mocked(ocrPage).mockRejectedValueOnce(new Error('upstream exploded'));
    const res = await post(body);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toMatch(/upstream exploded/);
  });

  it('forwards the client abort signal to the AI call unchanged, so a stopped run cancels in flight work', async () => {
    const controller = new AbortController();
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    // Passing a single Request to Hono's .request() forwards it unwrapped, so
    // req.signal is exactly what the route handler sees as c.req.raw.signal.
    await ocrRoutes.request(req);
    expect(vi.mocked(ocrPage).mock.calls[0][3]).toBe(req.signal);
  });
});
