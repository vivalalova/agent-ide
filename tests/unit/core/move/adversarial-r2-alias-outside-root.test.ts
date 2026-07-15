/**
 * P1: calculateNewImportPathPreservingStyle produces @/../ when target leaves alias root.
 */
import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';
import { PathUtils } from '@core/move/path-utils.js';

describe('alias style after leaving alias root (adversarial R2)', () => {
  it('must not emit @/../ when new file is outside alias root', () => {
    const resolver = new ImportResolver({
      pathAliases: { '@': '/proj/src' },
      supportedExtensions: ['.ts', '.tsx', '.js', '.jsx']
    });
    const utils = new PathUtils(resolver);
    const result = utils.calculateNewImportPathPreservingStyle(
      '@/utils/a',
      '/proj/src/app.ts',
      '/proj/src/utils/a.ts',
      '/proj/lib/a.ts'
    );
    expect(result).not.toContain('@/..');
    expect(result.startsWith('.') || result.startsWith('/')).toBe(true);
  });
});
