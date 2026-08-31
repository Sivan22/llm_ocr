import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout } from './fetch-with-timeout';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * Mimics real `fetch`'s abort semantics: rejects with an AbortError the moment the
 * signal it was given aborts, and otherwise never resolves on its own — the test
 * drives either a caller abort or the internal timeout to settle it.
 */
function abortableFetchMock(): (url: string, init?: RequestInit) => Promise<Response> {
  return (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
}

describe('fetchWithTimeout', () => {
  it('rejects with a real abort error, not the timeout message, when the caller aborts', async () => {
    vi.stubGlobal('fetch', vi.fn(abortableFetchMock()));
    const controller = new AbortController();
    const promise = fetchWithTimeout('http://localhost:3102/api/ocr', {
      signal: controller.signal,
      timeout: 50000,
    });
    controller.abort();

    try {
      await promise;
      expect.unreachable('expected fetchWithTimeout to reject');
    } catch (err) {
      // Real `fetch` rejects aborts with a DOMException, which — unlike Node's native
      // one — does not extend Error under jsdom, so we assert by name, not by
      // `instanceof Error`.
      expect((err as DOMException).name).toBe('AbortError');
      expect((err as DOMException).message).not.toMatch(/timed out/i);
    }
  });

  it('still reports the timeout message when the internal timeout fires', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(abortableFetchMock()));

    const promise = fetchWithTimeout('http://localhost:3102/api/ocr', { timeout: 1000 });
    const assertion = expect(promise).rejects.toThrow('Request timed out after 1 seconds');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('resolves normally when no caller signal is supplied', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    const res = await fetchWithTimeout('http://localhost:3102/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
