/**
 * P2: TextMatcher's regex-literal-start heuristic (isInSingleLineComment) only
 * recognizes a preceding PUNCTUATION character (REGEX_PRECEDING_CHARS) as a
 * "this `/` starts a regex literal" signal. It has no concept of a preceding
 * KEYWORD token (`return`, `typeof`, `in`, `of`, `case`, `do`, `else`, `void`,
 * `delete`, `instanceof`, `new`, `throw`, `yield`, `await`), so `return /[a//b]/`
 * is misjudged: the `/` right after `return` isn't recognized as a regex start,
 * so the `//` inside the character class is treated as a line-comment start and
 * real code later on the same line is wrongly filtered out.
 * Regression guard: isInSingleLineComment now also recognizes a preceding
 * keyword token (REGEX_PRECEDING_KEYWORDS) as a regex-literal start, so this
 * case must stay green. Note: a preceding `)` (e.g. `if (x) /a/b/`) is left
 * as division-by-default — that ambiguity is not resolved by this fix.
 */
import { describe, expect, it } from 'vitest';
import { TextMatcher } from '@core/foundations/symbol-finder/text-matcher.js';

describe('TextMatcher regex literal after a preceding keyword token (P2)', () => {
  it('isInSingleLineComment: does not treat // inside a regex character class as a comment start after `return`', () => {
    const matcher = new TextMatcher();
    const line = 'return /[a//b]/.test(s); bar()';
    const barIndex = line.indexOf('bar');
    expect(matcher.isInSingleLineComment(line, barIndex)).toBe(false);
  });

  it('findReferencesByTextFiltered: still finds bar() after a regex literal preceded by `return`', () => {
    const matcher = new TextMatcher();
    const content = 'return /[a//b]/.test(s); bar()\n';
    const refs = matcher.findReferencesByTextFiltered('/src/a.ts', content, 'bar');
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });
});
