/**
 * P2 (round 2 finding 6b): with baseUrl configured, a single-segment bare import
 * specifier (`import { x } from 'utils'`, no '/') that actually resolves under
 * baseUrl to a real project file (e.g. `src/utils.ts`) is indistinguishable from a
 * genuine node_modules package name by isNodeModuleImport() alone — both are bare
 * words with no leading '.', no matching alias, and no '/'. resolveImportPath()
 * used this early "isNodeModuleImport ⇒ return unresolved" branch and therefore
 * never attempted baseUrl resolution for bare specifiers, so pathsMatch() against
 * the real target file always failed and move never rewrote the import.
 */
import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ALLOWED_EXTENSIONS, PathUtils } from '@core/move/path-utils.js';

describe('resolveImportPath bare specifier under baseUrl (R2-6b)', () => {
  it('resolves a bare specifier to the baseUrl-relative project file, not the literal specifier', () => {
    const pathUtils = new PathUtils(new ImportResolver({
      pathAliases: {},
      baseUrl: '/workspace/src',
      supportedExtensions: ALLOWED_EXTENSIONS
    }));

    const resolved = pathUtils.resolveImportPath('utils', '/workspace/src/app.ts');

    expect(pathUtils.pathsMatch(resolved, '/workspace/src/utils.ts')).toBe(true);
  });

  it('still leaves a genuine node_modules package specifier unresolved (does not match a project file)', () => {
    const pathUtils = new PathUtils(new ImportResolver({
      pathAliases: {},
      baseUrl: '/workspace/src',
      supportedExtensions: ALLOWED_EXTENSIONS
    }));

    const resolved = pathUtils.resolveImportPath('lodash', '/workspace/src/app.ts');

    expect(pathUtils.pathsMatch(resolved, '/workspace/src/utils.ts')).toBe(false);
  });
});
