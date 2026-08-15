/**
 * Regression for a function-type arrow at a type-alias line boundary.
 */
import { describe, expect, it } from 'vitest';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';
import { extractTypeScriptMember } from '@core/move-member/extractors/typescript-extractor.js';

describe('findTypeAliasEnd function-type continuation', () => {
  it('keeps a return type on the line after a trailing =>', () => {
    const lines = [
      'type Handler = (event: Event) =>',
      '  void;'
    ];

    expect(findTypeAliasEnd(lines, 0)).toBe(1);
  });

  it('extracts the complete multiline function type alias', () => {
    const content = [
      'type Handler = (event: Event) =>',
      '  void;',
      ''
    ].join('\n');

    const member = extractTypeScriptMember(content, '/src/types.ts', 'Handler');
    expect(member?.sourceCode).toContain('void;');
  });
});
