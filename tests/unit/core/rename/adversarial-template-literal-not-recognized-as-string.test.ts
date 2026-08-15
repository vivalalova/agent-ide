/**
 * ReferenceUpdater 降級文字匹配 Unit 測試（回歸缺陷 #9）
 *
 * findSymbolReferencesByText（SymbolFinder 不可用時的降級路徑）原本只用
 * findStringRanges 辨識單/雙引號字串，完全不認得樣板字面值（`` ` ``）。
 * rename `oldName` 時，樣板字面值 `` `oldName` `` 內容中的 `oldName` 會被
 * 誤判為真實引用一併改掉，破壞字面文字本身。
 */

import { describe, expect, it } from 'vitest';
import { ReferenceUpdater } from '@core/rename/reference-updater.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { FileStats } from '@infrastructure/storage/types.js';

function createStats(size: number): FileStats {
  const now = new Date('2026-07-15T00:00:00.000Z');
  return {
    isFile: true,
    isDirectory: false,
    size,
    createdTime: now,
    modifiedTime: now,
    accessedTime: now,
    mode: 0o644
  };
}

function createFileSystem(content: string): IFileSystem {
  return {
    readFile: async () => content,
    getStats: async () => createStats(content.length)
  } as unknown as IFileSystem;
}

describe('ReferenceUpdater.findSymbolReferences - 降級文字匹配應排除樣板字面值內容', () => {
  it('樣板字面值內的 oldName 不應被視為真實引用', async () => {
    const content = 'const label = `oldName`;\noldName();';
    const fileSystem = createFileSystem(content);
    // 不傳 parserRegistry：強制走降級文字匹配路徑
    const updater = new ReferenceUpdater(undefined, fileSystem);

    const references = await updater.findSymbolReferences('/src/consumer.ts', 'oldName');

    // 正確行為：只有第 2 行真正的呼叫 `oldName()` 算作引用，
    // 第 1 行樣板字面值內容中的 `oldName` 不應被列入
    expect(references).toHaveLength(1);
    expect(references[0].range.start.line).toBe(2);
  });

  it('跨行區塊註解的延續行不應被誤判為真實程式碼引用', async () => {
    const content = '/*\noldName\n*/\noldName();';
    const fileSystem = createFileSystem(content);
    const updater = new ReferenceUpdater(undefined, fileSystem);

    const references = await updater.findSymbolReferences('/src/consumer.ts', 'oldName');

    expect(references).toHaveLength(1);
    expect(references[0].range.start.line).toBe(4);
  });
});
