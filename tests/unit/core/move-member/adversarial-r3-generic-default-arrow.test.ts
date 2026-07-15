import { describe, expect, it } from 'vitest';
import { extractTypeScriptMember } from '@core/move-member/extractors/typescript-extractor.js';
import { MemberType } from '@core/move-member/types.js';

describe('move-member generic default arrow (adversarial R3)', () => {
  it('does not close generic parameters at the `>` in a default arrow type', () => {
    const member = extractTypeScriptMember(
      'class C { map<T = () => string>(x: T) { return x; } }',
      '/src/c.ts',
      'map'
    );

    expect(member?.type).toBe(MemberType.Method);
    expect(member?.sourceCode).toContain('return x');
  });
});
