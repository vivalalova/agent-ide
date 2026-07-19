/**
 * 行為為錨測試：釘住 resolveModuleFile / getModuleFileCandidates 現行行為，
 * 供未來把四處「import specifier → 檔案」候選組裝邏輯收斂到 foundations 單一模組時
 * 當回歸基準。純粹釘現狀，不修 production code。
 */
import { describe, expect, it } from 'vitest';
import {
  resolveModuleFile,
  normalizePath
} from '@interfaces/cli/commands/module-file-resolver.js';
import type { SymbolReferenceFilterContext } from '@interfaces/cli/commands/symbol-reference-filter-types.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createStructuredPathAliasMap } from '@shared/path-alias-resolver.js';
import { SymbolType } from '@shared/types/symbol.js';
import { createLocation, createPosition, createRange } from '@shared/types/core.js';

/**
 * resolveModuleFile 只讀取 filterContext 的 fileSystem / targetFile / projectPath /
 * moduleResolution 幾個欄位；selectedSymbol 等欄位對這條路徑無影響，給一個指向
 * "targetFile" 自身、跟候選解析無關的最小合法 Symbol 即可，避免依賴完整 CLI 組裝流程
 * （createSymbolReferenceFilterContext 會強制 targetFile === selectedSymbol.location.filePath，
 * 無法獨立控制 targetFile 以便刻意讓它「跟任何候選都不比對」）。
 */
function buildFilterContext(
  fileSystem: MemFileSystem,
  options: {
    targetFile: string;
    projectPath: string;
    baseUrl?: string;
    pathAliases?: ReturnType<typeof createStructuredPathAliasMap>;
  }
): SymbolReferenceFilterContext {
  const dummyRange = createRange(createPosition(1, 1), createPosition(1, 1));
  return {
    selectedSymbol: {
      name: 'dummy',
      type: SymbolType.Variable,
      location: createLocation(options.targetFile, dummyRange),
      scope: undefined,
      modifiers: []
    },
    targetFile: normalizePath(options.targetFile),
    projectPath: options.projectPath,
    fileSystem,
    moduleProviderCache: new Map(),
    visitingModuleFiles: new Set(),
    fileAnalysisCache: new Map(),
    sourceFileCache: new Map(),
    defaultExportDeclaredNameCache: new Map(),
    moduleResolution: {
      pathAliases: options.pathAliases ?? createStructuredPathAliasMap([]),
      baseUrl: options.baseUrl
    }
  };
}

describe('resolveModuleFile anchor (行為為錨)', () => {
  it('(a) 直接相對路徑解析成功', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/proj/src/a.ts': 'import \'./util\';\n',
      '/proj/src/util.ts': 'export const util = 1;\n'
    });
    // targetFile 刻意跟本次候選毫無關聯，避免 pathMatchesTarget 提前命中，
    // 純粹觀察「候選存在性掃描」這條路徑。
    const filterContext = buildFilterContext(fileSystem, {
      targetFile: '/proj/src/unrelated-target.ts',
      projectPath: '/proj'
    });

    const resolved = await resolveModuleFile('./util', '/proj/src/a.ts', filterContext);

    expect(resolved).toBe(normalizePath('/proj/src/util.ts'));
  });

  it('(b) src/ 前綴 fallback 命中', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/proj/src/lib/thing.ts': 'export const thing = 1;\n'
    });
    const filterContext = buildFilterContext(fileSystem, {
      targetFile: '/proj/src/unrelated-target.ts',
      projectPath: '/proj'
    });

    // bare specifier 'src/...'：非相對、無 alias 命中、無 baseUrl，落到
    // resolveImportPath 的 `importPath.startsWith('src/')` fallback，相對 projectPath 解析。
    const resolved = await resolveModuleFile('src/lib/thing', '/proj/anywhere/from.ts', filterContext);

    expect(resolved).toBe(normalizePath('/proj/src/lib/thing.ts'));
  });

  it('(c) 候選皆不存在 → 回傳 null', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/proj/src/a.ts': 'import \'./missing\';\n'
    });
    const filterContext = buildFilterContext(fileSystem, {
      targetFile: '/proj/src/unrelated-target.ts',
      projectPath: '/proj'
    });

    const resolved = await resolveModuleFile('./missing', '/proj/src/a.ts', filterContext);

    expect(resolved).toBeNull();
  });

  it('(5) direct 副檔名檔與同名 index 檔並存時優先選 direct（block 序，預期綠燈）', async () => {
    // getModuleFileCandidates 純用字串組出候選陣列（無 fileSystem.exists/isDirectory
    // 短路檢查），block 序是全部 direct 副檔名候選在前、全部 index 候選在後；
    // resolveModuleFile 依此順序掃描第一個真正存在的候選，故 direct 檔應勝出。
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/proj/src/a.ts': 'import \'./foo\';\n',
      '/proj/src/foo.tsx': 'export const fromTsx = 1;\n',
      '/proj/src/foo/index.ts': 'export const fromIndex = 1;\n'
    });
    const filterContext = buildFilterContext(fileSystem, {
      targetFile: '/proj/src/unrelated-target.ts',
      projectPath: '/proj'
    });

    const resolved = await resolveModuleFile('./foo', '/proj/src/a.ts', filterContext);

    expect(resolved).toBe(normalizePath('/proj/src/foo.tsx'));
  });
});
