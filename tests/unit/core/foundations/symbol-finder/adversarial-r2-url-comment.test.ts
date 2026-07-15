/**
 * P2: text-matcher treats // inside URL strings as line comments, skipping later code.
 */
import { describe, expect, it } from 'vitest';
import { TextMatcher } from '@core/foundations/symbol-finder/text-matcher.js';

describe('TextMatcher URL vs comment (adversarial R2)', () => {
  it('finds foo() after a URL string on the same line', () => {
    const matcher = new TextMatcher();
    const content = 'const url = "http://example.com"; foo();\n';
    const refs = matcher.findReferencesByTextFiltered('/src/a.ts', content, 'foo');
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });
});
