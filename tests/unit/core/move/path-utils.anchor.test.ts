/**
 * 行為為錨測試：釘住 PathUtils.resolveImportPathAfterAlias（私有，經 public
 * resolveImportPath/resolveImportPathAsync 呼叫）與 PathUtils.pathsMatch 現行行為，
 * 供未來把四處「import specifier → 檔案」候選組裝邏輯收斂到 foundations 單一模組時
 * 當回歸基準。純粹釘現狀，不修 production code。
 */
import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ALLOWED_EXTENSIONS, PathUtils } from '@core/move/path-utils.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';

describe('PathUtils anchor (行為為錨)', () => {
  it('resolveImportPath：alias 解不出且無 baseUrl 時回傳原始 importPath（治標維持原樣語意）', () => {
    const pathUtils = new PathUtils(new ImportResolver({
      pathAliases: {},
      supportedExtensions: ALLOWED_EXTENSIONS
    }));

    // 裸 specifier，無 alias 命中、無 baseUrl：resolveImportPathAfterAlias 內
    // resolved === importPath 且無 baseUrl，最終回傳原始字串本身。
    const resolved = pathUtils.resolveImportPath('some-bare-specifier', '/proj/src/a.ts');

    expect(resolved).toBe('some-bare-specifier');
  });

  it('resolveImportPathAsync：alias 解不出且無 baseUrl 時同樣回傳原始 importPath', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/proj/src/a.ts': 'import \'some-bare-specifier\';\n'
    });
    const pathUtils = new PathUtils(
      new ImportResolver({ pathAliases: {}, supportedExtensions: ALLOWED_EXTENSIONS }),
      fileSystem
    );

    const resolved = await pathUtils.resolveImportPathAsync('some-bare-specifier', '/proj/src/a.ts');

    expect(resolved).toBe('some-bare-specifier');
  });

  it('pathsMatch：副檔名無關比對成立（同路徑不同副檔名視為相同）', () => {
    const pathUtils = new PathUtils(new ImportResolver({
      pathAliases: {},
      supportedExtensions: ALLOWED_EXTENSIONS
    }));

    expect(pathUtils.pathsMatch('/workspace/src/utils.ts', '/workspace/src/utils.js')).toBe(true);
  });

  it('pathsMatch：僅 path2（第二參數）是 index 形式才視為目錄 import 命中', () => {
    const pathUtils = new PathUtils(new ImportResolver({
      pathAliases: {},
      supportedExtensions: ALLOWED_EXTENSIONS
    }));

    // path1 是目錄、path2 是 'dir/index.ts' → 視為同一檔（既有正向 case）
    expect(pathUtils.pathsMatch('/workspace/src/utils', '/workspace/src/utils/index.ts')).toBe(true);

    // 反過來：path1 是 'dir/index.ts'、path2 是目錄 → 現行實作不觸發這條規則，
    // 純位置比對（withoutExt1 === withoutExt2 判斷方向固定看 path2 是否為 index），
    // 因此回傳 false（方向性現狀，非對稱行為）。
    expect(pathUtils.pathsMatch('/workspace/src/utils/index.ts', '/workspace/src/utils')).toBe(false);
  });
});
