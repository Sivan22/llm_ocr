import { execFile } from 'node:child_process';

let cached: boolean | undefined;

/**
 * True when a `claude` binary is on PATH. Probed once (spawning a process per
 * health check would be silly) with a 5s timeout, and never allowed to throw —
 * a missing CLI must degrade to "route unavailable", not break the server.
 */
export function claudeCliAvailable(): Promise<boolean> {
  if (cached !== undefined) return Promise.resolve(cached);
  return new Promise<boolean>((resolve) => {
    execFile('claude', ['--version'], { timeout: 5000 }, (err) => {
      cached = !err;
      resolve(cached);
    });
  }).catch(() => {
    cached = false;
    return false;
  });
}

/** Test seam: forget the cached probe result. */
export function resetClaudeCliProbe(): void {
  cached = undefined;
}
