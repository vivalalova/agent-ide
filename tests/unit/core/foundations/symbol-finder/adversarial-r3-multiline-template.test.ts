import { describe, expect, it } from 'vitest';
import { TextMatcher } from '@core/foundations/symbol-finder/text-matcher.js';

describe('text matcher multiline template state (adversarial R3)', () => {
  it('does not report template text while still reporting code after the template', () => {
    const content = [
      'const template = `',
      'target',
      '`; target();'
    ].join('\n');
    const refs = new TextMatcher().findReferencesByTextFiltered('/src/a.ts', content, 'target');

    expect(refs.map(ref => ref.location.range.start.line)).toEqual([3]);
  });
});
