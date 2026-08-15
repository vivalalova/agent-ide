import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';

describe('isNodeModuleImport baseUrl heuristic (P2)', () => {
  it('does not treat arbitrary first path segment as node module when baseUrl is set', () => {
    // Product only special-cases src/lib/app/source/packages/modules.
    // Real projects often use other baseUrl roots (e.g. "client", "server").
    const r = new ImportResolver({
      pathAliases: {},
      supportedExtensions: ['.ts'],
      baseUrl: '/project'
    });
    // If isNodeModuleImport returns true, move will refuse to rewrite the path.
    expect(r.isNodeModuleImport('client/utils/format')).toBe(false);
    expect(r.isNodeModuleImport('server/api/handler')).toBe(false);
  });

  it('still treats real packages as node modules', () => {
    const r = new ImportResolver({
      pathAliases: {},
      supportedExtensions: ['.ts'],
      baseUrl: '/project'
    });
    expect(r.isNodeModuleImport('lodash')).toBe(true);
    expect(r.isNodeModuleImport('@scope/pkg')).toBe(true);
  });
});
