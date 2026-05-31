import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IndexEngine,
  createIndexConfig
} from '@core/foundations/indexing/index.js';
import {
  ParserRegistry,
  registerDefaultParserFactory,
  resetDefaultParserFactoriesForTesting
} from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createToyParser } from '../../../../helpers/toy-parser.js';

describe('IndexEngine language extension support', () => {
  beforeEach(() => {
    ParserRegistry.resetInstance();
    resetDefaultParserFactoriesForTesting();
    registerDefaultParserFactory(() => createToyParser());
  });

  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  it('indexes files for extensions declared by registered parsers', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      '/project/src/main.toy': 'symbol Alpha\n'
    });

    const engine = new IndexEngine(
      createIndexConfig('/project', { enablePersistence: false }),
      fileSystem
    );

    await engine.indexProject('/project');

    expect(engine.getConfig().includeExtensions).toContain('.toy');
    const results = await engine.findSymbol('Alpha');
    expect(results).toHaveLength(1);
    expect(results[0].fileInfo.language).toBe('toy');
    expect(results[0].symbol.location.filePath).toBe('/project/src/main.toy');
  });
});
