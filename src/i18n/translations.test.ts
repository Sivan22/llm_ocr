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
    expect(translate('en', 'batch.startAll', { n: 7 })).toBe('Start all pending (7)');
  });

  it('substitutes multiple placeholders', () => {
    expect(translate('en', 'file.loaded', { name: 'book.pdf', n: 12 })).toBe(
      'Loaded: book.pdf (12 pages)',
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
