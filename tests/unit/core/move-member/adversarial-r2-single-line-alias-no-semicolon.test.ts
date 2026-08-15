/**
 * P2 (round 2 finding 6a): findTypeAliasEnd's main depth-counted scan looks for a
 * terminating `;` across the ENTIRE remaining file text (lines.slice(startLine).join('\n')),
 * not just the alias's own lines. When a single-line type alias omits its semicolon
 * (ASI-style) and the NEXT statement happens to end with `;`, the scan has zero
 * brace/paren/bracket depth the whole way through, so it treats the next statement's
 * `;` as if it were the alias's own terminator — swallowing the next statement into
 * the type alias's source range.
 */
import { describe, expect, it } from 'vitest';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';
import { extractTypeScriptMember } from '@core/move-member/extractors/typescript-extractor.js';

describe('findTypeAliasEnd single-line alias without semicolon followed by a semicolon statement (R2-6a)', () => {
  it('ends at the alias line itself, not the following const statement', () => {
    const lines = [
      'type User = string',
      'const live = 1;'
    ];
    // The alias occupies only line 0; it must not extend into line 1.
    expect(findTypeAliasEnd(lines, 0)).toBe(0);
  });

  it('does not swallow the following const statement into the type alias member', () => {
    const content = [
      'type User = string',
      'const live = 1;',
      ''
    ].join('\n');

    const member = extractTypeScriptMember(content, '/src/types.ts', 'User');
    expect(member).not.toBeNull();
    expect(member!.sourceCode).not.toContain('const live');
  });
});
