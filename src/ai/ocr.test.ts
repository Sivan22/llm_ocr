import { describe, it, expect } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { ocrPage } from './ocr';

describe('ocrPage', () => {
  it('passes image + prompt to model and returns text + usage', async () => {
    const fakeModel = new MockLanguageModelV3({
      doGenerate: (async () => ({
        content: [{ type: 'text' as const, text: 'דברי תורה' }],
        usage: {
          inputTokens: { total: 1500, noCache: 0, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 25, text: 25, reasoning: 0 },
        },
        finishReason: 'stop' as const,
        warnings: [],
      })) as never,
    });

    const result = await ocrPage(fakeModel, 'data:image/png;base64,XXX', 'OCR this');
    expect(result.text).toBe('דברי תורה');
    expect(result.tokensIn).toBe(1500);
    expect(result.tokensOut).toBe(25);
  });
});
