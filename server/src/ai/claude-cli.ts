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

/**
 * Auth variables the `claude` subprocess must never inherit.
 *
 * The provider builds the child environment from an allowlist of `process.env`
 * *by prefix* — INHERITED_ENV_PREFIXES = ["ANTHROPIC_", "CLAUDE_", "AWS_",
 * "GOOGLE_"] — and then merges `settings.env` on top. So a repo `.env` carrying
 * ANTHROPIC_API_KEY (which .env.example explicitly invites, because it is what
 * enables the `anthropic` route) would reach the CLI and make it authenticate
 * with that API key instead of the Pro/Max subscription. The billing would be
 * invisible: the UI calls this route subscription-billed, shows the cost chip as
 * `∞`, and shared/ai/pricing.ts rates every `cli-*` model at zero.
 */
const SUPPRESSED_AUTH_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
] as const;

/**
 * Subprocess env for the CLI. See CLAUDE_CODE_MAX_OUTPUT_TOKENS note above.
 *
 * `undefined` — not `''` — is what actually suppresses a variable. The provider
 * merges by object spread (`{ ...base, ...settings.env }`), so an explicit
 * `undefined` overwrites the inherited value, and Node's child_process drops
 * entries whose value is `undefined` when it builds the child's envPairs, so the
 * variable is genuinely absent in the subprocess. An empty string would survive
 * the spread and be handed to the child as `ANTHROPIC_API_KEY=`, which is present
 * (just empty) — a weaker guarantee that depends on the CLI's own truthiness
 * checks. The provider's own typing documents the same mechanism:
 * `env?: Record<string, string | undefined>` … "set a key to `undefined` to
 * remove it".
 */
export function claudeCliEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS || '64000',
  };
  for (const name of SUPPRESSED_AUTH_VARS) env[name] = undefined;
  return env;
}
