import { describe, expect, it } from 'vitest';
import { extractTypeScriptMember } from '@core/move-member/extractors/typescript-extractor.js';
import { MemberType } from '@core/move-member/types.js';

describe('move-member multiline generic method (adversarial R3)', () => {
  it('keeps a method when the newline is between generic parameters and `(`', () => {
    const member = extractTypeScriptMember(
      'class C { map<T>\n(x: T) { return x; } }',
      '/src/c.ts',
      'map'
    );

    expect(member?.type).toBe(MemberType.Method);
    expect(member?.sourceCode).toContain('return x');
  });
});
