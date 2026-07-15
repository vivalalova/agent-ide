/**
 * P2: skipGenericParams' depth-counted `<`/`>` scan does not mask string/template
 * literal content. A generic constraint whose string literal contains a literal
 * `>` character (e.g. `extends "a>b"`) makes the scan see an extra `>` and close
 * the generic depth one character too early, leaving a dangling `>` before `(`
 * that breaks the whole method-vs-property heuristic. The method then
 * disappears entirely — its body gets mis-scanned as a property declaration.
 * Regression guard: skipGenericParams now masks string/template literal
 * content when depth-counting `<`/`>`, so this case must stay green.
 */
import { describe, expect, it } from 'vitest';
import {
  extractTypeScriptMember,
  listTypeScriptMembers
} from '@core/move-member/extractors/typescript-extractor.js';
import { MemberType } from '@core/move-member/types.js';

describe('move-member extractor adversarial bug: generic constraint string literal containing `>` (P2)', () => {
  const content = [
    'export class C {',
    '  bad<T extends "a>b">(x: T): T {',
    '    return x;',
    '  }',
    '}',
    ''
  ].join('\n');

  it('extracts bad<T extends "a>b"> as Method', () => {
    const member = extractTypeScriptMember(content, '/src/c.ts', 'bad');
    expect(member).not.toBeNull();
    expect(member!.type).toBe(MemberType.Method);
    expect(member!.sourceCode).toContain('return x');
  });

  it('does not mis-extract the method body as a fake Property', () => {
    const members = listTypeScriptMembers(content, '/src/c.ts');
    const fakeProps = members.filter(m => m.type === MemberType.Property);
    expect(fakeProps).toEqual([]);
  });
});
