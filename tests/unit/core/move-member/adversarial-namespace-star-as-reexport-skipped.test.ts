/**
 * MoveMemberEngine Unit 測試（回歸缺陷 #11）
 *
 * `export * as ns from './source'` 這種具名 namespace 別名的星號 re-export，
 * 原本完全未被 reference-updater 辨識：isStarReExport 只認無別名的
 * `export * from`，parseImportedMembers 需要 `{}` 具名區塊、extractNamespaceImport
 * 只認 `import` 不認 `export`，三者都落空，整條語句被靜默略過（continue），
 * 從未出現在 referenceUpdates 中。
 *
 * 正確行為：辨識為星號 re-export 後，在其上方插入一筆指向搬移後目標檔的具名
 * `export { helper } from '...'`，讓直接具名存取（`import { helper } from
 * './barrel'`）在成員搬移後仍可用。
 */
import { describe, expect, it, vi } from 'vitest';
import { MoveMemberEngine } from '@core/move-member/move-member-engine.js';
import { MoveTargetType } from '@core/move-member/types.js';
import type { MoveMemberOptions } from '@core/move-member/types.js';
import { createMockParserRegistry } from '../_helpers/mock-factories.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { DirectoryEntry, FileStats } from '@infrastructure/storage/types.js';
import * as path from 'path';

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
      const childNames = new Map<string, boolean>();

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

describe('MoveMemberEngine - export * as ns from 不應被靜默略過（缺陷 #11）', () => {
  it('barrel 檔的 namespace 星號 re-export 應在搬移後補上具名 export', async () => {
    const sourcePath = '/project/src/source.ts';
    const targetPath = '/project/src/newHome.ts';
    const barrelPath = '/project/src/barrel.ts';

    const fileSystem = createProjectFileSystem({
      [sourcePath]: 'export function helper(): string { return \'hi\'; }\n',
      [targetPath]: '',
      [barrelPath]: 'export * as ns from \'./source\';\n'
    });

    const engine = new MoveMemberEngine(createMockParserRegistry(), fileSystem);

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
    if (!result.success) { return; }

    // 現行為（缺陷）：barrel.ts 完全不出現在 referenceUpdates，語句被靜默略過。
    const barrelUpdate = result.referenceUpdates.find(update => update.filePath === barrelPath);
    expect(barrelUpdate).toBeDefined();
    expect(barrelUpdate?.newImport).toContain('export { helper }');
    // 原本的 namespace 星號 re-export 本身應保留不動（來源檔路徑未變，只是移出一個成員）
    expect(barrelUpdate?.newImport).toContain('export * as ns from \'./source\'');
  });
});
