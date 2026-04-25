import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ALLOWED_EXTENSIONS, PathUtils } from '@core/move/path-utils.js';

describe('PathUtils modern module extensions', () => {
  const pathUtils = new PathUtils(new ImportResolver({
    pathAliases: {},
    supportedExtensions: ALLOWED_EXTENSIONS
  }));

  it.each([
    ['/workspace/src/module.mjs', '/workspace/src/module.mts'],
    ['/workspace/src/module.cjs', '/workspace/src/module.cts']
  ])('treats runtime import %s and TypeScript source %s as the same file', (runtimePath, sourcePath) => {
    expect(pathUtils.pathsMatch(runtimePath, sourcePath)).toBe(true);
  });

  it.each(['.mts', '.cts', '.mjs', '.cjs'])('strips %s when calculating import paths', (extension) => {
    expect(
      pathUtils.calculateNewImportPath(
        '/workspace/src/consumer.ts',
        `/workspace/src/module${extension}`
      )
    ).toBe('./module');
  });
});
