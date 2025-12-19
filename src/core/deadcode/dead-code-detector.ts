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
 * 符號使用資訊
 */
interface SymbolUsageInfo {
  /** 使用引用列表 */
  usageRefs: Array<{
    location: { filePath: string; range: { start: { line: number } } };
    type: string;
  }>;
  /** 是否有 export 修飾符 */
  hasExport: boolean;
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

      // 批次查找所有符號的引用
      // 優化：M 次檔案讀取（一次遍歷 M 檔查找 N 符號），而非 N×M 次（N 符號各遍歷 M 檔）
      const allReferences = await symbolFinder.findReferencesMultiple(symbolNames, filePaths);

      // 建立 class → members 映射，用於判斷 class 是否有成員被使用
      const classMembersMap = this.buildClassMembersMap(symbolsToCheck);

      // 第一輪：分析每個符號的使用情況
      const symbolUsageMap = new Map<Symbol, SymbolUsageInfo>();

      for (const symbol of symbolsToCheck) {
        const references = allReferences.get(symbol.name) ?? [];

        // 分析引用：過濾掉定義位置本身
        const symbolLine = symbol.location.range.start.line;
        const symbolFile = symbol.location.filePath;

        const usageRefs = references.filter(ref => {
          // 排除定義位置
          // 注意：symbol 使用 0-indexed 行號，但文字匹配降級方法可能使用 1-indexed
          // 因此同時檢查精確匹配和 +1 偏移
          const refLine = ref.location.range.start.line;

          // 定義位置過濾：同檔案、同行（考慮 0/1-indexed 差異）
          // 由於 symbol 位置指向宣告起點，而 reference 位置指向識別符，
          // 我們不比對 column，只比對行號
          const isDefinitionLine = ref.location.filePath === symbolFile
            && (refLine === symbolLine || refLine === symbolLine + 1);

          if (isDefinitionLine) {
            return false;
          }
          // 只計算 usage 類型
          return ref.type === SymbolReferenceType.Usage;
        });

        const hasExport = symbol.modifiers.includes('export');
        symbolUsageMap.set(symbol, { usageRefs, hasExport });
      }

      // 第二輪：檢測每個符號是否為 dead code
      const deadItems: DeadCodeItem[] = [];

      for (const symbol of symbolsToCheck) {
        const { usageRefs, hasExport } = symbolUsageMap.get(symbol)!;

        // 判斷是否為 public class member（class 內的非 private/protected 成員）
        // 注意：class 本身不算 "class member"，只有 method/property 才算
        // - 方法：scope.type === 'function' && scope.parent.type === 'class'
        // - 屬性：scope.type === 'class' && symbol.type !== 'class'（屬性在 class scope 內，但符號類型不是 class）
        const isClassMember = (
          symbol.scope?.parent?.type === 'class'
          || (symbol.scope?.type === 'class' && symbol.type !== 'class')
        );
        const isPublicClassMember = isClassMember
          && !symbol.modifiers.includes('private')
          && !symbol.modifiers.includes('protected');

        // 判斷是否為 dead code
        if (usageRefs.length === 0) {
          // 沒有使用引用
          if (hasExport && !this.options.includeExports) {
            // export 的符號，可能被外部使用，跳過
            continue;
          }

          if (isPublicClassMember && !this.options.includePublicMembers) {
            // public class member，可能被外部使用，跳過
            continue;
          }

          // Bug #32 修復：檢查 class 是否有任何成員被使用
          // 如果 class 本身沒有直接引用，但其成員被使用，則 class 不應被標記為 dead code
          if (symbol.type === 'class') {
            const hasUsedMember = this.hasAnyUsedMember(symbol, classMembersMap, symbolUsageMap);
            if (hasUsedMember) {
              continue;
            }
          }

          const references = allReferences.get(symbol.name) ?? [];
          deadItems.push({
            name: symbol.name,
            type: symbol.type,
            location: symbol.location,
            reason: this.generateReason(symbol, hasExport, references.length)
          });
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
        if (this.options.verbose) {
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

    // 排除 interface/type 的屬性
    // Interface 屬性是型別定義的一部分，不應該被獨立檢測
    if (this.isInterfaceOrTypeProperty(symbol)) {
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
   * 判斷符號是否為 interface 或 type 的屬性
   * Interface/Type 的屬性是型別定義的一部分，不應被獨立檢測為 dead code
   */
  private isInterfaceOrTypeProperty(symbol: Symbol): boolean {
    // 檢查符號的 scope 是否為 interface
    // Interface 的屬性定義在 interface scope 內
    return symbol.scope?.type === 'interface';
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

  /**
   * 建立 class → members 映射
   * 用於判斷 class 是否有成員被使用
   */
  private buildClassMembersMap(symbols: readonly Symbol[]): Map<string, Symbol[]> {
    // 第一步：收集所有 class 符號（以 filePath:className 為 key）
    const classMap = symbols
      .filter(s => s.type === 'class')
      .reduce((map, s) => {
        map.set(`${s.location.filePath}:${s.name}`, []);
        return map;
      }, new Map<string, Symbol[]>());

    // 第二步：將成員分配到對應的 class
    symbols.forEach(symbol => {
      // 判斷 parent class 名稱
      // - 方法：scope.parent.type === 'class'
      // - 屬性：scope.type === 'class' && symbol.type !== 'class'
      const parentClassName = symbol.scope?.parent?.type === 'class'
        ? symbol.scope.parent.name
        : (symbol.scope?.type === 'class' && symbol.type !== 'class')
          ? symbol.scope.name
          : null;

      if (parentClassName) {
        const key = `${symbol.location.filePath}:${parentClassName}`;
        classMap.get(key)?.push(symbol);
      }
    });

    return classMap;
  }

  /**
   * 檢查 class 是否有任何成員被使用
   */
  private hasAnyUsedMember(
    classSymbol: Symbol,
    classMembersMap: Map<string, Symbol[]>,
    symbolUsageMap: Map<Symbol, SymbolUsageInfo>
  ): boolean {
    const key = `${classSymbol.location.filePath}:${classSymbol.name}`;
    const members = classMembersMap.get(key) ?? [];

    return members.some(member => {
      const usageInfo = symbolUsageMap.get(member);
      return usageInfo && usageInfo.usageRefs.length > 0;
    });
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
