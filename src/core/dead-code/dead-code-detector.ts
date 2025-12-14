/**
 * Dead Code 檢測器
 * 使用 find-references 判斷未使用的符號
 */

import type { Symbol, SymbolType } from '@shared/types/symbol.js';
import type { IndexEngine } from '@core/indexing/index.js';
import { createSymbolFinder, SymbolReferenceType, type SymbolReference } from '@core/shared/symbol-finder.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type {
  DeadCodeItem,
  DeadCodeDetectorOptions,
  DeadCodeDetectionResult,
  DeadCodeStats
} from './types.js';
import { DEFAULT_DEAD_CODE_OPTIONS } from './types.js';

/** 符號引用快取 */
interface SymbolReferencesCache {
  readonly references: readonly SymbolReference[];
}

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

      // 過濾要檢測的符號類型（排除已知排除模式）
      const targetSymbols = allSymbols.filter(s =>
        this.options.symbolTypes.includes(s.type) && !this.shouldExclude(s)
      );

      // 批量收集所有符號的引用（一次掃描所有檔案）
      const referencesCache = await this.batchFindReferences(targetSymbols, filePaths);

      // 並行分析每個符號
      const analysisResults = await Promise.all(
        targetSymbols.map(symbol => this.analyzeSingleSymbol(symbol, referencesCache))
      );

      // 過濾出 dead code
      const deadItems = analysisResults.filter((item): item is DeadCodeItem => item !== null);

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
   * 批量查找所有符號的引用
   * 一次掃描所有檔案，收集所有符號名稱的引用，避免重複讀取檔案
   */
  private async batchFindReferences(
    symbols: readonly Symbol[],
    filePaths: readonly string[]
  ): Promise<Map<string, SymbolReferencesCache>> {
    const symbolFinder = createSymbolFinder(this.parserRegistry, this.fileSystem);
    const cache = new Map<string, SymbolReferencesCache>();

    // 取得所有需要查找的符號名稱（去重）
    const symbolNames = [...new Set(symbols.map(s => s.name))];

    // 分批並行查找，避免記憶體溢出
    const BATCH_SIZE = 10;
    for (let i = 0; i < symbolNames.length; i += BATCH_SIZE) {
      const batch = symbolNames.slice(i, i + BATCH_SIZE);

      // 並行查找當前批次的符號引用
      const results = await Promise.all(
        batch.map(async (name) => {
          const references = await symbolFinder.findReferences(name, filePaths);
          return { name, references };
        })
      );

      // 建立快取
      for (const { name, references } of results) {
        cache.set(name, { references });
      }
    }

    return cache;
  }

  /**
   * 分析單一符號是否為 dead code
   */
  private async analyzeSingleSymbol(
    symbol: Symbol,
    referencesCache: Map<string, SymbolReferencesCache>
  ): Promise<DeadCodeItem | null> {
    // 從快取取得引用
    const cached = referencesCache.get(symbol.name);
    const references = cached?.references ?? [];

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
        return null;
      }

      const confidence = this.calculateConfidence(symbol, references.length, hasExport);

      if (confidence >= this.options.minConfidence) {
        return {
          name: symbol.name,
          type: symbol.type,
          location: symbol.location,
          confidence,
          reason: this.generateReason(symbol, hasExport, references.length)
        };
      }
    }

    return null;
  }

/**
   * 收集所有符號
   * 優先從 IndexEngine 取得已快取的符號，避免重複解析
   */
  private async collectAllSymbols(filePaths: readonly string[]): Promise<{ symbols: Symbol[]; skippedFiles: number }> {
    const allSymbols: Symbol[] = [];
    let skippedFiles = 0;

    // 分批並行處理，避免記憶體溢出
    const BATCH_SIZE = 20;
    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
      const batch = filePaths.slice(i, i + BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (filePath) => {
          try {
            // 優先從 IndexEngine 取得已索引的符號
            const cachedSymbols = await this.indexEngine.getFileSymbols(filePath);
            if (cachedSymbols.length > 0) {
              return { symbols: [...cachedSymbols], skipped: false };
            }

            // Fallback: 手動解析
            const parser = this.getParser(filePath);
            if (!parser) {
              return { symbols: [], skipped: false };
            }

            const content = await this.readFile(filePath);
            if (!content) {
              return { symbols: [], skipped: false };
            }

            const ast = await parser.parse(content, filePath);
            const symbols = await parser.extractSymbols(ast);
            return { symbols, skipped: false };
          } catch (error) {
            // 非測試環境記錄警告
            if (process.env.NODE_ENV !== 'test') {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.warn(`  跳過檔案 ${filePath}: ${errorMessage}`);
            }
            return { symbols: [], skipped: true };
          }
        })
      );

      // 彙整結果
      for (const result of results) {
        allSymbols.push(...result.symbols);
        if (result.skipped) {
          skippedFiles++;
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
