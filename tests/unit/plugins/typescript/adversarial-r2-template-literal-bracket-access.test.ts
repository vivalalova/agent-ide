/**
 * P2 (round 2 finding 3): the bracket-access key match in findScopedReferences only
 * recognizes `ts.isStringLiteral(node)`. A NoSubstitutionTemplateLiteral key
 * (`` a[`run`]() ``, backtick with no interpolation) is a different AST node kind and
 * was invisible, so method usages via this bracket-access form are missed by
 * deadcode/refs — same underlying bug class as the already-fixed `a['run']()` case.
 */
import { describe, expect, it } from 'vitest';
import { createReferenceFinder } from '@plugins/typescript/reference-finder.js';

describe('template literal bracket member access refs (R2 finding 3)', () => {
  it('counts a[`run`]() as a usage of method run', () => {
    const code = [
      'export class Api {',
      '  run() { return 1; }',
      '}',
      'const a = new Api();',
      'a[`run`]();',
      ''
    ].join('\n');

    const refs = createReferenceFinder().findScopedReferences(code, 'run', { className: 'Api' });
    expect(refs).not.toBeNull();
    // declaration + bracket usage
    expect((refs ?? []).length).toBeGreaterThanOrEqual(2);
    const lines = (refs ?? []).map(r => r.location.range.start.line);
    expect(lines).toContain(5);
  });
});
