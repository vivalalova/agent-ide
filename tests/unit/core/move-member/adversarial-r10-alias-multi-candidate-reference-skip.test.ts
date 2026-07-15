/**
 * R10（缺陷）：reference-updater.ts 建構 `new PathUtils(new ImportResolver(...))`
 * 時未傳入手上已有的 fileSystem（約 61-67 行），`prepareReferenceUpdates`
 * （約 120-123 行）因而一律呼叫同步版 `pathUtils.resolveImportPath` →
 * `ImportResolver.resolvePathAlias`（import-resolver.ts 約 500-510 行）。該同步版
 * 對多候選 alias 一律回傳 `match?.candidates.at(-1)`（宣告順序「最後一個」候選），
 * 完全無視檔案系統實際存在性。
 *
 * tsconfig `"@lib/*": ["src/lib/*", "legacy/*"]` 這種一個 alias 對應多個候選
 * base path 的合法宣告下，真實檔案在第一候選 `src/lib/target.ts`，最後一候選
 * `legacy/target.ts` 早已不存在。消費端 `import { helper } from '@lib/target'`
 * 解析出的絕對路徑會是不存在的 `legacy/target.ts`，與來源檔
 * `pathsMatch` 比對失敗，導致該筆 import 被當成「與本次搬移無關」而整段跳過。
 *
 * 業務後果：move-member 把 `helper` 從 target.ts 搬到 newHome.ts 後，
 * consumer.ts 仍舊 `import { helper } from '@lib/target'`——該符號已被移走，
 * 這個 import 會變成執行期找不到成員的壞引用，且完全沒有出現在
 * referenceUpdates 裡讓使用者知道需要手動處理。
 *
 * 正確契約（期望行為）：resolveImportPath 應解析到實際存在的候選
 * `src/lib/target.ts`，判定 consumer.ts 確實引用來源檔，referenceUpdates
 * 應包含該消費端檔案指向新目標檔的更新。
 */
import { describe, expect, it, vi } from 'vitest';
import { MoveMemberEngine } from '@core/move-member/move-member-engine.js';
import { MoveTargetType } from '@core/move-member/types.js';
import type { MoveMemberOptions } from '@core/move-member/types.js';
import { createStructuredPathAliasMap } from '@shared/path-alias-resolver.js';
import { createMockParserRegistry } from '../_helpers/mock-factories.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { DirectoryEntry, FileStats } from '@infrastructure/storage/types.js';
import * as path from 'path';

/**
 * 依一份「路徑 -> 內容」的扁平檔案表推算目錄結構，供 ReferenceUpdater 的
 * `getProjectFiles`（遞迴 readDirectory）掃描整個專案樹（見 reference-updater.ts
 * 約 684-708 行），不像既有 mock-factories 的 createMockFileSystem 固定回傳
 * 空陣列（那只適用於 updateReferences:false 的測試）。
 */
function createProjectFileSystem(files: Record<string, string>): IFileSystem {
  const stats = (): FileStats => ({
    isFile: true,
    isDirectory: false,
    size: 0,
    createdTime: new Date(),
    modifiedTime: new Date(),
    accessedTime: new Date(),
    mode: 0o644
  });

  const allPaths = Object.keys(files);

  return {
    readFile: vi.fn().mockImplementation(async (filePath: string) => {
      if (!(filePath in files)) {
        throw new Error(`File not found: ${filePath}`);
      }
      return files[filePath];
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    readDirectory: vi.fn().mockImplementation(async (dirPath: string): Promise<DirectoryEntry[]> => {
      const normalizedDir = path.normalize(dirPath);
      const childNames = new Map<string, boolean>(); // name -> isDirectory

      for (const filePath of allPaths) {
        const relative = path.relative(normalizedDir, filePath);
        if (relative.startsWith('..') || relative === '') {continue;}
        const segments = relative.split(path.sep);
        const isDirectChild = segments.length === 1;
        childNames.set(segments[0], !isDirectChild || childNames.get(segments[0]) === true);
      }

      return [...childNames.entries()].map(([name, isDirectory]) => ({
        name,
        path: path.join(normalizedDir, name),
        isFile: !isDirectory,
        isDirectory
      }));
    }),
    deleteDirectory: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockImplementation(async (filePath: string) => filePath in files),
    getStats: vi.fn().mockImplementation(async () => stats()),
    isFile: vi.fn().mockImplementation(async (filePath: string) => filePath in files),
    isDirectory: vi.fn().mockResolvedValue(false),
    copyFile: vi.fn().mockResolvedValue(undefined),
    moveFile: vi.fn().mockResolvedValue(undefined),
    glob: vi.fn().mockResolvedValue([])
  } as unknown as IFileSystem;
}

describe('MoveMemberEngine alias 多候選存在性（adversarial R10）', () => {
  it('搬移成員後應更新透過多候選 alias import 來源檔的消費端引用', async () => {
    const sourcePath = '/project/src/lib/target.ts';
    const targetPath = '/project/src/lib/newHome.ts';
    const consumerPath = '/project/src/app/consumer.ts';

    // 對應 tsconfig `"@lib/*": ["src/lib/*", "legacy/*"]`：真實檔案只在第一候選
    // src/lib 底下，legacy 是早已不存在的舊候選。
    const pathAliases = createStructuredPathAliasMap([
      { alias: '@lib', wildcard: true, candidates: ['/project/src/lib', '/project/legacy'] }
    ]);

    const fileSystem = createProjectFileSystem({
      [sourcePath]: 'export function helper(): string { return \'hi\'; }\n',
      [targetPath]: '',
      [consumerPath]: 'import { helper } from \'@lib/target\';\n\nhelper();\n'
    });

    const engine = new MoveMemberEngine(createMockParserRegistry(), fileSystem, { pathAliases });

    const options: MoveMemberOptions = {
      sourceFile: sourcePath,
      memberName: 'helper',
      target: {
        type: MoveTargetType.ExistingFile,
        filePath: targetPath
      },
      projectRoot: '/project',
      preview: true,
      updateReferences: true
    };

    const result = await engine.moveMember(options);

    expect(result.success).toBe(true);
    if (!result.success) {return;}

    // 現行為（缺陷）：consumer.ts 的 `@lib/target` import 被同步 alias 解析誤判到
    // 不存在的 legacy/target.ts，pathsMatch 失敗 → 整段被當成無關 import 跳過，
    // referenceUpdates 不含 consumer.ts，留下指向已搬空成員的壞引用。
    const consumerUpdate = result.referenceUpdates.find(update => update.filePath === consumerPath);
    expect(consumerUpdate).toBeDefined();
    expect(consumerUpdate?.newImport).not.toBe(consumerUpdate?.originalImport);
  });
});
