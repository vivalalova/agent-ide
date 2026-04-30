import { describe, expect, it } from 'vitest';
import { extractTypeScriptMember } from '@core/move-member/extractors/typescript-extractor.js';

describe('TypeScript move-member extractor', () => {
  it('does not treat a separated file header as member documentation', () => {
    const member = extractTypeScriptMember(
      [
        '/**',
        ' * String Utils',
        ' */',
        '',
        'export function capitalize(str: string): string {',
        '  return str;',
        '}'
      ].join('\n'),
      '/src/string-utils.ts',
      'capitalize'
    );

    expect(member?.documentation).toBeUndefined();
  });

  it('keeps directly attached documentation with the member', () => {
    const member = extractTypeScriptMember(
      [
        '/**',
        ' * Capitalizes text.',
        ' */',
        'export function capitalize(str: string): string {',
        '  return str;',
        '}'
      ].join('\n'),
      '/src/string-utils.ts',
      'capitalize'
    );

    expect(member?.documentation).toBe('/**\n* Capitalizes text.\n*/');
  });
});
