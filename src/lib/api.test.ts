import { describe, it, expect, vi, afterEach } from 'vitest';
import { splitDataUrl, probeServer, ocrPageViaServer, MAX_IMAGE_BASE64 } from './api';

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

  it('throws on a non-data URL rather than sending garbage', () => {
    expect(() => splitDataUrl('https://example.com/a.png')).toThrow(/data URL/);
  });
});

describe('probeServer', () => {
  it('reports unavailable when the probe rejects', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => { throw new Error('offline'); }));
    expect(await probeServer('http://localhost:3102')).toEqual({
      available: false, claudeCli: false, routes: [],
    });
  });

  it('passes through the reported capabilities', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => new Response(
      JSON.stringify({ status: 'ok', claudeCli: true, routes: ['gateway'] }),
      { status: 200 },
    )));
    expect(await probeServer('http://localhost:3102')).toEqual({
      available: true, claudeCli: true, routes: ['gateway'],
    });
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

  it('surfaces the server error message', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchMock>(async () => new Response(
      JSON.stringify({ error: 'AI_GATEWAY_API_KEY is not set on the server.' }),
      { status: 400 },
    )));
    await expect(ocrPageViaServer(args)).rejects.toThrow(/AI_GATEWAY_API_KEY/);
  });

  it('rejects an oversized image before it hits the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const big = `data:image/png;base64,${'a'.repeat(MAX_IMAGE_BASE64 + 1)}`;
    await expect(ocrPageViaServer({ ...args, imageDataUrl: big })).rejects.toThrow(/too large/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
