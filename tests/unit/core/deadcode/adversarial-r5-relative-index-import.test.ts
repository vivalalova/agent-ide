import { describe, expect, it } from 'vitest';
import { ImportCleaner } from '@core/deadcode/import-cleaner.js';
import { DeadCodeCacheService } from '@core/deadcode/shared-cache.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';

describe('deadcode relative directory index import (adversarial R5)', () => {
  it('matches a relative directory-style import to the removed index source file', () => {
    const cleaner = new ImportCleaner(
      {} as IFileSystem,
      {} as ParserRegistry,
      new DeadCodeCacheService(),
      {}
    );
    const matches = (cleaner as unknown as {
      importFromRemovalFile: (
        consumerFilePath: string,
        statement: string,
        removalFilesNoExt: ReadonlySet<string>
      ) => boolean
    }).importFromRemovalFile(
      '/proj/src/consumer.ts',
      'import { gone } from "./utils";',
      new Set(['/proj/src/utils/index'])
    );

    expect(matches).toBe(true);
  });
});
