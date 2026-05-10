import { describe, it, expect, vi } from 'vitest';
import { runBatch } from './orchestrator';

describe('runBatch', () => {
  it('respects concurrency cap', async () => {
    let active = 0, peak = 0;
    const work = vi.fn(async (n: number) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { ok: true as const, value: `p${n}` };
    });
    await runBatch({
      items: [0, 1, 2, 3, 4, 5, 6, 7],
      concurrency: 3,
      work,
      onProgress: () => {},
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(work).toHaveBeenCalledTimes(8);
  });

  it('reports progress for each item', async () => {
    const events: any[] = [];
    await runBatch({
      items: [0, 1, 2],
      concurrency: 2,
      work: async (n) => ({ ok: true as const, value: n * 10 }),
      onProgress: (e) => events.push(e),
    });
    expect(events.map((e) => e.item).sort()).toEqual([0, 1, 2]);
    expect(events.every((e) => e.ok && e.value !== undefined)).toBe(true);
  });

  it('reports failures without aborting other items', async () => {
    const events: any[] = [];
    await runBatch({
      items: [0, 1, 2],
      concurrency: 2,
      work: async (n) => n === 1 ? { ok: false as const, error: 'boom' } : { ok: true as const, value: n },
      onProgress: (e) => events.push(e),
    });
    expect(events).toHaveLength(3);
    const failed = events.find((e) => !e.ok);
    expect(failed.error).toBe('boom');
  });

  it('honors abort signal', async () => {
    const ctrl = new AbortController();
    const events: any[] = [];
    const promise = runBatch({
      items: [0, 1, 2, 3, 4, 5],
      concurrency: 1,
      work: async (n, sig) => {
        await new Promise((r, j) => {
          const t = setTimeout(() => r(undefined), 20);
          sig?.addEventListener('abort', () => { clearTimeout(t); j(new Error('abort')); });
        });
        return { ok: true as const, value: n };
      },
      onProgress: (e) => events.push(e),
      signal: ctrl.signal,
    });
    setTimeout(() => ctrl.abort(), 5);
    await promise;
    expect(events.length).toBeLessThan(6);
  });

  it('retries transient failures up to maxRetries', async () => {
    let attempts = 0;
    const events: any[] = [];
    await runBatch({
      items: [0],
      concurrency: 1,
      maxRetries: 3,
      retryDelayMs: 1,
      work: async () => {
        attempts++;
        if (attempts < 3) throw new Error('transient');
        return { ok: true as const, value: 'done' };
      },
      onProgress: (e) => events.push(e),
    });
    expect(attempts).toBe(3);
    expect(events[0].ok).toBe(true);
  });
});
