/**
 * P1: calculateMovedFileInternalUpdates rewrites co-located ./utils (dir index)
 * because co-move check only probes utils.ts not utils/index.ts.
 */
import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';
import { PathCalculator } from '@core/move/path-calculator.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';

describe('co-move directory index import (adversarial R3)', () => {
  it('keeps ./utils when utils/index.ts moves with the importer', async () => {
    const fs = new MemFileSystem();
    await fs.fromJSON({
      '/proj/pkg/a.ts': 'import { x } from \'./utils\';\nexport const a = x;\n',
      '/proj/pkg/utils/index.ts': 'export const x = 1;\n'
    });
    const resolver = new ImportResolver({
      pathAliases: {},
      supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.vue']
    });
    const calc = new PathCalculator(fs, resolver);
    const updates = await calc.calculateMovedFileInternalUpdates(
      '/proj/pkg/a.ts',
      '/proj/dest/a.ts',
      '/proj/pkg',
      ['/proj/pkg/a.ts', '/proj/pkg/utils/index.ts']
    );
    const utilsUpdates = updates.filter(u => u.oldImport.includes('./utils') || u.newImport.includes('utils'));
    // Correct: no rewrite needed — relative path still valid after co-move
    expect(utilsUpdates).toEqual([]);
  });
});
