export type WorkResult<V> = { ok: true; value: V } | { ok: false; error: string };

export interface ProgressEvent<I, V> {
  item: I;
  ok: boolean;
  value?: V;
  error?: string;
}

export interface RunBatchOpts<I, V> {
  items: I[];
  concurrency: number;
  work: (item: I, signal?: AbortSignal) => Promise<WorkResult<V>>;
  onProgress: (event: ProgressEvent<I, V>) => void;
  signal?: AbortSignal;
  maxRetries?: number;
  retryDelayMs?: number;
}

export async function runBatch<I, V>(opts: RunBatchOpts<I, V>): Promise<void> {
  const { items, concurrency, work, onProgress, signal } = opts;
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.retryDelayMs ?? 5000;

  const queue = [...items.map((item, idx) => ({ item, idx }))];
  let next = 0;

  async function workerLoop(): Promise<void> {
    while (next < queue.length) {
      if (signal?.aborted) return;
      const slot = next++;
      if (slot >= queue.length) return;
      const { item } = queue[slot];

      let attempt = 0;
      while (true) {
        attempt++;
        if (signal?.aborted) return;
        try {
          const result = await work(item, signal);
          if (result.ok) {
            onProgress({ item, ok: true, value: result.value });
          } else {
            onProgress({ item, ok: false, error: result.error });
          }
          break;
        } catch (err) {
          if (signal?.aborted) return;
          if (attempt >= maxRetries) {
            const msg = err instanceof Error ? err.message : String(err);
            onProgress({ item, ok: false, error: msg });
            break;
          }
          await delay(baseDelay * attempt, signal);
        }
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.max(1, Math.min(concurrency, items.length)); i++) {
    workers.push(workerLoop());
  }
  await Promise.all(workers);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
  });
}
