/**
 * tsconfig-loader paths array 候選選擇（resolvePathAliases，tsconfig-loader.ts 附近）只檢查
 * 候選目錄「是否含任一 source file」（hasPathAliasTarget），並非「本次要解析的目標是否
 * 落在該候選下」。alias 的解析基底在載入 tsconfig 當下就一次性選定，與後續實際被
 * import 的具體 specifier 無關：只要排序在前的候選目錄含有任何（無關的）source file，
 * 就會被選中，即使真正要找的目標檔案其實在後面的候選目錄下。
 *
 * 場景：`paths: { "@lib/*": ["legacy/*", "src/lib/*"] }`，legacy/old.ts 存在（與目標
 * 無關的舊檔），src/lib/gone.ts 存在且才是 `@lib/gone` 的真正目標。loadPathAliases
 * 選中 legacy（因為它有 source file），導致 resolveBarePathAlias('@lib/gone') 解析到
 * 不存在的 legacy/gone，而非真正存在的 src/lib/gone。
 */
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { MemFileSystem } from '@infrastructure/storage/index.js';
import { loadPathAliases } from '@plugins/typescript/tsconfig-loader.js';
import { resolveBarePathAlias } from '@shared/path-alias-resolver.js';

async function createFileSystem(files: Record<string, string>): Promise<MemFileSystem> {
  const fileSystem = new MemFileSystem();
  await fileSystem.fromJSON(files);
  return fileSystem;
}

describe('tsconfig-loader paths array candidate selection ignores actual target (adversarial R8)', () => {
  it('resolves the specific specifier to the candidate that actually contains it, not merely the first candidate with any file', async () => {
    const fileSystem = await createFileSystem({
      '/project/tsconfig.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@lib/*': ['legacy/*', 'src/lib/*']
          }
        }
      }),
      // legacy/ 含一個與目標無關的既有檔案，讓目錄「有任一 source file」判定為真
      '/project/legacy/old.ts': 'export const old = 1;',
      // 真正的目標檔案在第二個候選目錄下
      '/project/src/lib/gone.ts': 'export const gone = 1;'
    });

    const aliases = await loadPathAliases('/project', fileSystem);
    const resolved = resolveBarePathAlias('@lib/gone', aliases);

    expect(resolved).toBe(path.resolve('/project/src/lib/gone'));
  });
});
