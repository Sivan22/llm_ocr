import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ai/providers.js', () => ({
  createServerModel: vi.fn(async () => ({ __model: true })),
}));

vi.mock('../../../shared/ai/ocr.js', () => ({
  ocrPage: vi.fn(async () => ({ text: 'שלום', tokensIn: 11, tokensOut: 22 })),
}));

import { ocrRoutes } from './ocr.js';
import { MAX_BODY_BYTES } from './page-route.js';
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

  it('accepts the webp and gif pages the browser-direct path already handled', async () => {
    // DropStrip takes image/* and passes the File's own type through, so these
    // reach the server for real; rejecting them made the client retry 3x.
    for (const imageMediaType of ['image/webp', 'image/gif']) {
      const res = await post({ ...body, imageMediaType });
      expect(res.status).toBe(200);
    }
    expect(vi.mocked(ocrPage).mock.calls[0][1]).toBe('data:image/webp;base64,aGVsbG8=');
  });

  it('still rejects an image type no provider takes', async () => {
    const res = await post({ ...body, imageMediaType: 'image/bmp' });
    expect(res.status).toBe(400);
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

  it('forwards the client abort signal to the AI call, so a stopped run cancels in flight work', async () => {
    const controller = new AbortController();
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    // Passing a single Request to Hono's .request() forwards it unwrapped, so
    // c.req.raw.signal descends from req.signal. Identity is asserted by
    // propagation rather than `toBe`: the bodyLimit middleware rebuilds the
    // request (`new Request(c.req.raw, { body })`), and per the fetch spec the
    // rebuilt request gets a *new* AbortSignal that follows the original. The
    // link in the Stop chain is the propagation, not the object identity.
    await ocrRoutes.request(req);
    const forwarded = vi.mocked(ocrPage).mock.calls[0][3];
    expect(forwarded).toBeInstanceOf(AbortSignal);
    expect(forwarded?.aborted).toBe(false);
    controller.abort();
    expect(forwarded?.aborted).toBe(true);
  });

  it('rejects an oversized body with 413 before it is buffered into JSON', async () => {
    // c.req.json() buffers the whole body before zod's 15MB field cap can apply,
    // so the limit has to sit in front of the handler.
    const res = await post({ ...body, image: 'a'.repeat(MAX_BODY_BYTES + 1) });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toMatch(/too large|exceeds/i);
  });

  it('still accepts a legitimate max-size page image', async () => {
    // The zod field cap is 15MB of base64; the body cap must leave room for the
    // JSON envelope around it, or a real max-size page would 413.
    const res = await post({ ...body, image: 'a'.repeat(15_000_000) });
    expect(res.status).toBe(200);
  });
});
