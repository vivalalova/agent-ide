/**
 * P2: TextMatcher.isInString / isInSingleLineComment only look at the SINGLE
 * immediately-preceding character to decide "is this quote escaped", instead
 * of counting consecutive backslashes (odd vs even parity). A string
 * containing a literal backslash written as `"\\"` (two backslash chars in
 * source) makes the scanner treat the CLOSING quote as escaped too (its
 * preceding char is a backslash), so the string state never closes and
 * everything after it on the line is misjudged as still inside the string.
 * Product code intentionally NOT fixed — must stay red until fixed.
 */
import { describe, expect, it } from 'vitest';
import { TextMatcher } from '@core/foundations/symbol-finder/text-matcher.js';

describe('TextMatcher escaped-backslash parity (adversarial P2-4)', () => {
  it('isInString: does not stay "in string" after a literal backslash content ("\\\\")', () => {
    const matcher = new TextMatcher();
    const line = 'const s = "\\\\"; foo();';
    const fooIndex = line.indexOf('foo');
    expect(matcher.isInString(line, fooIndex)).toBe(false);
  });

  it('findReferencesByTextFiltered: still finds foo() after a string containing an escaped backslash', () => {
    const matcher = new TextMatcher();
    const content = 'const s = "\\\\"; foo();\n';
    const refs = matcher.findReferencesByTextFiltered('/src/a.ts', content, 'foo');
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });

  it('isInSingleLineComment: recognizes a real // comment after a string with an escaped backslash', () => {
    const matcher = new TextMatcher();
    const line = 'const s = "\\\\"; // foo()';
    const fooIndex = line.indexOf('foo');
    expect(matcher.isInSingleLineComment(line, fooIndex)).toBe(true);
  });
});
