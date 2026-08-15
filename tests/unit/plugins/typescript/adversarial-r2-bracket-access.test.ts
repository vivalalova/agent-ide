/**
 * P1: findScopedReferences only visits Identifier nodes — a['run']() is ElementAccess,
 * so method usages via bracket access are invisible to deadcode/refs.
 */
import { describe, expect, it } from 'vitest';
import { createReferenceFinder } from '@plugins/typescript/reference-finder.js';

describe('bracket member access refs (adversarial R2)', () => {
  it('counts a[\'run\']() as a usage of method run', () => {
    const code = [
      'export class Api {',
      '  run() { return 1; }',
      '}',
      'const a = new Api();',
      'a[\'run\']();',
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
