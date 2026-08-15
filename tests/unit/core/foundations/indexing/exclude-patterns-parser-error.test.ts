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

describe('IndexEngine.getEffectiveExcludePatterns 對 parser 拋出例外必須 fail-fast', () => {
  beforeEach(() => {
    ParserRegistry.resetInstance();
    resetDefaultParserFactoriesForTesting();
    registerDefaultParserFactory(() => createToyParser());
  });

  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  it('已註冊 parser 的 getDefaultExcludePatterns 執行時拋出例外，必須讓例外往上拋，不得靜默略過並繼續索引', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({ '/project/package.json': '{}' });

    const engine = new IndexEngine(
      createIndexConfig('/project', { enablePersistence: false }),
      fileSystem
    );

    const registry = ParserRegistry.getInstance();
    const toyEntry = registry.listParsers().find(entry => entry.name === 'toy');
    expect(toyEntry).toBeDefined();

    // 模擬 parser 的 getDefaultExcludePatterns 執行時真的拋出例外（非「不支援此方法」）
    toyEntry!.plugin.getDefaultExcludePatterns = () => {
      throw new Error('boom: exclude pattern crashed');
    };

    expect(() => engine.getEffectiveExcludePatterns()).toThrow('boom: exclude pattern crashed');
  });
});
