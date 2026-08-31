import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('ai', () => ({
  createGateway: (opts: unknown) => (id: string) => ({ __gateway: id, opts }),
}));

vi.mock('ai-sdk-provider-claude-code', () => ({
  createClaudeCode: () => (id: string, settings?: unknown) => ({ __claudeCode: id, settings }),
}));

import { createServerModel } from './providers.js';

// The CLI caps output at 32k by default and the provider ignores the AI-SDK
// maxOutputTokens param, so the subprocess env has to raise it.
const DEFAULT_CLI_ENV = { CLAUDE_CODE_MAX_OUTPUT_TOKENS: '64000' };

describe('createServerModel', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds a gateway model from the resolved id', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'sk-test');
    const model = await createServerModel('gateway', 'gemini-3.1-pro');
    expect(model).toMatchObject({ __gateway: 'google/gemini-3.1-pro-preview' });
  });

  it('throws a named error when the route key is missing', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', undefined);
    await expect(createServerModel('gateway', 'gemini-3.1-pro')).rejects.toThrow(/AI_GATEWAY_API_KEY/);
  });

  it('builds the CLI model with streamingInput always and no tools', async () => {
    vi.stubEnv('CLAUDE_CODE_MAX_OUTPUT_TOKENS', undefined);
    const model = await createServerModel('claude-cli', 'cli-opus');
    expect(model).toEqual({
      __claudeCode: 'opus',
      settings: {
        effort: 'high',
        // No tool loop — this is a plain image-in / text-out OCR call.
        tools: [],
        // MANDATORY: the provider only forwards image parts to the subprocess
        // in streaming-input mode; without it the page image is dropped.
        streamingInput: 'always',
        env: DEFAULT_CLI_ENV,
      },
    });
  });

  it('honors a CLAUDE_CODE_MAX_OUTPUT_TOKENS override', async () => {
    vi.stubEnv('CLAUDE_CODE_MAX_OUTPUT_TOKENS', '100000');
    const model = await createServerModel('claude-cli', 'cli-fable');
    expect(model).toMatchObject({
      __claudeCode: 'fable',
      settings: { env: { CLAUDE_CODE_MAX_OUTPUT_TOKENS: '100000' } },
    });
  });

  it('rejects a model that does not belong to the route', async () => {
    await expect(createServerModel('claude-cli', 'gpt-4o')).rejects.toThrow(/not available on route/);
  });
});
