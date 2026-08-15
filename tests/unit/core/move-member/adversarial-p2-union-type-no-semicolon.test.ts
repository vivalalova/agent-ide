/**
 * P2: findTypeAliasEnd's fallback for a multi-line union/intersection type
 * with no terminating semicolon returns the FIRST "non-continuation" line
 * (the next statement itself) instead of the LAST continuation line,
 * swallowing the following statement into the type alias's source range.
 * Product code intentionally NOT fixed — must stay red until fixed.
 */
import { describe, expect, it } from 'vitest';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';
import { extractTypeScriptMember } from '@core/move-member/extractors/typescript-extractor.js';

describe('findTypeAliasEnd multi-line union without terminating semicolon (P2-3)', () => {
  it('ends at the last union member line, not the following statement', () => {
    // No semicolon anywhere in the remaining text (ASI-style, no trailing `;`)
    // so the depth-counted main scan finds none and falls back to the
    // "first non-continuation line" heuristic under test.
    const lines = [
      'type Foo =',
      '| A',
      '| B',
      'export const x = 1'
    ];
    // last union member line is index 2 ('| B'), not index 3 (the export statement)
    expect(findTypeAliasEnd(lines, 0)).toBe(2);
  });

  it('does not swallow the following export statement into the type alias member', () => {
    const content = [
      'type Foo =',
      '| A',
      '| B',
      'export const x = 1',
      ''
    ].join('\n');

    const member = extractTypeScriptMember(content, '/src/types.ts', 'Foo');
    expect(member).not.toBeNull();
    expect(member!.sourceCode).not.toContain('export const x');
  });
});
