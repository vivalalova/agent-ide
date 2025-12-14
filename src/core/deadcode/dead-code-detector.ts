/**
 * Dead Code 檢測器
 * 使用 find-references 判斷未使用的符號
 */

import type { Symbol, SymbolType } from '@shared/types/symbol.js';
import type { IndexEngine } from '@core/shared/indexing/index.js';
import { createSymbolFinder, SymbolReferenceType } from '@core/shared/symbol-finder.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type {
  DeadCodeItem,
  DeadCodeDetectorOptions,
  DeadCodeDetectionResult,
  DeadCodeStats
} from './types.js';
import { DEFAULT_DEAD_CODE_OPTIONS } from './types.js';

/**
 * Dead Code 檢測器
 */
export class DeadCodeDetector {
  private readonly options: Required<DeadCodeDetectorOptions>;

  constructor(
    private readonly indexEngine: IndexEngine,
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem,
    options?: DeadCodeDetectorOptions
  ) {
    this.options = { ...DEFAULT_DEAD_CODE_OPTIONS, ...options };
  }

  /**
   * 執行 Dead Code 檢測
   */
  async detect(): Promise<DeadCodeDetectionResult> {
    const startTime = Date.now();

    try {
      // 取得所有已索引檔案
      const indexedFiles = this.indexEngine.getAllIndexedFiles();
      const filePaths = indexedFiles.map(f => f.filePath);

      // 收集所有符號
      const { symbols: allSymbols, skippedFiles } = await this.collectAllSymbols(filePaths);

      // 過濾要檢測的符號類型
      const targetSymbols = allSymbols.filter(s =>
        this.options.symbolTypes.includes(s.type)
      );

      // 建立 SymbolFinder
      const symbolFinder = createSymbolFinder(this.parserRegistry, this.fileSystem);

      // 過濾要檢測的符號（排除不需要的）
      const symbolsToCheck = targetSymbols.filter(s => !this.shouldExclude(s));

      // 收集所有符號名稱
      const symbolNames = new Set(symbolsToCheck.map(s => s.name));

      // 批次查找所有符號的引用（O(M) 而非 O(N × M)）
      const allReferences = await symbolFinder.findReferencesMultiple(symbolNames, filePaths);

      // 檢測每個符號
      const deadItems: DeadCodeItem[] = [];

      for (const symbol of symbolsToCheck) {
        const references = allReferences.get(symbol.name) ?? [];

        // 分析引用：過濾掉定義位置本身
        const symbolLine = symbol.location.range.start.line;
        const symbolFile = symbol.location.filePath;

        const usageRefs = references.filter(ref => {
          // 排除定義位置（同檔案，±1 行容錯）
          const isSameLocation = ref.location.filePath === symbolFile
            && Math.abs(ref.location.range.start.line - symbolLine) <= 1;
          if (isSameLocation) {
            return false;
          }
          // 只計算 usage 類型
          return ref.type === SymbolReferenceType.Usage;
        });

        const hasExport = symbol.modifiers.includes('export');

        // 判斷是否為 dead code
        if (usageRefs.length === 0) {
          // 沒有使用引用
          if (hasExport && !this.options.includeExports) {
            // export 的符號，可能被外部使用，跳過
            continue;
          }

          const confidence = this.calculateConfidence(symbol, references.length, hasExport);

          if (confidence >= this.options.minConfidence) {
            deadItems.push({
              name: symbol.name,
              type: symbol.type,
              location: symbol.location,
              confidence,
              reason: this.generateReason(symbol, hasExport, references.length)
            });
          }
        }
      }

      // 計算統計
      const stats = this.calculateStats(targetSymbols.length, deadItems, startTime, skippedFiles);

      return {
        success: true,
        items: deadItems,
        stats
      };
    } catch (error) {
      return {
        success: false,
        items: [],
        stats: {
          totalSymbols: 0,
          deadCodeCount: 0,
          byType: {},
          filesAffected: 0,
          scanTime: Date.now() - startTime,
          skippedFiles: 0
        },
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

/**
   * 收集所有符號
   */
  private async collectAllSymbols(filePaths: readonly string[]): Promise<{ symbols: Symbol[]; skippedFiles: number }> {
    const allSymbols: Symbol[] = [];
    let skippedFiles = 0;

    for (const filePath of filePaths) {
      const parser = this.getParser(filePath);
      if (!parser) {continue;}

      try {
        const content = await this.readFile(filePath);
        if (!content) {continue;}

        const ast = await parser.parse(content, filePath);
        const symbols = await parser.extractSymbols(ast);
        allSymbols.push(...symbols);
      } catch (error) {
        skippedFiles++;
        // 非測試環境記錄警告
        if (process.env.NODE_ENV !== 'test') {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`⚠️  跳過檔案 ${filePath}: ${errorMessage}`);
        }
      }
    }

    return { symbols: allSymbols, skippedFiles };
  }

  /**
   * 判斷是否應排除
   */
  private shouldExclude(symbol: Symbol): boolean {
    // 排除建構子
    if (symbol.name === 'constructor') {
      return true;
    }

    // 排除名稱模式
    for (const pattern of this.options.excludePatterns) {
      if (symbol.name === pattern || symbol.name.toLowerCase() === pattern.toLowerCase()) {
        return true;
      }
      // 支援 glob 模式
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (regex.test(symbol.name)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 計算信心程度
   */
  private calculateConfidence(symbol: Symbol, totalRefs: number, hasExport: boolean): number {
    let confidence = 1.0;

    // 有定義引用但無使用引用，信心較高
    if (totalRefs > 0) {
      confidence = 0.95;
    }

    // export 的符號信心較低（可能被外部使用）
    if (hasExport) {
      confidence *= 0.7;
    }

    // 私有符號信心較高
    if (symbol.modifiers.includes('private')) {
      confidence = Math.min(confidence * 1.1, 1.0);
    }

    return Math.round(confidence * 100) / 100;
  }

  /**
   * 產生原因說明
   */
  private generateReason(symbol: Symbol, hasExport: boolean, totalRefs: number): string {
    const typeLabel = this.getTypeLabel(symbol.type);

    if (totalRefs === 0) {
      return `${typeLabel} '${symbol.name}' 沒有任何引用`;
    }

    if (hasExport) {
      return `${typeLabel} '${symbol.name}' 已 export 但在專案內無使用引用`;
    }

    return `${typeLabel} '${symbol.name}' 只有定義，無使用引用`;
  }

  /**
   * 取得類型標籤
   */
  private getTypeLabel(type: SymbolType): string {
    const labels: Record<string, string> = {
      function: '函式',
      class: '類別',
      variable: '變數',
      interface: '介面',
      type: '型別',
      property: '屬性',
      method: '方法',
      enum: '列舉',
      constant: '常數'
    };
    return labels[type] || type;
  }

  /**
   * 計算統計
   */
  private calculateStats(
    totalSymbols: number,
    deadItems: readonly DeadCodeItem[],
    startTime: number,
    skippedFiles: number
  ): DeadCodeStats {
    const byType: Record<string, number> = {};

    for (const item of deadItems) {
      byType[item.type] = (byType[item.type] || 0) + 1;
    }

    const filesAffected = new Set(deadItems.map(item => item.location.filePath)).size;

    return {
      totalSymbols,
      deadCodeCount: deadItems.length,
      byType,
      filesAffected,
      scanTime: Date.now() - startTime,
      skippedFiles
    };
  }

  /**
   * 取得 Parser
   */
  private getParser(filePath: string) {
    const extension = this.getFileExtension(filePath);
    return this.parserRegistry.getParser(extension);
  }

  /**
   * 取得副檔名
   */
  private getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot >= 0 ? filePath.substring(lastDot) : '';
  }

  /**
   * 讀取檔案
   */
  private async readFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      return typeof content === 'string' ? content : content.toString('utf-8');
    } catch {
      return null;
    }
  }
}

/**
 * 建立 DeadCodeDetector 實例
 */
export function createDeadCodeDetector(
  indexEngine: IndexEngine,
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem,
  options?: DeadCodeDetectorOptions
): DeadCodeDetector {
  return new DeadCodeDetector(indexEngine, parserRegistry, fileSystem, options);
}
