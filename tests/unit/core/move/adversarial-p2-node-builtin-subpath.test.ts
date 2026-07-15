/**
 * P2: isNodeModuleImport baseUrl heuristic misclassifies Node builtin subpath
 * imports (e.g. `fs/promises`) as project-internal baseUrl-relative paths
 * whenever a baseUrl is configured, since it only checks "no leading '@' +
 * contains '/'" without checking against Node's actual builtin module list.
 * Product code intentionally NOT fixed — must stay red until fixed.
 */
import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';

describe('isNodeModuleImport Node builtin subpath (P2-2)', () => {
  it('treats fs/promises as a node module even when baseUrl is set', () => {
    const r = new ImportResolver({
      pathAliases: {},
      supportedExtensions: ['.ts'],
      baseUrl: '/project'
    });
    expect(r.isNodeModuleImport('fs/promises')).toBe(true);
  });

  it('treats node:fs/promises as a node module even when baseUrl is set', () => {
    const r = new ImportResolver({
      pathAliases: {},
      supportedExtensions: ['.ts'],
      baseUrl: '/project'
    });
    expect(r.isNodeModuleImport('node:fs/promises')).toBe(true);
  });
});
