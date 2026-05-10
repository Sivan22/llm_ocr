import { describe, it, expect } from 'vitest';
import { substitute } from './prompt';

describe('prompt.substitute', () => {
  it('replaces single {text} placeholder', () => {
    expect(substitute('Fix: {text}', { text: 'abc' })).toBe('Fix: abc');
  });

  it('replaces multiple occurrences', () => {
    expect(substitute('{text} again {text}', { text: 'X' })).toBe('X again X');
  });

  it('returns input unchanged when no placeholder', () => {
    expect(substitute('no placeholder here', { text: 'X' })).toBe('no placeholder here');
  });

  it('does not interpret regex chars in replacement value', () => {
    expect(substitute('Got {text}', { text: '$1 and \\n' })).toBe('Got $1 and \\n');
  });
});
