import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IndexEngine,
  createIndexConfig
} from '@core/foundations/indexing/index.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import {
  ParserRegistry,
  registerDefaultParserFactory,
  resetDefaultParserFactoriesForTesting
} from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createToyParser } from '../../../../helpers/toy-parser.js';

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * 包一層 Proxy：對指定路徑的 readFile 依呼叫次序回傳「版本序列」中不同的內容，
 * 模擬「檔案在兩次獨立讀取之間被改寫」的情境。其餘操作原樣委派給底層 MemFileSystem。
 */
function createVersionedReadFileSystem(inner: MemFileSystem, versionsByPath: Map<string, string[]>): IFileSystem {
  const callCounts = new Map<string, number>();

  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === 'readFile') {
        return async (filePath: string, encoding?: BufferEncoding) => {
          const versions = versionsByPath.get(filePath);
          if (!versions) {
            return target.readFile(filePath, encoding);
          }
          const count = callCounts.get(filePath) ?? 0;
          callCounts.set(filePath, count + 1);
          return versions[Math.min(count, versions.length - 1)];
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  }) as unknown as IFileSystem;
}

describe('IndexEngine 單檔索引：parse 內容與 checksum 必須來自同一次讀取', () => {
  beforeEach(() => {
    ParserRegistry.resetInstance();
    resetDefaultParserFactoriesForTesting();
    registerDefaultParserFactory(() => createToyParser());
  });

  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  it('indexFile 若對同一檔案讀取兩次，第二次讀取拿到不同內容會讓 checksum 與實際解析的符號版本不一致', async () => {
    const filePath = '/project/src/a.toy';
    const versionA = 'symbol Alpha\n';
    const versionB = 'symbol Beta\n';

    const inner = new MemFileSystem();
    await inner.fromJSON({
      '/project/package.json': '{}',
      [filePath]: versionA
    });

    // 若 indexFile 只讀取一次，這裡只會被呼叫一次，永遠拿到 versionA；
    // 若仍讀取兩次（舊臭蟲），第二次呼叫會拿到 versionB，讓 checksum 對應到「未被解析」的內容版本
    const fileSystem = createVersionedReadFileSystem(inner, new Map([[filePath, [versionA, versionB]]]));

    const engine = new IndexEngine(
      createIndexConfig('/project', { enablePersistence: false }),
      fileSystem
    );

    await engine.indexFile(filePath);

    const results = await engine.findSymbol('Alpha');
    expect(results).toHaveLength(1);

    // 實際被解析出 Alpha 符號的內容版本是 versionA，checksum 必須也來自 versionA，
    // 而不是索引過程中另一次獨立讀取所得到的 versionB
    expect(results[0].fileInfo.checksum).toBe(sha256(versionA));
    expect(results[0].fileInfo.checksum).not.toBe(sha256(versionB));
  });
});
