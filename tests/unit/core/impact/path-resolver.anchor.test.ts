/**
 * 行為為錨測試：釘住 PathResolver.resolvePath / resolveWithExtensions 現行行為，
 * 供未來把四處「import specifier → 檔案」候選組裝邏輯收斂到 foundations 單一模組時
 * 當回歸基準。純粹釘現狀，不修 production code。
 */
import { describe, expect, it } from 'vitest';
import { PathResolver } from '@core/impact/path-resolver.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createPathAliasMap } from '@shared/path-alias-resolver.js';
import type { ExtendedDependencyAnalysisOptions } from '@core/impact/types.js';

function createResolver(
  fileSystem: MemFileSystem,
  options: Partial<ExtendedDependencyAnalysisOptions> = {}
): PathResolver {
  return new PathResolver(fileSystem, options as ExtendedDependencyAnalysisOptions);
}

describe('PathResolver anchor (行為為錨)', () => {
  it('(a) 非相對 import + includeNodeModules:false → 回傳 null（排除 node_modules 語意）', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/proj/src/a.ts': 'import \'lodash\';\n'
    });

    const resolver = createResolver(fileSystem, { includeNodeModules: false });
    const result = await resolver.resolvePath('lodash', '/proj/src/a.ts');

    expect(result).toBeNull();
  });

  it('(b) 相對 import 指向不存在檔案 → 回傳非 null 物件且 exists === false', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/proj/src/a.ts': 'import \'./missing\';\n'
    });

    const resolver = createResolver(fileSystem, {});
    const result = await resolver.resolvePath('./missing', '/proj/src/a.ts');

    expect(result).not.toBeNull();
    expect(result?.exists).toBe(false);
  });

  it('(c-1) 一般相對路徑成功解析', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/proj/src/a.ts': 'import \'./util\';\n',
      '/proj/src/util.ts': 'export const util = 1;\n'
    });

    const resolver = createResolver(fileSystem, {});
    const result = await resolver.resolvePath('./util', '/proj/src/a.ts');

    expect(result).not.toBeNull();
    expect(result?.exists).toBe(true);
    expect(result?.resolvedPath).toBe('/proj/src/util.ts');
    expect(result?.isRelative).toBe(true);
  });

  it('(c-2) path alias 成功解析', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/proj/src/a.ts': 'import \'@lib/util\';\n',
      '/proj/src/lib/util.ts': 'export const util = 1;\n'
    });

    const pathAliases = createPathAliasMap({ '@lib': '/proj/src/lib' }, new Set(['@lib']));
    const resolver = createResolver(fileSystem, { pathAliases });
    const result = await resolver.resolvePath('@lib/util', '/proj/src/a.ts');

    expect(result).not.toBeNull();
    expect(result?.exists).toBe(true);
    expect(result?.resolvedPath).toBe('/proj/src/lib/util.ts');
  });

  // (5) 目標語意（非現狀）：direct 副檔名檔應優先於同名 index 檔被選中。
  //
  // 重要發現：task 背景假設「impact/path-resolver 現行就是 block 序，這個案例
  // 預期綠燈」——實測後不成立。resolveWithExtensions 最前段有一個獨立於
  // 「先試全部 direct、才試全部 index」兩段迴圈之外的短路分支：只要 './foo' 的
  // 基底路徑 '/proj/src/foo' 本身存在且是目錄（只要 foo/index.* 存在就必然如此），
  // 就會直接在該分支內找 index 檔並提前 return，兩段迴圈的 index 迴圈因此形同
  // 從未被觸達（direct 迴圈也一樣，因為第一個符合的分支已經 return）。
  // 也就是說：impact/path-resolver 與 cli/module-file-resolver 對同一輸入
  // （foo.tsx 存在 + foo/index.ts 存在）現行給出「相反」的結果——
  // module-file-resolver 選 direct（見同任務 module-file-resolver.anchor.test.ts
  // 對應案例，真綠燈），impact/path-resolver 選 index。這代表要收斂到單一模組時，
  // 至少有兩處（path-resolver 與 call-hierarchy 的 resolveProjectImportPath）
  // 現行不符合「direct 優先」目標語意，不是只有 call-hierarchy 一處。
  //
  // 斷言目標語意（direct 勝出）：現行行為下這個斷言會失敗，用 it.fails 讓它
  // 保持紅但不讓整體測試套件變紅；一旦收斂修正為 direct 優先，it.fails 會偵測到
  // 「預期失敗卻通過」而自動示警，提醒把它改回一般 it。
  it('目標語意：direct 副檔名檔應優先於同名 index 檔被選中（已收斂移除目錄短路，綠燈）', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/proj/src/a.ts': 'import \'./foo\';\n',
      '/proj/src/foo.tsx': 'export const fromTsx = 1;\n',
      '/proj/src/foo/index.ts': 'export const fromIndex = 1;\n'
    });

    const resolver = createResolver(fileSystem, {});
    const result = await resolver.resolvePath('./foo', '/proj/src/a.ts');

    expect(result?.resolvedPath).toBe('/proj/src/foo.tsx');
  });
});
