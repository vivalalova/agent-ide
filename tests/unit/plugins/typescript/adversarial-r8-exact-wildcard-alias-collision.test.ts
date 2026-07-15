/**
 * tsconfig-loader resolvePathAliases（tsconfig-loader.ts）以「去掉 `/*` 後的 alias 名稱」
 * 當 aliases map 的 key。當 tsconfig 同時有 exact 與 wildcard 兩條同名 mapping
 * （`"@pkg": [...]` 與 `"@pkg/*": [...]`）時，兩者的 cleanAlias 都是 `@pkg`，寫入同一個
 * map key 時後者（wildcard）覆蓋前者（exact）的值，且 wildcardAliases 集合把 `@pkg`
 * 標記為 wildcard-only。resolveBarePathAlias 因此會拒絕把裸 `@pkg` 視為 exact 命中
 * （見 path-alias-resolver.ts 的 `!wildcardAliases.has(alias)` 守衛），導致 exact
 * mapping 的解析結果整個遺失。
 *
 * TypeScript 語意上這是兩條獨立規則：`@pkg` 精確匹配 `paths["@pkg"]`，
 * `@pkg/<sub>` 匹配 `paths["@pkg/*"]`，理應互不干擾。
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

describe('tsconfig-loader exact alias vs same-name wildcard alias collision (adversarial R8)', () => {
  it('resolves the bare exact alias independently from the wildcard alias of the same name', async () => {
    const fileSystem = await createFileSystem({
      '/project/tsconfig.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@pkg': ['src/root.ts'],
            '@pkg/*': ['src/pkg/*']
          }
        }
      }),
      '/project/src/root.ts': 'export const root = 1;',
      '/project/src/pkg/sub.ts': 'export const sub = 1;'
    });

    const aliases = await loadPathAliases('/project', fileSystem);

    expect(resolveBarePathAlias('@pkg', aliases)).toBe(path.resolve('/project/src/root.ts'));
    expect(resolveBarePathAlias('@pkg/sub', aliases)).toBe(path.resolve('/project/src/pkg/sub'));
  });
});
