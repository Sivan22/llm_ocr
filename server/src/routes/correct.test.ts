import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ai/providers.js', () => ({
  createServerModel: vi.fn(async () => ({ __model: true })),
}));

vi.mock('../../../shared/ai/correct.js', () => ({
  correctPage: vi.fn(async () => ({
    corrections: [{ id: '1', old: 'שלומ', new: 'שלום', reason: 'wrong final letter', status: 'pending' }],
    tokensIn: 5,
    tokensOut: 7,
  })),
}));

import { correctRoutes } from './correct.js';
import { correctPage } from '../../../shared/ai/correct.js';

const body = {
  route: 'gateway',
  model: 'gemini-3.1-pro',
  image: 'aGVsbG8=',
  imageMediaType: 'image/png',
  prompt: 'find corrections',
};

function post(payload: unknown) {
  return correctRoutes.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('POST /api/correct', () => {
  // Each test's mock-call assertions look at index 0 of the call history, so the
  // history must not carry calls over from earlier tests in this file.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns corrections, usage and the cost source', async () => {
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      corrections: [{ id: '1', old: 'שלומ', new: 'שלום', reason: 'wrong final letter', status: 'pending' }],
      tokensIn: 5,
      tokensOut: 7,
      costSource: 'provider',
    });
  });

  it('threads the lang field through to correctPage', async () => {
    await post({ ...body, lang: 'he' });
    expect(vi.mocked(correctPage).mock.calls[0][3]).toBe('he');
  });

  it('defaults lang to "en" when the field is omitted', async () => {
    await post(body);
    expect(vi.mocked(correctPage).mock.calls[0][3]).toBe('en');
  });
});
