/**
 * Dead Code 刪除器
 * 負責刪除未使用的程式碼並清理相關 import
 */

import { minimatch } from 'minimatch';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { Changeset } from '@infrastructure/changeset/index.js';
import { createChangesetBuilder, ChangesetCommand, TextEditOperationType } from '@infrastructure/changeset/index.js';
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
import { RangeExpander } from './range-expander.js';
import { ImportCleaner } from './import-cleaner.js';
import { FileOperationsHandler } from './file-operations.js';

/**
 * Dead Code 刪除器
 */
export class DeadCodeRemover {
  private readonly options: Required<DeadCodeRemovalOptions>;
  private readonly fileCache = new Map<string, string | null>();
  private readonly rangeExpander: RangeExpander;
  private readonly importCleaner: ImportCleaner;
  private readonly fileOperations: FileOperationsHandler;

  constructor(
    private readonly fileSystem: IFileSystem,
    parserRegistry: ParserRegistry,
    options?: DeadCodeRemovalOptions
  ) {
    this.options = { ...DEFAULT_REMOVAL_OPTIONS, ...options };
    this.rangeExpander = new RangeExpander(parserRegistry);
    this.importCleaner = new ImportCleaner(fileSystem, parserRegistry);
    this.fileOperations = new FileOperationsHandler(fileSystem);
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
      const { operations: removals, warnings: removalWarnings } = await this.generateRemovalOperations(filteredItems);
      warnings.push(...removalWarnings);

      // 3. 分析並產生 import 清理操作
      let importCleanups: ImportCleanupOperation[] = [];
      if (this.options.cleanupImports) {
        const importResult = await this.importCleaner.analyzeImportCleanups(removals);
        importCleanups = importResult.cleanups;
        warnings.push(...importResult.warnings);
      }

      // 4. 計算統計
      const summary = this.fileOperations.calculateSummary(removals, importCleanups);

      // 5. 收集影響的檔案
      const affectedFiles = this.fileOperations.collectAffectedFiles(removals, importCleanups);

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
   * 生成死代碼刪除的 Changeset
   * @param deadCodeItems 待刪除的死代碼項目
   * @returns Changeset 變更集
   */
  async generateChangeset(deadCodeItems: readonly DeadCodeItem[]): Promise<Changeset> {
    const builder = createChangesetBuilder()
      .forCommand(ChangesetCommand.Deadcode);

    // 使用現有的 preview 邏輯收集變更
    const preview = await this.preview(deadCodeItems);

    if (!preview.success) {
      return builder
        .addError(preview.errors?.join(', ') ?? 'Preview failed')
        .build();
    }

    // 轉換 removals 為 TextEdit
    for (const removal of preview.removals) {
      builder.addTextChange(removal.filePath, [{
        range: removal.range,
        newText: '',
        description: `Remove ${removal.symbolType}: ${removal.symbolName}`
      }], TextEditOperationType.Delete);
    }

    // 轉換 importCleanups 為 TextEdit
    for (const cleanup of preview.importCleanups) {
      const newText = cleanup.cleanupType === 'partial' && cleanup.newImport
        ? cleanup.newImport
        : '';
      builder.addTextChange(cleanup.filePath, [{
        range: cleanup.range,
        newText,
        description: cleanup.cleanupType === 'delete'
          ? `Remove import: ${cleanup.unusedSymbols.join(', ')}`
          : `Clean import: ${cleanup.unusedSymbols.join(', ')}`
      }], cleanup.cleanupType === 'delete' ? TextEditOperationType.Delete : TextEditOperationType.Modify);
    }

    // 設定描述
    const { totalRemovals, importsCleanedUp } = preview.summary;
    builder.withDescription(
      `Removed ${totalRemovals} dead code items and cleaned ${importsCleanedUp} imports`
    );

    // 加入警告
    for (const warning of preview.warnings ?? []) {
      builder.addWarning(warning);
    }

    return builder.build();
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
    const fileOperationsMap = this.fileOperations.groupOperationsByFile(preview);

    // 逐檔案套用變更
    for (const [filePath, operations] of fileOperationsMap) {
      try {
        const result = await this.fileOperations.applyFileOperations(filePath, operations);
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
   * 產生刪除操作
   */
  private async generateRemovalOperations(
    items: readonly DeadCodeItem[]
  ): Promise<{ operations: RemovalOperation[]; warnings: string[] }> {
    const operations: RemovalOperation[] = [];
    const warnings: string[] = [];

    for (const item of items) {
      const content = await this.readFile(item.location.filePath);
      if (!content) {
        warnings.push(`跳過 ${item.name}：無法讀取檔案 ${item.location.filePath}`);
        continue;
      }

      // 擴展範圍以包含完整宣告（含 JSDoc 註解）
      const expandedRange = this.rangeExpander.expandRangeToFullDeclaration(
        content,
        item.location.range,
        item.type,
        item.name,
        item.location.filePath
      );

      const originalCode = this.fileOperations.extractCode(content, expandedRange);

      operations.push({
        filePath: item.location.filePath,
        range: expandedRange,
        originalCode,
        symbolName: item.name,
        symbolType: item.type
      });
    }

    return { operations, warnings };
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
   * 檔案不存在時快取 null，避免重複讀取
   */
  private async readFile(filePath: string): Promise<string | null> {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath)!;
    }

    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      const contentStr = typeof content === 'string' ? content : content.toString('utf-8');
      this.fileCache.set(filePath, contentStr);
      return contentStr;
    } catch (error) {
      // 檔案不存在時快取 null，避免重複讀取
      if (error instanceof Error && error.message.includes('ENOENT')) {
        this.fileCache.set(filePath, null);
      }
      return null;
    }
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
    this.fileCache.clear();
    this.importCleaner.clearCache();
    this.fileOperations.clearCache();
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
