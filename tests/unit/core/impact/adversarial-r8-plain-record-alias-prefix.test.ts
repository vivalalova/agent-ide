/**
 * PathResolver.resolvePath（src/core/impact/path-resolver.ts:40）直接把
 * `this.options.pathAliases` 交給共用的 resolveBarePathAlias，未如
 * core/move/import-resolver.ts、core/deadcode/import-cleaner.ts 那樣先用
 * withLegacyPathAliasWildcards 包一層。`ExtendedDependencyAnalysisOptions.pathAliases`
 * 的公開型別是 `Record<string, string>`（impact/types.ts:86），程式化使用者依此公開
 * 型別直接傳入純物件（如 `{ "@": "/proj/src" }`）並無 wildcard metadata；
 * resolveBarePathAlias 在 wildcardAliases 為空集合時只做 exact 比對，不會把 `@` 當
 * prefix 套用到 `@/util`，回歸成收斂前（wildcard 概念導入前）PathResolver 該有的
 * prefix-match 行為：`@/util` 應解析到 `/proj/src/util`，但現在整個 alias 比對失敗、
 * 未被 baseUrl fallback 或相對路徑分支接住，最終回傳 null。
 */
import { describe, expect, it } from 'vitest';
import { PathResolver } from '@core/impact/path-resolver.js';
import { MemFileSystem } from '@infrastructure/storage/index.js';

async function createFileSystem(files: Record<string, string>): Promise<MemFileSystem> {
  const fileSystem = new MemFileSystem();
  await fileSystem.fromJSON(files);
  return fileSystem;
}

describe('PathResolver plain Record path alias prefix match (adversarial R8)', () => {
  it('resolves a bare alias specifier against a plain Record without wildcard metadata', async () => {
    const fileSystem = await createFileSystem({
      '/proj/src/entry.ts': 'import \'@/util\';\n',
      '/proj/src/util.ts': 'export const util = 1;\n'
    });

    // 公開型別 ExtendedDependencyAnalysisOptions.pathAliases 就是 Record<string, string>，
    // 程式化使用者依此型別直接傳入純物件，不會（也無從）附加 wildcard metadata。
    const pathAliases: Record<string, string> = { '@': '/proj/src' };

    const resolver = new PathResolver(fileSystem, { pathAliases });
    const result = await resolver.resolvePath('@/util', '/proj/src/entry.ts');

    expect(result?.exists).toBe(true);
    expect(result?.resolvedPath).toBe('/proj/src/util.ts');
  });
});
