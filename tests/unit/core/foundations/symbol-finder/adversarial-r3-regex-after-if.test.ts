import { describe, expect, it } from 'vitest';
import { TextMatcher } from '@core/foundations/symbol-finder/text-matcher.js';

describe('text matcher regex after control-flow close (adversarial R3)', () => {
  it('does not treat a character class containing `//` as a comment', () => {
    const refs = new TextMatcher().findReferencesByTextFiltered(
      '/src/a.ts',
      'if (x) /[//]/; target();',
      'target'
    );

    expect(refs).toHaveLength(1);
  });
});
