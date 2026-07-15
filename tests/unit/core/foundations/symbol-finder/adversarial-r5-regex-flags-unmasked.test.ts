import { describe, expect, it } from 'vitest';
import { TextMatcher } from '@core/foundations/symbol-finder/text-matcher.js';

describe('text matcher regex literal flags masking (adversarial R5)', () => {
  it('does not treat regex flags after the closing `/` as code references', () => {
    const refs = new TextMatcher().findReferencesByTextFiltered(
      '/src/a.ts',
      'const r = /foo/g;',
      'g'
    );

    expect(refs).toHaveLength(0);
  });
});
