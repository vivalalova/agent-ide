import { describe, expect, it } from 'vitest';
import { TextMatcher } from '@core/foundations/symbol-finder/text-matcher.js';

describe('text matcher regex state (adversarial R3)', () => {
  it('does not treat a quote inside a regex literal as a string opener', () => {
    const refs = new TextMatcher().findReferencesByTextFiltered(
      '/src/a.ts',
      'const re = /\'/; target();',
      'target'
    );

    expect(refs).toHaveLength(1);
  });
});
