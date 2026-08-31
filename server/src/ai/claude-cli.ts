import { execFile } from 'node:child_process';
import type { LanguageModel } from 'ai';
import type { ClaudeCodeSettings } from 'ai-sdk-provider-claude-code';

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

type ClaudeCodeFactory = (modelId: string, settings?: ClaudeCodeSettings) => LanguageModel;

let claudeCodeProvider: ClaudeCodeFactory | undefined;

/**
 * Memoized lazy import. Kept lazy so a box without the CLI still serves the
 * key-backed routes instead of failing at module load.
 */
export async function getClaudeCodeProvider(): Promise<ClaudeCodeFactory> {
  if (!claudeCodeProvider) {
    const mod = await import('ai-sdk-provider-claude-code');
    const provider =
      typeof mod.createClaudeCode === 'function' ? mod.createClaudeCode() : mod.claudeCode;
    claudeCodeProvider = provider as unknown as ClaudeCodeFactory;
  }
  return claudeCodeProvider;
}

/** Subprocess env for the CLI. See CLAUDE_CODE_MAX_OUTPUT_TOKENS note above. */
export function claudeCliEnv(): Record<string, string> {
  return {
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS || '64000',
  };
}
