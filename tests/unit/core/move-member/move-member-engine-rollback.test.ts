/**
 * MoveMemberEngine 非預覽路徑 rollback 單元測試（C19 修復回歸測試）
 *
 * 背景：舊版 legacy ChangeApplier 依序寫入 source/target/references，
 * 中途寫入失敗會留下半套狀態（source 已被改寫，target 卻沒寫成功）。
 * 修復後 moveMember(preview:false) 改走 generateChangeset() 產出的 Changeset
 * + infrastructure/changeset 的統一 ChangeApplicator（atomic + rollbackOnError），
 * 任一檔案寫入失敗時應整批回滾，source 檔案內容必須維持原樣。
 */

import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import { MoveMemberEngine } from '@core/move-member/move-member-engine.js';
import { MoveMemberErrorCode, MoveTargetType } from '@core/move-member/types.js';
import type { MoveMemberOptions } from '@core/move-member/types.js';
import { createMockParserRegistry } from '../_helpers/mock-factories.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { DirectoryEntry, FileStats } from '@infrastructure/storage/types.js';

/**
 * 有狀態的假 IFileSystem：真正記錄寫入內容（非 mock-factories 的靜態 snapshot），
 * 才能驗證「寫入失敗後 source 內容是否被 rollback 還原」。
 * 可指定某個路徑的 writeFile 一律失敗，模擬中途寫入失敗。
 */
function createStatefulFakeFileSystem(
  initialFiles: Record<string, string>,
  failWritePaths: readonly string[] = []
): IFileSystem {
  const files = new Map<string, string>(Object.entries(initialFiles));
  const failSet = new Set(failWritePaths);

  const stats = (): FileStats => ({
    isFile: true,
    isDirectory: false,
    size: 0,
    createdTime: new Date(),
    modifiedTime: new Date(),
    accessedTime: new Date(),
    mode: 0o644
  });

  return {
    readFile: vi.fn().mockImplementation(async (filePath: string) => {
      if (!files.has(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      return files.get(filePath) as string;
    }),
    writeFile: vi.fn().mockImplementation(async (filePath: string, content: string) => {
      if (failSet.has(filePath)) {
        throw new Error(`模擬寫入失敗: ${filePath}`);
      }
      files.set(filePath, content);
    }),
    appendFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockImplementation(async (filePath: string) => {
      files.delete(filePath);
    }),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    readDirectory: vi.fn().mockResolvedValue([] as DirectoryEntry[]),
    deleteDirectory: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockImplementation(async (filePath: string) => files.has(filePath)),
    getStats: vi.fn().mockImplementation(async () => stats()),
    isFile: vi.fn().mockResolvedValue(true),
    isDirectory: vi.fn().mockResolvedValue(false),
    copyFile: vi.fn().mockResolvedValue(undefined),
    moveFile: vi.fn().mockResolvedValue(undefined),
    glob: vi.fn().mockResolvedValue([])
  } as unknown as IFileSystem & { __files: Map<string, string> };
}

function makeOptions(overrides?: Partial<MoveMemberOptions>): MoveMemberOptions {
  return {
    sourceFile: '/src/source.ts',
    memberName: 'greet',
    target: {
      type: MoveTargetType.ExistingFile,
      filePath: '/src/target.ts'
    },
    projectRoot: '/src',
    preview: false,
    updateReferences: false,
    ...overrides
  };
}

describe('MoveMemberEngine - 非預覽路徑寫入失敗 rollback (C19)', () => {
  it('Given target 寫入失敗, when moveMember(preview:false), then success:false 且 source 檔案內容維持原樣（rollback 生效）', async () => {
    const sourceOriginal = 'export function greet(name: string): string { return name; }';
    const targetOriginal = '';

    const fileSystem = createStatefulFakeFileSystem(
      {
        '/src/source.ts': sourceOriginal,
        '/src/target.ts': targetOriginal
      },
      ['/src/target.ts'] // target 寫入一律失敗
    );

    const engine = new MoveMemberEngine(createMockParserRegistry(), fileSystem);

    const result = await engine.moveMember(makeOptions());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(MoveMemberErrorCode.WriteFailed);
    }

    // 關鍵斷言：source 檔案內容必須維持原樣，不能停在「member 已被移除」的半套狀態
    const sourceAfter = await fileSystem.readFile('/src/source.ts', 'utf-8');
    expect(sourceAfter).toBe(sourceOriginal);

    // target 因寫入失敗，內容亦應維持原樣
    const targetAfter = await fileSystem.readFile('/src/target.ts', 'utf-8');
    expect(targetAfter).toBe(targetOriginal);
  });

  it('Given 全部寫入成功, when moveMember(preview:false), then success:true 且 source/target 內容皆已更新', async () => {
    const sourceOriginal = 'export function greet(name: string): string { return name; }';
    const targetOriginal = '';

    const fileSystem = createStatefulFakeFileSystem({
      '/src/source.ts': sourceOriginal,
      '/src/target.ts': targetOriginal
    });

    const engine = new MoveMemberEngine(createMockParserRegistry(), fileSystem);

    const result = await engine.moveMember(makeOptions());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.executed).toBe(true);
    }

    const sourceAfter = await fileSystem.readFile('/src/source.ts', 'utf-8');
    expect(sourceAfter).not.toContain('function greet');

    const targetAfter = await fileSystem.readFile('/src/target.ts', 'utf-8');
    expect(targetAfter).toContain('function greet');
  });
});
