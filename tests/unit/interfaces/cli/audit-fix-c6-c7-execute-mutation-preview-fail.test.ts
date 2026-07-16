/**
 * audit-fix C6 / C7 regression（先紅後綠）
 *
 * C6：convertChangesetToPreviewInput 因重疊 edits 等失敗時，
 *     executeMutationCommand 不得回 success:true / 當 noop 成功。
 * C7：dry-run 在 previewInput.success=false 時不得 return success:true。
 *
 * 共用根因：command-utils.executeMutationCommand 在 dry-run 分支
 * 直接 return { success: true, previewInput }，未檢查 previewInput.success。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangesetCommand, type Changeset } from '@infrastructure/changeset/types.js';
import { executeMutationCommand } from '@interfaces/cli/command-utils.js';
import {
  createUnifiedOutputHandler,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

function createMockFileSystem(content = 'line1\nline2\nline3\n'): IFileSystem {
  return {
    exists: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue(content),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    moveFile: vi.fn().mockResolvedValue(undefined),
    isDirectory: vi.fn().mockResolvedValue(false),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    readDirectory: vi.fn().mockResolvedValue([]),
    deleteDirectory: vi.fn().mockResolvedValue(undefined),
    getFilePath: vi.fn().mockImplementation((p: string) => p),
    getRelativePath: vi.fn().mockImplementation((p: string) => p),
    isAbsolutePath: vi.fn().mockReturnValue(true),
    joinPath: vi.fn().mockImplementation((...paths: string[]) => paths.join('/'))
  } as unknown as IFileSystem;
}

/** 兩筆重疊 TextEdit → convertChangesetToPreviewInput 回 success:false */
function createOverlappingChangeset(): Changeset {
  return {
    textChanges: [
      {
        filePath: '/src/file.ts',
        edits: [
          {
            range: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 6 }
            },
            newText: 'AAAAA'
          },
          {
            range: {
              start: { line: 1, column: 3 },
              end: { line: 1, column: 8 }
            },
            newText: 'BBBBB'
          }
        ]
      }
    ],
    fileOperations: [],
    description: 'overlapping edits for C6/C7',
    command: ChangesetCommand.ChangeSignature,
    success: true
  };
}

describe('audit-fix C6/C7：executeMutationCommand 對 preview 失敗', () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('C7：dry-run 且 previewInput.success=false 時不得 return success:true / exit 0', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await executeMutationCommand(createOverlappingChangeset(), {
      fileSystem: createMockFileSystem(),
      format: OutputFormat.Json,
      dryRun: true,
      outputHandler: createUnifiedOutputHandler({ color: false }),
      commandName: 'change-signature'
    });

    // Bug：dry-run 分支忽略 previewInput.success，固定回 success:true、不設 exitCode
    expect(result.previewInput?.success).toBe(false);
    expect(result.success).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it('C6：convertChangesetToPreviewInput 因重疊 edits 失敗時，dry-run 不得當成功 noop', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // change-signature 契約：preview 轉換失敗（applyTextEdits 重疊）→ 不得 exit 0
    const result = await executeMutationCommand(createOverlappingChangeset(), {
      fileSystem: createMockFileSystem(),
      format: OutputFormat.Json,
      dryRun: true,
      outputHandler: createUnifiedOutputHandler({ color: false }),
      commandName: 'change-signature'
    });

    expect(result.previewInput?.success).toBe(false);
    expect(result.previewInput?.errors?.length ?? 0).toBeGreaterThan(0);
    // 函式回傳與 process.exitCode 皆須標失敗（CLI 依此決定 exit）
    expect(result.success).toBe(false);
    expect(process.exitCode).toBe(1);

    // JSON 輸出不得以 success:true 當 noop 成功
    const jsonLine = logs.find((l) => {
      try {
        const o = JSON.parse(l);
        return typeof o === 'object' && o !== null && 'success' in o;
      } catch {
        return false;
      }
    });
    if (jsonLine) {
      const parsed = JSON.parse(jsonLine);
      expect(parsed.success).toBe(false);
      expect(parsed.noop).not.toBe(true);
    }
  });
});
