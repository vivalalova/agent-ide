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

describe('IndexEngine 超過 maxFileSize 跳過索引時的舊條目清理', () => {
  beforeEach(() => {
    ParserRegistry.resetInstance();
    resetDefaultParserFactoriesForTesting();
    registerDefaultParserFactory(() => createToyParser());
  });

  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  it('檔案原本已索引，之後長大超過 maxFileSize 再 updateFile，必須清除舊符號而非留下 stale entry', async () => {
    const filePath = '/project/src/a.toy';
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [filePath]: 'symbol Alpha\n'
    });

    const engine = new IndexEngine(
      createIndexConfig('/project', { enablePersistence: false, maxFileSize: 64 }),
      fileSystem
    );
    await engine.indexProject('/project');

    expect(await engine.findSymbol('Alpha')).toHaveLength(1);
    expect(engine.isIndexed(filePath)).toBe(true);

    // 讓檔案長大超過 maxFileSize（64 bytes）
    await fileSystem.writeFile(filePath, `symbol Alpha\n${'x'.repeat(200)}`);
    await engine.updateFile(filePath);

    // 超過大小限制被跳過索引，但舊的 Alpha 符號不得繼續被查到
    expect(await engine.findSymbol('Alpha')).toHaveLength(0);
    expect(engine.isIndexed(filePath)).toBe(false);
  });

  it('初次索引就超過 maxFileSize（從未索引過）維持原樣靜默跳過，不報錯', async () => {
    const filePath = '/project/src/big.toy';
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [filePath]: 'symbol Big\n'.repeat(50)
    });

    const engine = new IndexEngine(
      createIndexConfig('/project', { enablePersistence: false, maxFileSize: 64 }),
      fileSystem
    );

    await expect(engine.indexProject('/project')).resolves.not.toThrow();
    expect(engine.isIndexed(filePath)).toBe(false);
    expect(await engine.findSymbol('Big')).toHaveLength(0);
  });
});
