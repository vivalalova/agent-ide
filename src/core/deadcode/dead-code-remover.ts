/**
 * Dead Code 刪除器
 * 負責刪除未使用的程式碼並清理相關 import
 */

import { minimatch } from 'minimatch';
import { matchesPathFragment } from '@shared/path-pattern.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { Changeset } from '@infrastructure/changeset/index.js';
import { SymbolType } from '@shared/types/symbol.js';
import { createChangesetBuilder, ChangesetCommand, TextEditOperationType } from '@infrastructure/changeset/index.js';
import { getErrorMessage } from '@shared/errors/index.js';
import type {
  DeadCodeItem,
  DeadCodeRemovalOptions,
  DeadCodeRemovalPreview,
  DeadCodeRemovalResult,
  RemovalOperation,
  ImportCleanupOperation,
  RemovalSummary,
  UpdatedFile,
  ResolvedDeadCodeRemovalOptions
} from './types.js';
import { DEFAULT_REMOVAL_OPTIONS } from './types.js';
import { RangeExpander } from './range-expander.js';
import { ImportCleaner } from './import-cleaner.js';
import { FileOperationsHandler } from './file-operations.js';
import { DeadCodeCacheService, createDeadCodeCacheService } from './shared-cache.js';

/**
 * Dead Code 刪除器
 */
export class DeadCodeRemover {
  private readonly options: ResolvedDeadCodeRemovalOptions;
  private readonly rangeExpander: RangeExpander;
  private readonly importCleaner: ImportCleaner;
  private readonly fileOperations: FileOperationsHandler;
  private readonly cacheService: DeadCodeCacheService;

  constructor(
    private readonly fileSystem: IFileSystem,
    parserRegistry: ParserRegistry,
    options?: DeadCodeRemovalOptions,
    cacheService?: DeadCodeCacheService
  ) {
    this.options = { ...DEFAULT_REMOVAL_OPTIONS, ...options };
    this.cacheService = cacheService ?? createDeadCodeCacheService();
    this.rangeExpander = new RangeExpander(parserRegistry);
    this.importCleaner = new ImportCleaner(
      fileSystem,
      parserRegistry,
      this.cacheService,
      this.options.pathAliases,
      this.options.baseUrl
    );
    this.fileOperations = new FileOperationsHandler(fileSystem, this.cacheService);
  }

  /**
   * 預覽刪除操作
   *
   * @param deadCodeItems 待刪除的死代碼項目
   * @param projectFiles 專案全部檔案路徑（可選）。提供時 import 清理會掃描這些 consumer
   *   檔案，清掉「引用了被刪 export 符號、但自身沒有任何刪除項」的殘留 import specifier
   *   （N3）；未提供時退回只掃描有刪除項的檔案（向後相容）。
   */
  async preview(
    deadCodeItems: readonly DeadCodeItem[],
    projectFiles?: readonly string[]
  ): Promise<DeadCodeRemovalPreview> {
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
        const importResult = await this.importCleaner.analyzeImportCleanups(removals, projectFiles);
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
        errors: [getErrorMessage(error)]
      };
    }
  }

  /**
   * 生成死代碼刪除的 Changeset
   * @param deadCodeItems 待刪除的死代碼項目
   * @returns Changeset 變更集
   */
  async generateChangeset(
    deadCodeItems: readonly DeadCodeItem[],
    projectFiles?: readonly string[]
  ): Promise<Changeset> {
    const builder = createChangesetBuilder()
      .forCommand(ChangesetCommand.Deadcode);

    // 使用現有的 preview 邏輯收集變更
    const preview = await this.preview(deadCodeItems, projectFiles);

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

    // 附上結構化統計資料（權威來源，供 CLI 層讀取，避免對 description/edits 字串反推）
    builder.withMetadata({ ...preview.summary });

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
        errors.push(`檔案 ${filePath} 處理失敗: ${getErrorMessage(error)}`);
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
   *
   * 同一 VariableStatement 中若有多個 dead 宣告子（如 `let a, b;` 兩者皆 dead），
   * 逐項獨立呼叫 expandRangeToFullDeclaration 各自算出的手術範圍會互相重疊，--apply 後
   * 造成語法毀損（D5）。先把可能同屬一語句的 variable/constant dead 項目分組（同檔案、
   * 同行），交給 RangeExpander.expandDeclaratorGroupRanges 一次協調出彼此不重疊的範圍，
   * 而非逐一獨立計算；非多宣告子語句或其他符號類型維持既有逐項處理路徑不變。
   */
  private async generateRemovalOperations(
    items: readonly DeadCodeItem[]
  ): Promise<{ operations: RemovalOperation[]; warnings: string[] }> {
    const operations: RemovalOperation[] = [];
    const warnings: string[] = [];

    const { groups, singles } = this.partitionMultiDeclaratorGroups(items);

    for (const group of groups) {
      const content = await this.readFile(group.filePath);
      if (!content) {
        warnings.push(`跳過 ${group.items.map(i => i.name).join(', ')}：無法讀取檔案 ${group.filePath}`);
        continue;
      }

      const anchor = group.items[0];
      const deadNames = new Set(group.items.map(i => i.name));
      const coordinatedRanges = this.rangeExpander.expandDeclaratorGroupRanges(
        content,
        anchor.location.range.start.line,
        anchor.name,
        deadNames,
        anchor.type,
        group.filePath
      );

      if (coordinatedRanges) {
        // Parser 確認為同一多宣告子語句：改用協調後、彼此不重疊的範圍產生操作
        for (const range of coordinatedRanges) {
          operations.push({
            filePath: group.filePath,
            range,
            originalCode: this.fileOperations.extractCode(content, range),
            symbolName: group.items.map(i => i.name).join(', '),
            symbolType: anchor.type
          });
        }
        continue;
      }

      // Parser 不支援跨宣告子協調，或非多宣告子語句：fallback 至既有逐項獨立處理
      for (const item of group.items) {
        operations.push(this.buildIndividualRemovalOperation(item, content));
      }
    }

    for (const item of singles) {
      const content = await this.readFile(item.location.filePath);
      if (!content) {
        warnings.push(`跳過 ${item.name}：無法讀取檔案 ${item.location.filePath}`);
        continue;
      }

      operations.push(this.buildIndividualRemovalOperation(item, content));
    }

    return { operations, warnings };
  }

  /**
   * 產生單一 dead code 項目的刪除操作（既有逐項獨立處理路徑）
   */
  private buildIndividualRemovalOperation(item: DeadCodeItem, content: string): RemovalOperation {
    // 擴展範圍以包含完整宣告（含 JSDoc 註解）
    const expandedRange = this.rangeExpander.expandRangeToFullDeclaration(
      content,
      item.location.range,
      item.type,
      item.name,
      item.location.filePath
    );

    return {
      filePath: item.location.filePath,
      range: expandedRange,
      originalCode: this.fileOperations.extractCode(content, expandedRange),
      symbolName: item.name,
      symbolType: item.type
    };
  }

  /**
   * 把可能同屬一個多宣告子 VariableStatement 的 dead 項目分組：
   * 同檔案、同行、且皆為 variable/constant 類型的多個 dead 項目視為候選群組
   * （單一多宣告子語句的多個宣告子在原始碼中必然同行）；其餘（含只有單一候選的行）
   * 維持逐項獨立處理，交由呼叫端走既有路徑。
   */
  private partitionMultiDeclaratorGroups(
    items: readonly DeadCodeItem[]
  ): { groups: Array<{ filePath: string; items: DeadCodeItem[] }>; singles: DeadCodeItem[] } {
    const candidateGroups = new Map<string, DeadCodeItem[]>();
    const singles: DeadCodeItem[] = [];

    for (const item of items) {
      if (item.type !== SymbolType.Variable && item.type !== SymbolType.Constant) {
        singles.push(item);
        continue;
      }

      const key = `${item.location.filePath}:${item.location.range.start.line}`;
      const bucket = candidateGroups.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        candidateGroups.set(key, [item]);
      }
    }

    const groups: Array<{ filePath: string; items: DeadCodeItem[] }> = [];
    for (const bucket of candidateGroups.values()) {
      if (bucket.length > 1) {
        groups.push({ filePath: bucket[0].location.filePath, items: bucket });
      } else {
        singles.push(bucket[0]);
      }
    }

    return { groups, singles };
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
   * 讀取檔案（使用共用快取）
   * 檔案不存在時快取 null，避免重複讀取
   */
  private async readFile(filePath: string): Promise<string | null> {
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
      // 檔案不存在時快取 null，避免重複讀取
      if (error instanceof Error && error.message.includes('ENOENT')) {
        this.cacheService.setFile(filePath, null);
      }
      return null;
    }
  }

  /**
   * 檢查檔案路徑是否匹配排除模式
   * 支援 glob 模式（如 *.test.ts、**\/__tests__/**）和簡單字串匹配
   */
  private matchesExcludePattern(filePath: string, pattern: string): boolean {
    // 如果 pattern 包含 glob 特殊字符，使用 minimatch（此處刻意保留 matchBase:
    // true，讓 '*.spec.ts' 這類無目錄前綴的樣式也能對到巢狀路徑的檔名部分；
    // shared/path-pattern.ts 的共用 matcher 不提供 matchBase 語意，兩者用途不同，
    // 不適合在此處直接替換，見該檔頭部關於此例外的說明）
    if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
      return minimatch(filePath, pattern, { dot: true, matchBase: true });
    }
    // 純路徑片段（含 '/'）：可能是精確檔案路徑（葉節點，如 'src/legacy/api.ts'）
    // 也可能是目錄／路徑前綴（如 'src/legacy/'），委派共用的 matchesPathFragment
    // 同時涵蓋兩種情況，避免子字串誤傷同前綴的不同名稱（如 'src/dist' 誤殺
    // 'src/distance/'，見 P2-A regression：葉節點檔案路徑排除永不命中）。
    if (pattern.includes('/')) {
      return matchesPathFragment(filePath, pattern);
    }
    // 否則使用簡單字串包含匹配（向後相容，允許任意檔名片段的子字串排除，
    // 如 '.mock.' 排除任何檔名含此片段的檔案）
    return filePath.includes(pattern);
  }

  /**
   * 清除快取
   */
  clearCache(): void {
    this.cacheService.clear();
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
