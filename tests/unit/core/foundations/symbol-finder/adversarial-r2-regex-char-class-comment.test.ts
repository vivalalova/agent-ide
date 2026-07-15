/**
 * P2 (round 2 finding 5): TextMatcher.isInSingleLineComment has no concept of regex
 * literals. A regex literal whose character class contains a `//` sequence (e.g.
 * `/[//]/`) makes the scanner treat that `//` as a line-comment start, so real code
 * appearing later on the same line (`target()`) is misjudged as being inside a
 * comment and filtered out.
 */
import { describe, expect, it } from 'vitest';
import { TextMatcher } from '@core/foundations/symbol-finder/text-matcher.js';

describe('TextMatcher regex literal character class vs line comment (R2 finding 5)', () => {
  it('isInSingleLineComment: does not treat // inside a regex character class as a comment start', () => {
    const matcher = new TextMatcher();
    const line = 'const re = /[//]/; target();';
    const targetIndex = line.indexOf('target');
    expect(matcher.isInSingleLineComment(line, targetIndex)).toBe(false);
  });

  it('findReferencesByTextFiltered: still finds target() after a regex literal with // in its character class', () => {
    const matcher = new TextMatcher();
    const content = 'const re = /[//]/; target();\n';
    const refs = matcher.findReferencesByTextFiltered('/src/a.ts', content, 'target');
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });
});
