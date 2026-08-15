/**
 * R7 (缺陷): loadTsconfigPathConfig 對同一 tsconfig 重複載入無程序內快取，效能回歸。
 *
 * tsconfig-loader.ts 的 loadTsconfigPathConfig（336-356）每次呼叫都重新
 * readFile + 重新解析 tsconfig.json，即使 projectRoot 完全相同、tsconfig 內容
 * 未變。call-hierarchy-analyzer.ts:681 對每個 bare-import call site 都會呼叫一次
 * loadTsconfigPathConfig(path.dirname(fromFile), this.fileSystem)——同一檔案內多個
 * bare-import call site 會導致同一份 tsconfig 被重複讀取與解析多次。
 *
 * 期望行為（程序內快取）：對同一 projectPath 連續呼叫 loadTsconfigPathConfig，
 * 第二次起不應再觸發額外的 readFile（應命中快取直接回傳）。
 *
 * 現行無此快取，本測試斷言第二次呼叫後 readFile 呼叫次數應與第一次呼叫後相同，
 * 預期為紅（現行第二次呼叫會讓 readFile 次數繼續增加）。
 */
import { describe, expect, it } from 'vitest';
import { MemFileSystem } from '@infrastructure/storage/index.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { loadTsconfigPathConfig } from '@plugins/typescript/tsconfig-loader.js';

async function createCountingFileSystem(
  files: Record<string, string>
): Promise<{ fileSystem: IFileSystem; getReadFileCallCount: () => number }> {
  const memFs = new MemFileSystem();
  await memFs.fromJSON(files);

  let readFileCallCount = 0;
  const fileSystem: IFileSystem = new Proxy(memFs, {
    get(target, prop, receiver) {
      if (prop === 'readFile') {
        return async (...args: Parameters<IFileSystem['readFile']>) => {
          readFileCallCount++;
          return target.readFile(...args);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });

  return { fileSystem, getReadFileCallCount: () => readFileCallCount };
}

describe('loadTsconfigPathConfig - 重複載入同一 tsconfig 應命中快取（adversarial R7）', () => {
  it('對同一 projectPath 連續呼叫兩次以上，第二次起不應再重讀 tsconfig', async () => {
    const { fileSystem, getReadFileCallCount } = await createCountingFileSystem({
      '/project/tsconfig.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*']
          }
        }
      })
    });

    await loadTsconfigPathConfig('/project/src', fileSystem);
    const countAfterFirstCall = getReadFileCallCount();

    await loadTsconfigPathConfig('/project/src', fileSystem);
    const countAfterSecondCall = getReadFileCallCount();

    await loadTsconfigPathConfig('/project/src', fileSystem);
    const countAfterThirdCall = getReadFileCallCount();

    // 現行無快取：每次呼叫都重新 readFile，countAfterSecondCall/ThirdCall 會持續增加
    expect(countAfterSecondCall).toBe(countAfterFirstCall);
    expect(countAfterThirdCall).toBe(countAfterFirstCall);
  });
});
