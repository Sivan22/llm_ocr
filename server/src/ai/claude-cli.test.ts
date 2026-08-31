import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { claudeCliAvailable, resetClaudeCliProbe } from './claude-cli.js';

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
