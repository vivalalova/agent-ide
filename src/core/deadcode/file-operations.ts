/**
 * 檔案操作工具
 * 負責檔案讀寫和操作套用
 */

import type { Range } from '@shared/types/core.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type {
  DeadCodeRemovalPreview,
  UpdatedFile
} from './types.js';

/**
 * 檔案操作資訊
 */
export interface FileOperation {
  /** 操作範圍 */
  range: Range;
  /** 操作類型 */
  type: 'removal' | 'import-delete' | 'import-partial';
  /** 部分清理時的新內容 */
  newContent?: string;
}

/**
 * 按檔案分組操作（去重相同 range）
 */
export function groupOperationsByFile(
  preview: DeadCodeRemovalPreview
): Map<string, FileOperation[]> {
  const fileOperations = new Map<string, FileOperation[]>();

  // 用於檢查 range 是否重複
  const rangeKey = (r: Range) => `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
  const seenRanges = new Map<string, Set<string>>();

  const addOperation = (filePath: string, op: FileOperation) => {
    const existing = fileOperations.get(filePath) || [];
    const seen = seenRanges.get(filePath) || new Set();
    const key = rangeKey(op.range);

    // 去重：相同 range 只加入一次
    if (!seen.has(key)) {
      existing.push(op);
      seen.add(key);
      fileOperations.set(filePath, existing);
      seenRanges.set(filePath, seen);
    }
  };

  // 加入刪除操作
  for (const removal of preview.removals) {
    addOperation(removal.filePath, { range: removal.range, type: 'removal' });
  }

  // 加入 import 清理操作
  for (const cleanup of preview.importCleanups) {
    if (cleanup.cleanupType === 'partial' && cleanup.newImport) {
      addOperation(cleanup.filePath, {
        range: cleanup.range,
        type: 'import-partial',
        newContent: cleanup.newImport
      });
    } else {
      addOperation(cleanup.filePath, { range: cleanup.range, type: 'import-delete' });
    }
  }

  return fileOperations;
}

/**
 * 套用檔案操作
 */
export async function applyFileOperations(
  filePath: string,
  operations: FileOperation[],
  fileCache: Map<string, string>,
  fileSystem: IFileSystem
): Promise<UpdatedFile> {
  const originalContent = fileCache.get(filePath);
  if (!originalContent) {
    throw new Error(`無法讀取檔案: ${filePath}`);
  }

  // 按位置從後往前排序（避免位置偏移）
  // 第三層：type 排序確保穩定性（import 清理優先於符號刪除）
  const typeOrder: Record<FileOperation['type'], number> = {
    'import-partial': 0,
    'import-delete': 1,
    'removal': 2
  };
  const sortedOps = [...operations].sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return b.range.start.line - a.range.start.line;
    }
    if (a.range.start.column !== b.range.start.column) {
      return b.range.start.column - a.range.start.column;
    }
    return typeOrder[a.type] - typeOrder[b.type];
  });

  let lines = originalContent.split('\n');
  let removedSymbols = 0;
  let cleanedImports = 0;

  for (const op of sortedOps) {
    // 邊界檢查：確保索引在有效範圍內
    const startLine = Math.max(0, Math.min(op.range.start.line - 1, lines.length - 1));
    const endLine = Math.max(startLine, Math.min(op.range.end.line - 1, lines.length - 1));
    const deleteCount = endLine - startLine + 1;

    if (op.type === 'import-partial' && op.newContent) {
      // 部分清理：替換而非刪除
      if (startLine < lines.length && deleteCount > 0) {
        // 保留原始縮排
        const originalIndent = lines[startLine].match(/^(\s*)/)?.[1] || '';
        lines.splice(startLine, deleteCount, originalIndent + op.newContent);
      }
      cleanedImports++;
    } else {
      // 完整刪除
      if (startLine < lines.length && deleteCount > 0) {
        lines.splice(startLine, deleteCount);
      }

      if (op.type === 'removal') {
        removedSymbols++;
      } else {
        cleanedImports++;
      }
    }
  }

  // 清理連續空行（最多保留一行）
  lines = cleanupEmptyLines(lines);

  const newContent = lines.join('\n');

  // 寫入檔案
  await fileSystem.writeFile(filePath, newContent);
  fileCache.set(filePath, newContent);

  return {
    filePath,
    removedSymbols,
    cleanedImports
  };
}

/**
 * 清理連續空行
 */
export function cleanupEmptyLines(lines: string[]): string[] {
  const result: string[] = [];
  let prevEmpty = false;

  for (const line of lines) {
    const isEmpty = line.trim() === '';

    if (isEmpty && prevEmpty) {
      // 跳過連續的空行
      continue;
    }

    result.push(line);
    prevEmpty = isEmpty;
  }

  return result;
}

/**
 * 讀取檔案（帶快取）
 */
export async function readFile(
  filePath: string,
  fileCache: Map<string, string>,
  fileSystem: IFileSystem
): Promise<string | null> {
  if (fileCache.has(filePath)) {
    return fileCache.get(filePath)!;
  }

  try {
    const content = await fileSystem.readFile(filePath, 'utf-8');
    const contentStr = typeof content === 'string' ? content : content.toString('utf-8');
    fileCache.set(filePath, contentStr);
    return contentStr;
  } catch {
    // 清除可能存在的失敗快取，避免重試時仍返回 null
    fileCache.delete(filePath);
    return null;
  }
}

/**
 * 寫入檔案（更新快取）
 */
export async function writeFile(
  filePath: string,
  content: string,
  fileCache: Map<string, string>,
  fileSystem: IFileSystem
): Promise<void> {
  await fileSystem.writeFile(filePath, content);
  fileCache.set(filePath, content);
}

/**
 * 清除快取
 */
export function clearCache(fileCache: Map<string, string>): void {
  fileCache.clear();
}
