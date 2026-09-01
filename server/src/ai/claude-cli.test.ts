import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) => {
    // Simulate a genuinely async spawn: the callback must not fire until
    // after the current synchronous call stack (i.e. both concurrent
    // callers below) has finished, or the race this test targets can't
    // manifest.
    setTimeout(() => cb(null), 0);
  }),
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

import { claudeCliAvailable, claudeCliEnv, resetClaudeCliProbe } from './claude-cli.js';

beforeEach(() => {
  resetClaudeCliProbe();
  execFileMock.mockClear();
});

describe('claudeCliAvailable', () => {
  it('spawns execFile only once for concurrent callers', async () => {
    const [a, b] = await Promise.all([claudeCliAvailable(), claudeCliAvailable()]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * Mirrors what the provider does with `settings.env`
 * (ai-sdk-provider-claude-code/dist/index.js: `{ ...getBaseProcessEnv(),
 * ...this.settings.env, ...sdkEnv }`) and then what node:child_process does with
 * the result (entries whose value is `undefined` are dropped when envPairs is
 * built). Anything left in the returned object is a variable the `claude`
 * subprocess really sees.
 */
function subprocessEnv(inherited: Record<string, string>): Record<string, string> {
  const merged: Record<string, string | undefined> = { ...inherited, ...claudeCliEnv() };
  return Object.fromEntries(
    Object.entries(merged).filter((e): e is [string, string] => e[1] !== undefined),
  );
}

describe('claudeCliEnv', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('raises the CLI output cap, which defaults to 32k', () => {
    expect(claudeCliEnv().CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe('64000');
  });

  it('honours an explicit CLAUDE_CODE_MAX_OUTPUT_TOKENS', () => {
    process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = '128000';
    expect(claudeCliEnv().CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe('128000');
  });

  it('keeps ANTHROPIC_* auth out of the subprocess, so the route really bills the subscription', () => {
    // The provider allowlists inherited env by prefix (ANTHROPIC_, CLAUDE_,
    // AWS_, GOOGLE_), so a repo .env with ANTHROPIC_API_KEY — which
    // .env.example invites, because it enables the `anthropic` route — used to
    // reach `claude` and silently switch it to per-token API billing while the
    // UI still showed the run as subscription-billed at zero cost.
    const env = subprocessEnv({
      ANTHROPIC_API_KEY: 'sk-ant-leaked',
      ANTHROPIC_AUTH_TOKEN: 'oauth-leaked',
      ANTHROPIC_BASE_URL: 'https://proxy.example.com',
      HOME: '/home/tester',
    });
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(env).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN');
    expect(env).not.toHaveProperty('ANTHROPIC_BASE_URL');
    // Everything else the provider allowlisted must still get through.
    expect(env.HOME).toBe('/home/tester');
    expect(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe('64000');
  });

  it('suppresses with undefined rather than an empty string, which would still be set', () => {
    // `ANTHROPIC_API_KEY=` is present-but-empty in the child; only `undefined`
    // makes node:child_process omit the variable entirely.
    const raw = claudeCliEnv();
    for (const name of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL']) {
      expect(name in raw).toBe(true); // present, so the spread overrides the inherited value
      expect(raw[name]).toBeUndefined(); // and undefined, so spawn drops it
    }
  });
});
