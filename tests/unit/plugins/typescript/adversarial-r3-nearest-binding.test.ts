import { describe, expect, it } from 'vitest';
import { createReferenceFinder } from '@plugins/typescript/reference-finder.js';

describe('TypeScript reference nearest binding (adversarial R3)', () => {
  it('excludes a nearer const binding from the outer same-named function', () => {
    const code = [
      'function process() {',
      '  const process = () => 2;',
      '  process();',
      '}',
      'process();'
    ].join('\n');
    const refs = createReferenceFinder().findScopedReferences(code, 'process', { className: 'process' });

    expect(refs).not.toBeNull();
    const lines = (refs ?? []).map(ref => ref.location.range.start.line);
    expect(lines).not.toContain(2);
    expect(lines).not.toContain(3);
    expect(lines).toContain(5);
  });
});
