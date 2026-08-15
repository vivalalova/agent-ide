/**
 * P2: resolvePathAlias picks the first-declared overlapping alias instead of the longest match.
 */
import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';

describe('alias overlap resolution picks longest match (adversarial R5)', () => {
  it('resolves the more specific alias when a shorter alias also matches as a prefix', () => {
    const resolver = new ImportResolver({
      pathAliases: {
        '@app': '/proj/src/app',
        '@app/utils': '/proj/src/utils'
      },
      supportedExtensions: ['.ts', '.tsx', '.js', '.jsx']
    });

    const resolved = resolver.resolvePathAlias('@app/utils/foo');

    expect(resolved).toBe('/proj/src/utils/foo');
  });
});
