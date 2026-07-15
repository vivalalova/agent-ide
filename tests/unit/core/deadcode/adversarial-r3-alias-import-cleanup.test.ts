/**
 * P1: importFromRemovalFile only accepts relative ./ ../ so path-alias consumers
 * never get import cleanup after export deletion.
 */
import { describe, expect, it } from 'vitest';
import { ImportCleaner } from '@core/deadcode/import-cleaner.js';
import { createDeadCodeCacheService } from '@core/deadcode/shared-cache.js';
import { ParserRegistry, initializeDefaultParsers } from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { SymbolType } from '@shared/types/symbol.js';
import type { RemovalOperation } from '@core/deadcode/types.js';

describe('deadcode import cleanup path-alias (adversarial R3)', () => {
  it('cleans consumer import from @app/utils when deadHelper export is removed', async () => {
    const fs = new MemFileSystem();
    await fs.fromJSON({
      '/proj/src/utils.ts': 'export function deadHelper() { return 1; }\nexport function live() { return 2; }\n',
      '/proj/src/consumer.ts': "import { deadHelper } from '@app/utils';\n"
    });
    if (ParserRegistry.getInstance().isDisposed) ParserRegistry.resetInstance();
    const reg = ParserRegistry.getInstance();
    initializeDefaultParsers(reg);

    const cleaner = new ImportCleaner(fs, reg, createDeadCodeCacheService());
    const removals: RemovalOperation[] = [{
      filePath: '/proj/src/utils.ts',
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 40 } },
      originalCode: 'export function deadHelper() { return 1; }',
      symbolName: 'deadHelper',
      symbolType: SymbolType.Function
    }];

    // importFromRemovalFile is private — exercise via analyzeImportCleanups
    // Note: without wiring pathAliases into ImportCleaner, this may still fail
    // at resolve; the bug is specifically rejecting non-relative before resolve.
    const { cleanups } = await cleaner.analyzeImportCleanups(removals, [
      '/proj/src/utils.ts',
      '/proj/src/consumer.ts'
    ]);

    const consumer = cleanups.filter(c => c.filePath.includes('consumer'));
    expect(consumer.length).toBeGreaterThanOrEqual(1);
    expect(consumer.some(c => c.unusedSymbols.includes('deadHelper'))).toBe(true);
  });
});
