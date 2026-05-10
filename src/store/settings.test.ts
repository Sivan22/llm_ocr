import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings';

beforeEach(() => {
  localStorage.clear();
});

describe('settings store', () => {
  it('returns defaults when storage is empty', () => {
    const s = loadSettings();
    expect(s.version).toBe(1);
    expect(s.route).toBe('gateway');
    expect(s.batchSize).toBeGreaterThan(0);
    expect(s.prompts.ocr).toContain('OCR');
    expect(s.prompts.custom).toBe('');
  });

  it('round-trips multi-line prompts', () => {
    const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    s.prompts.ocr = 'line1\nline2\nline3';
    saveSettings(s);
    expect(loadSettings().prompts.ocr).toBe('line1\nline2\nline3');
  });

  it('returns defaults on corrupt JSON', () => {
    localStorage.setItem('llm_ocr_web:settings:v1', '{not json');
    const s = loadSettings();
    expect(s.version).toBe(1);
  });

  it('merges with defaults when stored object is partial', () => {
    localStorage.setItem(
      'llm_ocr_web:settings:v1',
      JSON.stringify({ version: 1, route: 'anthropic' }),
    );
    const s = loadSettings();
    expect(s.route).toBe('anthropic');
    expect(s.apiKeys.anthropic).toBe(''); // default
    expect(s.prompts.ocr).toContain('OCR'); // default
  });
});
