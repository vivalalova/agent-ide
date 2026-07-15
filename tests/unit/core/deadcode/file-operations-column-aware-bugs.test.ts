/**
 * Adversarial pin: applyFileOperations ignores columns and splices whole lines.
 * CLI apply path uses Changeset; this public API path still line-splices.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FileOperationsHandler,
  FileOperationType,
  type FileOperation
} from '@core/deadcode/file-operations.js';
import { createDeadCodeCacheService } from '@core/deadcode/shared-cache.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

function createMockFileSystem(files: Record<string, string>): IFileSystem & { _files: Record<string, string> } {
  const fileContents = { ...files };
  return {
    _files: fileContents,
    readFile: vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath in fileContents) return fileContents[filePath];
      throw new Error(`File not found: ${filePath}`);
    }),
    writeFile: vi.fn().mockImplementation(async (filePath: string, content: string) => {
      fileContents[filePath] = content;
    }),
    appendFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    readDirectory: vi.fn().mockResolvedValue([]),
    deleteDirectory: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockImplementation(async (filePath: string) => filePath in fileContents),
    getStats: vi.fn().mockResolvedValue({ isFile: true, isDirectory: false, size: 0 }),
    isFile: vi.fn().mockResolvedValue(true),
    isDirectory: vi.fn().mockResolvedValue(false),
    copyFile: vi.fn().mockResolvedValue(undefined),
    moveFile: vi.fn().mockResolvedValue(undefined),
    glob: vi.fn().mockResolvedValue([])
  } as unknown as IFileSystem & { _files: Record<string, string> };
}

describe('FileOperationsHandler column-aware apply (P2)', () => {
  it('mid-line removal range must not delete live declarators on the same line', async () => {
    const fs = createMockFileSystem({
      '/src/a.ts': 'let dead, live;\n'
    });
    const handler = new FileOperationsHandler(fs, createDeadCodeCacheService());

    // Surgical range covering only "dead, " (columns for identifier dead + trailing comma space)
    // line: let dead, live;
    // cols: 1234567890...
    //       let dead, live;
    // dead starts around column 5
    const op: FileOperation = {
      range: {
        start: { line: 1, column: 5 },
        end: { line: 1, column: 10 }
      },
      type: FileOperationType.Removal
    };

    await handler.applyFileOperations('/src/a.ts', [op]);
    const result = fs._files['/src/a.ts'];

    // Correct surgical apply would leave live (e.g. "let live;" or "let  live;")
    expect(result).toContain('live');
    expect(result).not.toMatch(/\bdead\b/);
  });
});
