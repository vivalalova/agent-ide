/**
 * F20 P3 — 讀檔失敗不清舊條目（reproduction，先紅後綠）
 *
 * 檔案已成功索引後，後續 reindex / updateFile 若 readFile 丟 EACCES（或等價權限錯誤），
 * 不得 silently 保留舊符號當「索引仍有效」；應清除 stale 或明確失敗且查詢不到舊條目
 * （或回報 parse/index error 且 isIndexed=false）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('F20：EACCES 重索引不得 silently 留 stale 當成功', () => {
  beforeEach(() => {
    ParserRegistry.resetInstance();
    resetDefaultParserFactoriesForTesting();
    registerDefaultParserFactory(() => createToyParser());
  });

  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  it('已索引檔案再 indexFile 時 readFile 失敗，舊符號不得繼續被查到當成功索引', async () => {
    const filePath = '/project/src/a-f20.toy';
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [filePath]: 'symbol AlphaF20\n'
    });

    const engine = new IndexEngine(
      createIndexConfig('/project', { enablePersistence: false }),
      fileSystem
    );
    await engine.indexProject('/project');
    expect(await engine.findSymbol('AlphaF20')).toHaveLength(1);
    expect(engine.isIndexed(filePath)).toBe(true);

    // 模擬後續 reindex 時讀檔失敗（EACCES）
    const originalRead = fileSystem.readFile.bind(fileSystem);
    vi.spyOn(fileSystem, 'readFile').mockImplementation(async (path, encoding) => {
      if (String(path).includes('a-f20.toy')) {
        const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      }
      return originalRead(path, encoding);
    });

    await expect(engine.indexFile(filePath)).rejects.toThrow();

    // Bug：目前 throw 前可能未清舊條目 → findSymbol 仍命中 AlphaF20，呼叫端若吞錯
    // 會把 stale 當成功索引
    expect(await engine.findSymbol('AlphaF20')).toHaveLength(0);
    expect(engine.isIndexed(filePath)).toBe(false);
  });
});
