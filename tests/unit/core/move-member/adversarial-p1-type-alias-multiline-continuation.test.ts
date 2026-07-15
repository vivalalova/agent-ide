/**
 * P1 (regression from the previous round's ASI fix): findTypeAliasEnd's
 * newline-triggered ASI heuristic only checks whether the NEXT line starts
 * with `|`/`&`, and never tracks `<...>` generic-argument depth. Several
 * legitimate multi-line type alias shapes get truncated after their first
 * line:
 *  - a generic type argument list broken across lines (`Foo<\n  Bar\n>;`)
 *    isn't depth-tracked at all, so the line ending in `<` looks "complete"
 *    and the ASI heuristic fires immediately;
 *  - a line ending in an unfinished token (`=`, `extends`, `?`, `:`) is not
 *    recognized as "still needs the next line" unless the NEXT line happens
 *    to start with `|`/`&`;
 *  - a conditional type's `? D` / `: E` continuation lines aren't in the
 *    recognized next-line-start set;
 *  - a comment line interposed between a union alias and its next `|`
 *    continuation breaks the next-line-start check entirely.
 * Regression guard: findTypeAliasEnd now tracks `<>` generic depth and
 * recognizes these continuation shapes, so all cases below must stay green.
 */
import { describe, expect, it } from 'vitest';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';
import { extractTypeScriptMember } from '@core/move-member/extractors/typescript-extractor.js';

describe('findTypeAliasEnd multi-line continuation shapes (P1)', () => {
  it('does not truncate a multi-line generic type argument list', () => {
    const lines = [
      'type User = Foo<',
      '  Bar',
      '>;'
    ];
    expect(findTypeAliasEnd(lines, 0)).toBe(2);
  });

  it('does not truncate after a line ending in `=` even when the next line does not start with `|`/`&`', () => {
    const lines = [
      'type User =',
      '  string',
      '  | number;'
    ];
    expect(findTypeAliasEnd(lines, 0)).toBe(2);
  });

  it('does not truncate a conditional type across `?`/`:` continuation lines', () => {
    const lines = [
      'type A = B extends C',
      '  ? D',
      '  : E;'
    ];
    expect(findTypeAliasEnd(lines, 0)).toBe(2);
  });

  it('does not lose a union continuation separated by a comment line', () => {
    const lines = [
      'type User = string',
      '// note',
      '  | number;'
    ];
    expect(findTypeAliasEnd(lines, 0)).toBe(2);
  });

  it('extractTypeScriptMember keeps the full generic type alias source', () => {
    const content = [
      'type User = Foo<',
      '  Bar',
      '>;',
      ''
    ].join('\n');

    const member = extractTypeScriptMember(content, '/src/types.ts', 'User');
    expect(member).not.toBeNull();
    expect(member!.sourceCode).toContain('Bar');
    expect(member!.sourceCode).toContain('>;');
  });

  it('extractTypeScriptMember keeps the full comment-interrupted union alias source', () => {
    const content = [
      'type User = string',
      '// note',
      '  | number;',
      ''
    ].join('\n');

    const member = extractTypeScriptMember(content, '/src/types.ts', 'User');
    expect(member).not.toBeNull();
    expect(member!.sourceCode).toContain('| number');
  });
});
