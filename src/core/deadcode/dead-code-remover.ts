/**
 * Dead Code 刪除器
 * 主協調器：委派給專門的工具模組處理
 */

import { minimatch } from 'minimatch';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import { createSymbolFinder, type SymbolFinder } from '@core/shared/symbol-finder/index.js';
import type {
  DeadCodeItem,
  DeadCodeRemovalOptions,
  DeadCodeRemovalPreview,
  DeadCodeRemovalResult,
  RemovalOperation,
  ImportCleanupOperation,
  RemovalSummary,
  UpdatedFile
} from './types.js';
import { DEFAULT_REMOVAL_OPTIONS } from './types.js';
import { analyzeImportCleanups } from './import-cleanup.js';
import { generateRemovalOperations } from './removal-operations.js';
import {
  groupOperationsByFile,
  applyFileOperations,
  readFile,
  clearCache
} from './file-operations.js';

/**
 * Dead Code 刪除器
 */
export class DeadCodeRemover {
  private readonly options: Required<DeadCodeRemovalOptions>;
  private readonly fileCache = new Map<string, string>();
  private readonly symbolFinder: SymbolFinder;

  constructor(
    private readonly fileSystem: IFileSystem,
    private readonly parserRegistry: ParserRegistry,
    options?: DeadCodeRemovalOptions
  ) {
    this.options = { ...DEFAULT_REMOVAL_OPTIONS, ...options };
    this.symbolFinder = createSymbolFinder(parserRegistry, fileSystem);
  }

  /**
   * 預覽刪除操作
   */
  async preview(deadCodeItems: readonly DeadCodeItem[]): Promise<DeadCodeRemovalPreview> {
    try {
      // 1. 過濾符合條件的項目
      const { filteredItems, warnings } = this.filterItems(deadCodeItems);

      if (filteredItems.length === 0) {
        return this.createEmptyPreview(warnings);
      }

      // 2. 產生刪除操作
      const fileReader = { readFile: (filePath: string) => this.readFile(filePath) };
      const { operations: removals, warnings: removalWarnings } = await generateRemovalOperations(
        filteredItems,
        fileReader
      );
      warnings.push(...removalWarnings);

      // 3. 分析並產生 import 清理操作
      let importCleanups: ImportCleanupOperation[] = [];
      if (this.options.cleanupImports) {
        const importResult = await analyzeImportCleanups(removals, fileReader, this.symbolFinder);
        importCleanups = importResult.cleanups;
        warnings.push(...importResult.warnings);
      }

      // 4. 計算統計
      const summary = this.calculateSummary(removals, importCleanups);

      // 5. 收集影響的檔案
      const affectedFiles = this.collectAffectedFiles(removals, importCleanups);

      return {
        success: true,
        removals,
        importCleanups,
        affectedFiles,
        summary,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      return {
        success: false,
        removals: [],
        importCleanups: [],
        affectedFiles: [],
        summary: this.createEmptySummary(),
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * 執行刪除（非 dry-run 時）
   */
  async execute(preview: DeadCodeRemovalPreview): Promise<DeadCodeRemovalResult> {
    if (!preview.success) {
      return {
        success: false,
        updatedFiles: [],
        summary: preview.summary,
        errors: preview.errors
      };
    }

    const errors: string[] = [];
    const updatedFiles: UpdatedFile[] = [];

    // 按檔案分組操作
    const fileOperations = groupOperationsByFile(preview);

    // 逐檔案套用變更
    for (const [filePath, operations] of fileOperations) {
      try {
        const result = await applyFileOperations(filePath, operations, this.fileCache, this.fileSystem);
        updatedFiles.push(result);
      } catch (error) {
        errors.push(`檔案 ${filePath} 處理失敗: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      success: errors.length === 0,
      updatedFiles,
      summary: preview.summary,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 過濾符合刪除條件的項目
   */
  private filterItems(items: readonly DeadCodeItem[]): {
    filteredItems: DeadCodeItem[];
    warnings: string[];
  } {
    const filteredItems: DeadCodeItem[] = [];
    const warnings: string[] = [];

    for (const item of items) {
      // 排除檔案模式（支援 glob 匹配）
      if (this.options.excludeFiles.some(pattern =>
        this.matchesExcludePattern(item.location.filePath, pattern)
      )) {
        warnings.push(`跳過 ${item.name}：檔案被排除`);
        continue;
      }

      // 排除符號名稱
      if (this.options.excludeSymbols.includes(item.name)) {
        warnings.push(`跳過 ${item.name}：符號被排除`);
        continue;
      }

      filteredItems.push(item);
    }

    return { filteredItems, warnings };
  }

  /**
   * 計算統計摘要
   */
  private calculateSummary(
    removals: readonly RemovalOperation[],
    importCleanups: readonly ImportCleanupOperation[]
  ): RemovalSummary {
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
  private collectAffectedFiles(
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

  /**
   * 建立空的預覽結果
   */
  private createEmptyPreview(warnings: string[]): DeadCodeRemovalPreview {
    return {
      success: true,
      removals: [],
      importCleanups: [],
      affectedFiles: [],
      summary: this.createEmptySummary(),
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * 建立空的統計摘要
   */
  private createEmptySummary(): RemovalSummary {
    return {
      totalRemovals: 0,
      byType: {},
      filesAffected: 0,
      linesRemoved: 0,
      importsCleanedUp: 0
    };
  }

  /**
   * 讀取檔案
   */
  private async readFile(filePath: string): Promise<string | null> {
    return readFile(filePath, this.fileCache, this.fileSystem);
  }

  /**
   * 檢查檔案路徑是否匹配排除模式
   * 支援 glob 模式（如 *.test.ts、**\/__tests__/**）和簡單字串匹配
   */
  private matchesExcludePattern(filePath: string, pattern: string): boolean {
    // 如果 pattern 包含 glob 特殊字符，使用 minimatch
    if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
      return minimatch(filePath, pattern, { dot: true, matchBase: true });
    }
    // 否則使用簡單字串包含匹配（向後相容）
    return filePath.includes(pattern);
  }

  /**
   * 清除快取
   */
  clearCache(): void {
    clearCache(this.fileCache);
  }
}

/**
 * 建立 DeadCodeRemover 實例
 */
export function createDeadCodeRemover(
  fileSystem: IFileSystem,
  parserRegistry: ParserRegistry,
  options?: DeadCodeRemovalOptions
): DeadCodeRemover {
  return new DeadCodeRemover(fileSystem, parserRegistry, options);
}
