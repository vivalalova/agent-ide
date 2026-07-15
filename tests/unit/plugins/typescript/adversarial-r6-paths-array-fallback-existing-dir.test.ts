/**
 * tsconfig-loader paths array 候選解析（resolvePathAliases，tsconfig-loader.ts:202 附近）
 * 逐一挑候選路徑時用 `fileSystem.exists(candidate)` 判斷，只要目錄本身存在就會命中——
 * 即使該目錄下沒有對應的目標檔案。導致排序在前但實際無此檔的候選（例如舊的 legacy/
 * 目錄仍存在，但目標檔案早已搬到 src/lib/）被誤選，真正含目標檔案的候選反而被忽略。
 */
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { MemFileSystem } from '@infrastructure/storage/index.js';
import { loadPathAliases } from '@plugins/typescript/tsconfig-loader.js';

async function createFileSystem(files: Record<string, string>): Promise<MemFileSystem> {
  const fileSystem = new MemFileSystem();
  await fileSystem.fromJSON(files);
  return fileSystem;
}

describe('tsconfig-loader paths array fallback candidates - existing but empty dir (adversarial R6)', () => {
  it('resolves to the candidate that actually contains the target file, not merely an existing directory', async () => {
    const fileSystem = await createFileSystem({
      '/project/tsconfig.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@lib/*': ['legacy/*', 'src/lib/*']
          }
        }
      }),
      // legacy/ 目錄存在（靠這個檔案讓目錄本身存在），但沒有 gone.ts
      '/project/legacy/.keep': '',
      '/project/src/lib/gone.ts': 'export const gone = 1;'
    });

    const aliases = await loadPathAliases('/project', fileSystem);

    expect(aliases['@lib']).toBe(path.resolve('/project/src/lib'));
  });
});
