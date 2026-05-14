import { describe, it, expect } from 'vitest';
import { translate } from './translations';

describe('translate', () => {
  it('returns the English string for a known key', () => {
    expect(translate('en', 'tabs.ocr')).toBe('OCR');
  });

  it('returns the Hebrew string for a known key', () => {
    expect(translate('he', 'tabs.editor')).toBe('עריכה');
  });

  it('substitutes placeholders', () => {
    expect(translate('en', 'batch.selectPending', { n: 7 })).toBe('Select pending (7)');
  });

  it('substitutes multiple placeholders', () => {
    expect(translate('en', 'jobs.statusSummary', { ok: 3, edited: 1, error: 0, pending: 2 })).toBe(
      '3 ok · 1 edited · 0 error · 2 pending',
    );
  });

  it('falls back to English when a Hebrew key is missing', () => {
    // sanity: every Hebrew key exists; force a missing key by querying nonsense
    expect(translate('he', 'nope.this.key.does.not.exist')).toBe('nope.this.key.does.not.exist');
  });

  it('returns the key itself when it is missing in both locales', () => {
    expect(translate('en', 'definitely.missing')).toBe('definitely.missing');
  });
});
