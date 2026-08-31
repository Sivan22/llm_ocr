import { execFile } from 'node:child_process';

let cached: boolean | undefined;
let inflight: Promise<boolean> | undefined;

/**
 * True when a `claude` binary is on PATH. Probed once (spawning a process per
 * health check would be silly) with a 5s timeout, and never allowed to throw —
 * a missing CLI must degrade to "route unavailable", not break the server.
 *
 * The in-flight probe itself is memoized (not just the resolved value): two
 * calls that both arrive before the first `execFile` callback fires (e.g.
 * simultaneous health checks right after boot) share the same promise
 * instead of each spawning their own `claude --version` process.
 */
export function claudeCliAvailable(): Promise<boolean> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = new Promise<boolean>((resolve) => {
    execFile('claude', ['--version'], { timeout: 5000 }, (err) => {
      cached = !err;
      resolve(cached);
    });
  })
    .catch(() => {
      cached = false;
      return false;
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

/** Test seam: forget the cached probe result. */
export function resetClaudeCliProbe(): void {
  cached = undefined;
  inflight = undefined;
}
