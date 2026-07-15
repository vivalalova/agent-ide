/**
 * Adversarial reproduction pin: methodPattern's generic segment
 * `(?:[ \t]*<[^>]*>)?` cannot handle nested generics (e.g.
 * `map<T extends Array<number>>(x: T): T`) because `[^>]*` stops at the
 * FIRST `>`, leaving a dangling `>` before `(` that breaks the whole match.
 * The method is then not recognized as a Method at all, and its body gets
 * mis-scanned as class properties.
 * Product code intentionally NOT fixed — must stay red until fixed.
 */
import { describe, expect, it } from 'vitest';
import {
  extractTypeScriptMember,
  listTypeScriptMembers
} from '@core/move-member/extractors/typescript-extractor.js';
import { MemberType } from '@core/move-member/types.js';

describe('move-member extractor adversarial bug: nested generic method', () => {
  const content = [
    'export class Mapper {',
    '  map<T extends Array<number>>(x: T): T {',
    '    return x;',
    '  }',
    '}',
    ''
  ].join('\n');

  it('extracts nested-generic method map<T extends Array<number>> as Method', () => {
    const member = extractTypeScriptMember(content, '/src/mapper.ts', 'map');
    expect(member).not.toBeNull();
    expect(member!.type).toBe(MemberType.Method);
    expect(member!.sourceCode).toContain('return x');
  });

  it('does not mis-extract method body as a fake Property', () => {
    const members = listTypeScriptMembers(content, '/src/mapper.ts');
    const fakeProps = members.filter(m => m.type === MemberType.Property);
    expect(fakeProps).toEqual([]);
  });
});
