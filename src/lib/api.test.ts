import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  splitDataUrl, probeServer, ocrPageViaServer, MAX_IMAGE_BASE64,
  ApiRequestError, isNonRetryable,
} from './api';

type FetchMock = (_url: string, _init?: RequestInit) => Promise<Response>;

afterEach(() => vi.unstubAllGlobals());

describe('splitDataUrl', () => {
  it('strips the data: prefix and reports the media type', () => {
    expect(splitDataUrl('data:image/png;base64,aGVsbG8=')).toEqual({
      image: 'aGVsbG8=',
      imageMediaType: 'image/png',
    });
  });

  it('handles jpeg', () => {
    expect(splitDataUrl('data:image/jpeg;base64,QQ==').imageMediaType).toBe('image/jpeg');
  });

  it('handles the other two types every provider accepts', () => {
    // DropStrip accepts image/* and passes the File's own type through, so a
    // dropped .webp arrives as data:image/webp. Browser-direct already worked;
    // server mode used to reject it and then retry the rejection 3x.
    expect(splitDataUrl('data:image/webp;base64,QQ==').imageMediaType).toBe('image/webp');
    expect(splitDataUrl('data:image/gif;base64,QQ==').imageMediaType).toBe('image/gif');
  });

  it('throws on a non-data URL rather than sending garbage', () => {
    expect(() => splitDataUrl('https://example.com/a.png')).toThrow(/data URL/);
  });

  it('names the offending type for an image kind no provider takes', () => {
    expect(() => splitDataUrl('data:image/bmp;base64,QQ==')).toThrow(/image\/bmp/);
  });
});

describe('isNonRetryable', () => {
  it('is true for a structural 4xx from our own server', () => {
    expect(isNonRetryable(new ApiRequestError('Model "cli-opus" is not available on route "gateway".', 400))).toBe(true);
    expect(isNonRetryable(new ApiRequestError('too large', 413))).toBe(true);
  });

  it('keeps 5xx retryable — that is an upstream hiccup, not a bad request', () => {
    expect(isNonRetryable(new ApiRequestError('upstream exploded', 502))).toBe(false);
    expect(isNonRetryable(new ApiRequestError('boom', 500))).toBe(false);
  });

  it('keeps 408 and 429 retryable', () => {
    expect(isNonRetryable(new ApiRequestError('slow down', 429))).toBe(false);
    expect(isNonRetryable(new ApiRequestError('timeout', 408))).toBe(false);
  });

  it('keeps plain network errors retryable', () => {
    expect(isNonRetryable(new TypeError('Failed to fetch'))).toBe(false);
    expect(isNonRetryable('nope')).toBe(false);
  });
});

describe('probeServer', () => {
  it('reports unavailable when the probe rejects', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => { throw new Error('offline'); }));
    expect(await probeServer('http://localhost:3102')).toEqual({
      available: false, reachable: false, claudeCli: false, routes: [],
    });
  });

  it('passes through the reported capabilities', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => new Response(
      JSON.stringify({ status: 'ok', claudeCli: true, routes: ['gateway'] }),
      { status: 200 },
    )));
    expect(await probeServer('http://localhost:3102')).toEqual({
      available: true, reachable: true, claudeCli: true, routes: ['gateway'],
    });
  });

  it('treats a server with no keys and no CLI as unavailable but reachable', async () => {
    // It can serve nothing, so the app must fall back to browser-direct rather
    // than hide the key field and 400 every page.
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => new Response(
      JSON.stringify({ status: 'ok', claudeCli: false, routes: [] }),
      { status: 200 },
    )));
    expect(await probeServer('http://localhost:3102')).toEqual({
      available: false, reachable: true, claudeCli: false, routes: [],
    });
  });

  it('counts a CLI-only server as available', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => new Response(
      JSON.stringify({ status: 'ok', claudeCli: true, routes: [] }),
      { status: 200 },
    )));
    expect(await probeServer('http://localhost:3102')).toMatchObject({ available: true });
  });

  it('reports unavailable when no base URL is configured', async () => {
    expect(await probeServer('')).toMatchObject({ available: false });
  });
});

describe('ocrPageViaServer', () => {
  const args = {
    base: 'http://localhost:3102',
    route: 'gateway' as const,
    model: 'gemini-3.1-pro' as const,
    imageDataUrl: 'data:image/png;base64,aGVsbG8=',
    prompt: 'do ocr',
  };

  it('posts the split image and returns the parsed result', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => new Response(
      JSON.stringify({ text: 'שלום', tokensIn: 1, tokensOut: 2, costSource: 'provider' }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const res = await ocrPageViaServer(args);
    expect(res).toMatchObject({ text: 'שלום', tokensIn: 1, tokensOut: 2 });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body).toMatchObject({ image: 'aGVsbG8=', imageMediaType: 'image/png' });
    expect(body.imageDataUrl).toBeUndefined();
  });

  it('surfaces the server error message, tagged with the status so retries can be skipped', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => new Response(
      JSON.stringify({ error: 'AI_GATEWAY_API_KEY is not set on the server.' }),
      { status: 400 },
    )));
    await expect(ocrPageViaServer(args)).rejects.toThrow(/AI_GATEWAY_API_KEY/);
    const err = await ocrPageViaServer(args).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(400);
    expect(isNonRetryable(err)).toBe(true);
  });

  it('leaves a 502 retryable', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => new Response(
      JSON.stringify({ error: 'upstream exploded' }),
      { status: 502 },
    )));
    const err = await ocrPageViaServer(args).catch((e: unknown) => e);
    expect(isNonRetryable(err)).toBe(false);
  });

  it('rejects an oversized image before it hits the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const big = `data:image/png;base64,${'a'.repeat(MAX_IMAGE_BASE64 + 1)}`;
    await expect(ocrPageViaServer({ ...args, imageDataUrl: big })).rejects.toThrow(/too large/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
