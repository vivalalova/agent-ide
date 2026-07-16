import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileIndex } from '@core/foundations/indexing/file-index.js';
import {
  IndexEngine,
  createIndexConfig,
  type FileInfo
} from '@core/foundations/indexing/index.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import {
  ParserRegistry,
  registerDefaultParserFactory,
  resetDefaultParserFactoriesForTesting
} from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createToyParser } from '../../../../helpers/toy-parser.js';

/** 讓 getStats() 回傳固定的 mtime，模擬「內容已變但 mtime 被保留」的情境（如 touch -m 還原時間戳） */
function createPinnedMtimeFileSystem(inner: MemFileSystem, pinnedMtime: Date): IFileSystem {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === 'getStats') {
        return async (targetPath: string) => {
          const stat = await target.getStats(targetPath);
          return { ...stat, modifiedTime: pinnedMtime };
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  }) as unknown as IFileSystem;
}

function createFileInfo(filePath: string, modifiedTime: Date, size: number, checksum: string): FileInfo {
  return {
    filePath,
    lastModified: modifiedTime,
    size,
    extension: '.ts',
    language: 'typescript',
    checksum
  };
}

describe('FileIndex.needsReindexing 以 checksum 作為權威判斷依據', () => {
  it('size 與 mtime 都未變，但 checksum 不同時，仍必須判定需要重新索引', async () => {
    const filePath = '/project/src/main.ts';
    const modifiedTime = new Date('2026-07-14T00:00:00.000Z');
    const fileIndex = new FileIndex(createIndexConfig('/project'));

    await fileIndex.addFile(createFileInfo(filePath, modifiedTime, 10, 'checksum-a'));
    await fileIndex.setFileSymbols(filePath, []);

    // 模擬「同長度替換內容、且 mtime 被保留」（如 touch -m 還原時間戳）：
    // size、mtime 皆與索引時相同，唯獨內容 checksum 不同
    expect(fileIndex.needsReindexing(filePath, modifiedTime, 10, 'checksum-b')).toBe(true);
  });

  it('size、mtime、checksum 皆與索引時相同，不需要重新索引', async () => {
    const filePath = '/project/src/main.ts';
    const modifiedTime = new Date('2026-07-14T00:00:00.000Z');
    const fileIndex = new FileIndex(createIndexConfig('/project'));

    await fileIndex.addFile(createFileInfo(filePath, modifiedTime, 10, 'checksum-a'));
    await fileIndex.setFileSymbols(filePath, []);

    expect(fileIndex.needsReindexing(filePath, modifiedTime, 10, 'checksum-a')).toBe(false);
  });

  it('未提供 checksum 時維持既有 size/mtime 判斷邏輯（向後相容）', async () => {
    const filePath = '/project/src/main.ts';
    const modifiedTime = new Date('2026-07-14T00:00:00.000Z');
    const fileIndex = new FileIndex(createIndexConfig('/project'));

    await fileIndex.addFile(createFileInfo(filePath, modifiedTime, 10, 'checksum-a'));
    await fileIndex.setFileSymbols(filePath, []);

    expect(fileIndex.needsReindexing(filePath, modifiedTime, 20)).toBe(true);
  });
});

describe('IndexEngine.needsReindexing 端對端：mtime/size 被保留但內容已變時仍判定需要重新索引', () => {
  beforeEach(() => {
    ParserRegistry.resetInstance();
    resetDefaultParserFactoriesForTesting();
    registerDefaultParserFactory(() => createToyParser());
  });

  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  it('同長度替換內容、mtime 被固定不變時，needsReindexing 仍須回傳 true', async () => {
    const filePath = '/project/src/a.toy';
    const pinnedMtime = new Date('2026-07-14T00:00:00.000Z');

    const inner = new MemFileSystem();
    await inner.fromJSON({
      '/project/package.json': '{}',
      [filePath]: 'symbol Alpha\n'
    });
    const fileSystem = createPinnedMtimeFileSystem(inner, pinnedMtime);

    const engine = new IndexEngine(
      createIndexConfig('/project', { enablePersistence: false }),
      fileSystem
    );
    await engine.indexProject('/project');

    expect(await engine.needsReindexing(filePath)).toBe(false);

    // 同長度替換內容（'Alpha' -> 'Beta1'，同為 5 字元），mtime 因 Proxy 固定不變
    await inner.writeFile(filePath, 'symbol Beta1\n');

    expect(await engine.needsReindexing(filePath)).toBe(true);
  });
});
