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

describe('IndexEngine 檔案路徑 key 必須 canonicalize，同檔案的絕對/相對路徑不得產生兩筆條目', () => {
  beforeEach(() => {
    ParserRegistry.resetInstance();
    resetDefaultParserFactoriesForTesting();
    registerDefaultParserFactory(() => createToyParser());
  });

  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  it('indexDirectory 用絕對路徑索引後，updateFile 用相對路徑更新同一檔案，必須視為同一條目', async () => {
    const absolutePath = '/project/src/a.toy';
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [absolutePath]: 'symbol Alpha\n'
    });

    const engine = new IndexEngine(
      createIndexConfig('/project', { enablePersistence: false }),
      fileSystem
    );

    // indexDirectory 內部透過 glob({ absolute: true }) 取得絕對路徑作為 key
    await engine.indexProject('/project');
    expect(await engine.findSymbol('Alpha')).toHaveLength(1);

    // 改用相對於 workspacePath 的相對路徑更新同一支檔案
    await fileSystem.writeFile(absolutePath, 'symbol Beta\n');
    await engine.updateFile('src/a.toy');

    // 不得產生第二筆獨立條目：以 .toy 結尾的已索引檔案應該只有一筆
    const toyFiles = engine.getAllIndexedFiles().filter(f => f.filePath.endsWith('a.toy'));
    expect(toyFiles).toHaveLength(1);

    // 舊符號必須被清除（若相對路徑另存一份 key，Alpha 會殘留在絕對路徑那筆條目中查得到）
    expect(await engine.findSymbol('Beta')).toHaveLength(1);
    expect(await engine.findSymbol('Alpha')).toHaveLength(0);

    // 兩種路徑寫法查 isIndexed 也必須得到一致結果
    expect(engine.isIndexed(absolutePath)).toBe(true);
    expect(engine.isIndexed('src/a.toy')).toBe(true);
  });

  it('用相對路徑 removeFile 必須能移除以絕對路徑索引的同一檔案', async () => {
    const absolutePath = '/project/src/b.toy';
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [absolutePath]: 'symbol Gamma\n'
    });

    const engine = new IndexEngine(
      createIndexConfig('/project', { enablePersistence: false }),
      fileSystem
    );

    await engine.indexProject('/project');
    expect(await engine.findSymbol('Gamma')).toHaveLength(1);

    await engine.removeFile('src/b.toy');

    expect(await engine.findSymbol('Gamma')).toHaveLength(0);
    expect(engine.isIndexed(absolutePath)).toBe(false);
  });
});
