import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ALLOWED_EXTENSIONS, PathUtils } from '@core/move/path-utils.js';

describe('PathUtils scoped baseUrl import (adversarial R3)', () => {
  it('tries a scoped-looking specifier against baseUrl before treating it as a package', () => {
    const pathUtils = new PathUtils(new ImportResolver({
      pathAliases: {},
      baseUrl: '/workspace/src',
      supportedExtensions: ALLOWED_EXTENSIONS
    }));
    const resolved = pathUtils.resolveImportPath('@scope/pkg', '/workspace/src/app.ts');

    expect(pathUtils.pathsMatch(resolved, '/workspace/src/@scope/pkg.ts')).toBe(true);
  });
});
