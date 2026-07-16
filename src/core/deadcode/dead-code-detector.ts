/**
 * Dead Code 檢測器
 * 使用 find-references 判斷未使用的符號
 */

import type { Symbol } from '@shared/types/symbol.js';
import { SymbolType } from '@shared/types/symbol.js';
import { getErrorMessage } from '@shared/errors/index.js';
import type { IndexEngine } from '@core/foundations/indexing/index.js';
import {
  createSymbolFinder,
  SymbolReferenceType,
  symbolToKey,
  serializeSymbolKey
} from '@core/foundations/symbol-finder/index.js';
import { FileUtils, createFileUtils } from '@core/foundations/index.js';
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
 * SymbolType 對應的中文標籤
 * 使用 Record<SymbolType, string> 確保型別安全
 */
const SYMBOL_TYPE_LABELS: Record<SymbolType, string> = {
  [SymbolType.Function]: '函式',
  [SymbolType.Class]: '類別',
  [SymbolType.Variable]: '變數',
  [SymbolType.Interface]: '介面',
  [SymbolType.Type]: '型別',
  [SymbolType.Property]: '屬性',
  [SymbolType.Enum]: '列舉',
  [SymbolType.Constant]: '常數',
  [SymbolType.Protocol]: '協定',
  [SymbolType.Struct]: '結構',
  [SymbolType.Module]: '模組',
  [SymbolType.Namespace]: '命名空間'
};

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
  private readonly fileUtils: FileUtils;

  constructor(
    private readonly indexEngine: IndexEngine,
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem,
    options?: DeadCodeDetectorOptions
  ) {
    this.options = { ...DEFAULT_DEAD_CODE_OPTIONS, ...options };
    this.fileUtils = createFileUtils(fileSystem, parserRegistry);
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
      const { symbols: allSymbols, skippedFiles, warnings } = await this.collectAllSymbols(filePaths);

      // 過濾要檢測的符號類型
      const targetSymbols = allSymbols.filter(s =>
        this.options.symbolTypes.includes(s.type)
      );

      // 建立 SymbolFinder
      const symbolFinder = createSymbolFinder(this.parserRegistry, this.fileSystem);

      // 過濾要檢測的符號（排除不需要的）
      const symbolsToCheck = targetSymbols.filter(s => !this.shouldExclude(s));

      // 批次查找所有符號的引用（使用完整 Symbol 資訊，可區分同名符號）
      // 優化：M 次檔案讀取（一次遍歷 M 檔查找 N 符號），而非 N×M 次（N 符號各遍歷 M 檔）
      const allReferences = await symbolFinder.findReferencesMultiple(symbolsToCheck, filePaths);

      // 建立 class → members 映射，用於判斷 class 是否有成員被使用
      const classMembersMap = this.buildClassMembersMap(symbolsToCheck);

      // 第一輪：分析每個符號的使用情況
      const symbolUsageMap = new Map<Symbol, SymbolUsageInfo>();

      for (const symbol of symbolsToCheck) {
        // 使用 SymbolKey 作為鍵，確保同名符號（如 Dog.bark vs Car.bark）不會合併
        const symbolKey = serializeSymbolKey(symbolToKey(symbol));
        const references = allReferences.get(symbolKey) ?? [];

        // 分析引用：過濾掉定義位置本身
        const symbolLine = symbol.location.range.start.line;
        const symbolColumn = symbol.location.range.start.column;
        const symbolFile = symbol.location.filePath;

        const usageRefs = references.filter(ref => {
          // 排除定義位置本身：symbol.location.range.start 是宣告識別符節點自身的精確位置
          // （TS 經 tsPositionToPosition、JS 經 babelLocationToPosition 轉換，line/column
          // 皆為 1-based），scoped 引用查找到的宣告識別符出現位置與其完全相同。
          // 故用「同檔案 + line + column 完全相等」精確比對，只排除宣告識別符自身；
          // 不可用鄰近行的模糊容差（會把緊鄰宣告下一行的真實使用誤排除為「定義行」）。
          const refPos = ref.location.range.start;
          const isDeclarationIdentifier = ref.location.filePath === symbolFile
            && refPos.line === symbolLine
            && refPos.column === symbolColumn;

          if (isDeclarationIdentifier) {
            return false;
          }
          // 計算 usage 與寫入（Definition，如重新賦值）類型：只被寫入從未被讀取的變數
          // （如 `let x = 1; x = 2;`）雖然實質上是 dead code，但刪除範圍目前只涵蓋宣告，
          // 不包含孤兒賦值語句；保守判定為非 dead（有寫入代表符號仍「活著」），避免刪除
          // 宣告後留下語法上仍有效、但語意孤兒的賦值語句（D2）。Import/Export 類型的
          // specifier 引用不算 usage/寫入信號（D4：避免「只被 import 從未使用」的符號
          // 永遠判定為存活）。
          return ref.type === SymbolReferenceType.Usage || ref.type === SymbolReferenceType.Definition;
        });

        const hasExport = symbol.modifiers.includes('export');
        symbolUsageMap.set(symbol, { usageRefs, hasExport });
      }

      // 第二輪：檢測每個符號是否為 dead code（先收集候選，再剔除已被父 class 涵蓋的成員）
      const candidateDead: Array<{ symbol: Symbol; item: DeadCodeItem }> = [];

      for (const symbol of symbolsToCheck) {
        const usageInfo = symbolUsageMap.get(symbol);
        if (!usageInfo) {
          continue;
        }
        const { usageRefs, hasExport } = usageInfo;

        // 判斷是否為 public class member（class 內的非 private/protected 成員）
        const isPublicClassMember = this.isClassMember(symbol)
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

          const deadSymbolKey = serializeSymbolKey(symbolToKey(symbol));
          const references = allReferences.get(deadSymbolKey) ?? [];
          candidateDead.push({
            symbol,
            item: {
              name: symbol.name,
              type: symbol.type,
              location: symbol.location,
              reason: this.generateReason(symbol, hasExport, references.length)
            }
          });
        }
      }

      // 父 class 整顆 dead 時，刪 class 已涵蓋成員；若再對成員各產一次 TextEdit 會重疊 fail
      // （--include-public-members 會把 public 成員一併納入，最易觸發）
      const deadClassKeys = new Set(
        candidateDead
          .filter(({ symbol }) => symbol.type === SymbolType.Class)
          .map(({ symbol }) => `${symbol.location.filePath}:${symbol.name}`)
      );
      const deadItems: DeadCodeItem[] = candidateDead
        .filter(({ symbol }) => {
          const parentClassName = this.getParentClassName(symbol);
          if (
            parentClassName &&
            deadClassKeys.has(`${symbol.location.filePath}:${parentClassName}`)
          ) {
            return false;
          }
          return true;
        })
        .map(({ item }) => item);

      // 計算統計
      const stats = this.calculateStats(targetSymbols.length, deadItems, startTime, skippedFiles);

      return {
        success: true,
        items: deadItems,
        stats,
        warnings: warnings.length > 0 ? warnings : undefined
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
        error: getErrorMessage(error)
      };
    }
  }

/**
   * 收集所有符號（優先使用 IndexEngine 快取）
   */
  private async collectAllSymbols(filePaths: readonly string[]): Promise<{
    symbols: Symbol[];
    skippedFiles: number;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    // 平行處理所有檔案，收集符號或記錄錯誤
    const results = await Promise.all(
      filePaths.map(async (filePath): Promise<{ symbols: Symbol[]; error: boolean; warning?: string }> => {
        try {
          // 優先從 IndexEngine 的 symbolIndex 讀取（已在 indexProject 時建立）
          const cachedSymbols = await this.indexEngine.getFileSymbols(filePath);

          if (cachedSymbols.length > 0) {
            return { symbols: [...cachedSymbols], error: false };
          }

          // Fallback：重新解析（用於 IndexEngine 無資料時）
          const parser = this.fileUtils.getParser(filePath);
          if (!parser) {
            return { symbols: [], error: false };
          }

          const content = await this.fileUtils.readFile(filePath);
          if (!content) {
            return { symbols: [], error: false };
          }

          const ast = await parser.parse(content, filePath);
          const symbols = await parser.extractSymbols(ast);
          return { symbols, error: false };
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          return {
            symbols: [],
            error: true,
            warning: `跳過檔案 ${filePath}: ${errorMessage}`
          };
        }
      })
    );

    // 聚合結果
    const allSymbols = results.flatMap(r => r.symbols);
    const skippedFiles = results.filter(r => r.error).length;

    // 收集警告訊息（僅在 verbose 模式下記錄）
    if (this.options.verbose) {
      for (const result of results) {
        if (result.warning) {
          warnings.push(result.warning);
        }
      }
    }

    return { symbols: allSymbols, skippedFiles, warnings };
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

    // 排除函式內部的變數和參數
    // 這些是局部變數，不應被 deadcode 檢測（可能是函式參數、arrow function 回呼參數、
    // for 迴圈變數等）。它們的 scope.type 會是 'function' 或 'block'
    if (this.isFunctionLocalVariable(symbol)) {
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
   * 判斷符號是否為函式內部的變數或參數
   * 函式參數、arrow function 回呼參數、for 迴圈變數等不應被 deadcode 檢測
   *
   * 注意：此方法遍歷 scope 鏈確認變數是否在 function scope 內，
   * 避免誤過濾模組層級的 block scope 變數（如 if 區塊內的變數）
   */
  private isFunctionLocalVariable(symbol: Symbol): boolean {
    // 只處理變數類型
    if (symbol.type !== 'variable' && symbol.type !== 'constant') {
      return false;
    }

    // 遍歷 scope 鏈，確認是否有 function scope
    // 只有在 scope 鏈中找到 function 時，才認定為函式內部變數
    let scope = symbol.scope;
    while (scope) {
      if (scope.type === 'function') {
        return true;
      }
      // 遇到 module, namespace, global, class 則停止，表示不在函式內
      if (scope.type === 'module' || scope.type === 'namespace' ||
          scope.type === 'global' || scope.type === 'class') {
        return false;
      }
      scope = scope.parent;
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
    return SYMBOL_TYPE_LABELS[type] || type;
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
    // 使用 reduce 聲明式計算各類型數量
    const byType = deadItems.reduce<Record<string, number>>(
      (acc, item) => ({ ...acc, [item.type]: (acc[item.type] || 0) + 1 }),
      {}
    );

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
   * 建立 class → members 映射
   * 用於判斷 class 是否有成員被使用
   */
  private buildClassMembersMap(symbols: readonly Symbol[]): Map<string, Symbol[]> {
    const classMap = new Map<string, Symbol[]>();

    // 單次遍歷：同時建立 class 鍵和分配成員
    for (const symbol of symbols) {
      if (symbol.type === 'class') {
        // 初始化 class 鍵（確保即使無成員也有對應項）
        const key = `${symbol.location.filePath}:${symbol.name}`;
        if (!classMap.has(key)) {
          classMap.set(key, []);
        }
      }

      // 分配成員到對應 class
      const parentClassName = this.getParentClassName(symbol);
      if (parentClassName) {
        const key = `${symbol.location.filePath}:${parentClassName}`;
        const members = classMap.get(key);
        if (members) {
          members.push(symbol);
        } else {
          // class 可能在後面才遍歷到，先建立空陣列
          classMap.set(key, [symbol]);
        }
      }
    }

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

  /**
   * 判斷符號是否為 class member（方法或屬性）
   * - 方法：scope.parent.type === 'class'
   * - 屬性：scope.type === 'class' && symbol.type !== 'class'
   *
   * 注意：class 本身不算 "class member"，只有 method/property 才算
   */
  private isClassMember(symbol: Symbol): boolean {
    return (
      symbol.scope?.parent?.type === 'class'
      || (symbol.scope?.type === 'class' && symbol.type !== SymbolType.Class)
    );
  }

  /**
   * 取得 class member 的父 class 名稱
   * @returns 父 class 名稱，若不是 class member 則返回 null
   */
  private getParentClassName(symbol: Symbol): string | null {
    if (symbol.scope?.parent?.type === 'class') {
      return symbol.scope.parent.name ?? null;
    }
    if (symbol.scope?.type === 'class' && symbol.type !== SymbolType.Class) {
      return symbol.scope.name ?? null;
    }
    return null;
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
