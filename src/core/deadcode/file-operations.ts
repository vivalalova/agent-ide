/**
 * 檔案操作處理器
 * 負責套用刪除操作到檔案
 */

import type { Range } from '@shared/types/core.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type {
  DeadCodeRemovalPreview,
  ImportCleanupOperation,
  RemovalOperation,
  UpdatedFile
} from './types.js';
import type { DeadCodeCacheService } from './shared-cache.js';

/**
 * 檔案操作類型列舉
 * 排序優先級：import-partial (0) > import-delete (1) > removal (2)
 */
export enum FileOperationType {
  /** 部分 import 清理（替換） */
  ImportPartial = 'import-partial',
  /** 完整 import 刪除 */
  ImportDelete = 'import-delete',
  /** 符號刪除 */
  Removal = 'removal'
}

/**
 * 檔案操作類型的排序優先級
 * import 清理優先於符號刪除，確保處理順序穩定
 */
const FILE_OPERATION_PRIORITY: Record<FileOperationType, number> = {
  [FileOperationType.ImportPartial]: 0,
  [FileOperationType.ImportDelete]: 1,
  [FileOperationType.Removal]: 2
};

/**
 * 檔案操作資訊
 */
export interface FileOperation {
  /** 操作範圍 */
  range: Range;
  /** 操作類型 */
  type: FileOperationType;
  /** 部分清理時的新內容 */
  newContent?: string;
}

/**
 * 檔案操作處理器
 */
export class FileOperationsHandler {
  constructor(
    private readonly fileSystem: IFileSystem,
    private readonly cacheService: DeadCodeCacheService
  ) {}

  /**
   * 按檔案分組操作（去重相同 range）
   */
  groupOperationsByFile(
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
      addOperation(removal.filePath, { range: removal.range, type: FileOperationType.Removal });
    }

    // 加入 import 清理操作
    for (const cleanup of preview.importCleanups) {
      if (cleanup.cleanupType === 'partial' && cleanup.newImport) {
        addOperation(cleanup.filePath, {
          range: cleanup.range,
          type: FileOperationType.ImportPartial,
          newContent: cleanup.newImport
        });
      } else {
        addOperation(cleanup.filePath, { range: cleanup.range, type: FileOperationType.ImportDelete });
      }
    }

    return fileOperations;
  }

  /**
   * 套用檔案操作
   */
  async applyFileOperations(
    filePath: string,
    operations: FileOperation[]
  ): Promise<UpdatedFile> {
    const originalContent = await this.readFile(filePath);
    if (!originalContent) {
      throw new Error(`無法讀取檔案: ${filePath}`);
    }

    // 按位置從後往前排序（避免位置偏移）
    // 第三層：type 排序確保穩定性（import 清理優先於符號刪除）
    const sortedOps = [...operations].sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return b.range.start.line - a.range.start.line;
      }
      if (a.range.start.column !== b.range.start.column) {
        return b.range.start.column - a.range.start.column;
      }
      return FILE_OPERATION_PRIORITY[a.type] - FILE_OPERATION_PRIORITY[b.type];
    });

    let lines = originalContent.split('\n');
    let removedSymbols = 0;
    let cleanedImports = 0;

    for (const op of sortedOps) {
      // 邊界檢查：確保索引在有效範圍內
      // 空檔案時 lines.length = 0，需特別處理避免負數索引
      if (lines.length === 0) {
        continue;
      }
      const maxIndex = lines.length - 1;
      const startLine = Math.max(0, Math.min(op.range.start.line - 1, maxIndex));
      const endLine = Math.max(startLine, Math.min(op.range.end.line - 1, maxIndex));
      const deleteCount = endLine - startLine + 1;

      if (op.type === FileOperationType.ImportPartial && op.newContent) {
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

        if (op.type === FileOperationType.Removal) {
          removedSymbols++;
        } else {
          cleanedImports++;
        }
      }
    }

    // 清理連續空行（最多保留一行）
    lines = this.cleanupEmptyLines(lines);

    const newContent = lines.join('\n');

    // 寫入檔案
    await this.writeFile(filePath, newContent);

    return {
      filePath,
      removedSymbols,
      cleanedImports
    };
  }

  /**
   * 清理連續空行
   */
  private cleanupEmptyLines(lines: string[]): string[] {
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
   * 讀取檔案（使用共用快取）
   */
  async readFile(filePath: string): Promise<string | null> {
    const cached = this.cacheService.getFile(filePath);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      const contentStr = typeof content === 'string' ? content : content.toString('utf-8');
      this.cacheService.setFile(filePath, contentStr);
      return contentStr;
    } catch (error) {
      console.warn('[deadcode] Failed to read file:', error);
      return null;
    }
  }

  /**
   * 寫入檔案（同步更新共用快取）
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    await this.fileSystem.writeFile(filePath, content);
    this.cacheService.updateFile(filePath, content);
  }

  /**
   * 提取程式碼
   */
  extractCode(content: string, range: Range): string {
    const lines = content.split('\n');
    // 邊界檢查：確保索引在有效範圍內
    const startLine = Math.max(0, Math.min(range.start.line - 1, lines.length - 1));
    const endLine = Math.max(0, Math.min(range.end.line - 1, lines.length - 1));

    if (startLine === endLine) {
      const line = lines[startLine] || '';
      return line.substring(range.start.column - 1, range.end.column - 1);
    }

    const result: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i] || '';
      if (i === startLine) {
        result.push(line.substring(range.start.column - 1));
      } else if (i === endLine) {
        result.push(line.substring(0, range.end.column - 1));
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * 計算統計摘要
   */
  calculateSummary(
    removals: readonly RemovalOperation[],
    importCleanups: readonly ImportCleanupOperation[]
  ): {
    totalRemovals: number;
    byType: Record<string, number>;
    filesAffected: number;
    linesRemoved: number;
    importsCleanedUp: number;
  } {
    const byType: Record<string, number> = {};

    for (const removal of removals) {
      byType[removal.symbolType] = (byType[removal.symbolType] || 0) + 1;
    }

    const filesAffected = new Set([
      ...removals.map(r => r.filePath),
      ...importCleanups.map(c => c.filePath)
    ]).size;

    // 計算刪除的行數
    let linesRemoved = 0;
    for (const removal of removals) {
      linesRemoved += removal.range.end.line - removal.range.start.line + 1;
    }
    for (const cleanup of importCleanups) {
      linesRemoved += cleanup.range.end.line - cleanup.range.start.line + 1;
    }

    return {
      totalRemovals: removals.length,
      byType,
      filesAffected,
      linesRemoved,
      importsCleanedUp: importCleanups.length
    };
  }

  /**
   * 收集影響的檔案
   */
  collectAffectedFiles(
    removals: readonly RemovalOperation[],
    importCleanups: readonly ImportCleanupOperation[]
  ): string[] {
    const files = new Set<string>();

    for (const removal of removals) {
      files.add(removal.filePath);
    }
    for (const cleanup of importCleanups) {
      files.add(cleanup.filePath);
    }

    return Array.from(files);
  }

}

/**
 * 建立 FileOperationsHandler 實例
 */
export function createFileOperationsHandler(
  fileSystem: IFileSystem,
  cacheService: DeadCodeCacheService
): FileOperationsHandler {
  return new FileOperationsHandler(fileSystem, cacheService);
}
