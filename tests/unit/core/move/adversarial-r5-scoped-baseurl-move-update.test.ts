/**
 * P2: calculatePathUpdates skips scoped baseUrl-relative imports because
 * isNodeModuleImport() unconditionally treats any '@scope/...' specifier as a
 * node module, even when baseUrl is configured and the specifier resolves to a
 * real project file. The consumer's import is therefore never rewritten after
 * the moved file's path changes.
 */
import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';
import { PathCalculator } from '@core/move/path-calculator.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';

describe('scoped baseUrl import rewritten after move (adversarial R5)', () => {
  it('rewrites a scoped baseUrl-relative import when its target file moves', async () => {
    const fs = new MemFileSystem();
    await fs.fromJSON({
      '/proj/src/main.ts': 'import { x } from \'@scope/utils\';\nexport const y = x;\n',
      '/proj/src/@scope/utils.ts': 'export const x = 1;\n'
    });
    const resolver = new ImportResolver({
      pathAliases: {},
      baseUrl: '/proj/src',
      supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.vue']
    });
    const calc = new PathCalculator(fs, resolver);

    const updates = await calc.calculatePathUpdates(
      '/proj/src/main.ts',
      '/proj/src/@scope/utils.ts',
      '/proj/src/new/utils.ts'
    );

    expect(updates).not.toEqual([]);
  });
});
