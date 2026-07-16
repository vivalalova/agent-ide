/**
 * audit-fix E1 regression
 *
 * move 命令在 convertChangesetToPreviewInput 失敗
 * （previewInput.success === false）時應 process.exitCode = 1，
 * 不得把失敗 preview 當成功預覽輸出。
 *
 * 對照：executeMutationCommand 已檢查 previewInput.success；
 * move 單檔／glob 路徑自行 convert，必須在呼叫點後同等檢查。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ChangesetCommand,
  FileOperationType,
  type Changeset
} from '@infrastructure/changeset/types.js';
import { convertChangesetToPreviewInput } from '@infrastructure/changeset/index.js';
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

/** 重疊 edits → convert 回 success:false */
function createOverlappingMoveChangeset(): Changeset {
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
    fileOperations: [
      {
        type: FileOperationType.Move,
        sourcePath: '/src/a.ts',
        targetPath: '/src/b.ts'
      }
    ],
    description: 'move with overlapping import edits',
    command: ChangesetCommand.Move,
    success: true
  };
}

/**
 * 從 await convertChangesetToPreviewInput(...) 呼叫點起切 slice，
 * 避免 indexOf 命中 import 導致掃不到後續 success 檢查。
 */
function sliceAfterConvertCall(source: string, maxLen = 800): string {
  const callRe = /await\s+convertChangesetToPreviewInput\s*\(/;
  const m = callRe.exec(source);
  expect(m, 'expected await convertChangesetToPreviewInput(...) call site').not.toBeNull();
  return source.slice(m!.index, m!.index + maxLen);
}

/** 契約：呼叫 convert 後必須 if (!previewInput.success) 並設 exitCode = 1 */
function assertPreviewFailureHandling(source: string): void {
  const afterCall = sliceAfterConvertCall(source);

  expect(/if\s*\(\s*!previewInput\.success\s*\)/.test(afterCall)
    || /if\s*\(\s*previewInput\.success\s*===?\s*false\s*\)/.test(afterCall)).toBe(true);

  const failureBlock = afterCall.match(
    /if\s*\(\s*(?:!previewInput\.success|previewInput\.success\s*===?\s*false)\s*\)\s*\{[\s\S]*?\breturn\b/
  );
  expect(failureBlock, 'expected preview failure if-block with return').not.toBeNull();
  expect(failureBlock![0]).toMatch(/process\.exitCode\s*=\s*1/);
}

describe('audit-fix E1：move dry-run 在 preview 失敗時應 exit != 0', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('重疊 edits 的 convert 回 success:false；move.command 呼叫點後必須檢查並 exitCode=1', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const fileSystem = createMockFileSystem();
    const changeset = createOverlappingMoveChangeset();

    const previewInput = await convertChangesetToPreviewInput(changeset, fileSystem);
    expect(previewInput.success).toBe(false);

    const moveCommandPath = join(
      process.cwd(),
      'src/interfaces/cli/commands/move.command.ts'
    );
    const moveSource = readFileSync(moveCommandPath, 'utf-8');
    assertPreviewFailureHandling(moveSource);
  });

  it('glob move 同樣必須在 convert 呼叫後檢查 preview 失敗並 exitCode=1', () => {
    const globPath = join(
      process.cwd(),
      'src/interfaces/cli/commands/move-glob-command-handler.ts'
    );
    const source = readFileSync(globPath, 'utf-8');
    assertPreviewFailureHandling(source);
  });
});
