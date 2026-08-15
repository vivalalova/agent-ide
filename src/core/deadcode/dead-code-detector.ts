/**
 * Dead Code 檢測器
 * 使用 find-references 判斷未使用的符號
 */

import type { Symbol } from '@shared/types/symbol.js';
import { SymbolType, isImportedSymbol } from '@shared/types/symbol.js';
import { findNodesByType } from '@shared/types/ast.js';
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
import { ImportParser } from './import-parser.js';
import { makeImportBindingKey } from './import-binding-key.js';

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
  private readonly importParser: ImportParser;

  constructor(
    private readonly indexEngine: IndexEngine,
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem,
    options?: DeadCodeDetectorOptions
  ) {
    this.options = { ...DEFAULT_DEAD_CODE_OPTIONS, ...options };
    this.fileUtils = createFileUtils(fileSystem, parserRegistry);
    this.importParser = new ImportParser(parserRegistry);
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

        const rawUsageRefs = references.filter(ref => {
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

        // import binding 的 usage 判定必須限定在宣告所在檔案內：project-wide 搜尋以名稱
        // 比對，named/default import 的 local 名稱恰與來源檔的 export 宣告同名時，會把
        // 來源檔（或其他檔案同名 import）的引用誤算進來，讓本應「檔內完全未使用」的
        // binding 被誤判為存活。File-scoped 才是這類符號唯一正確的 usage 範圍。
        const usageRefs = isImportedSymbol(symbol)
          ? rawUsageRefs.filter(ref => ref.location.filePath === symbolFile)
          : rawUsageRefs;

        const hasExport = symbol.modifiers.includes('export');
        symbolUsageMap.set(symbol, { usageRefs, hasExport });
      }

      // import binding 候選（file-scoped usage 為 0）需要兩項額外確認才收為候選：
      // 1. 是否為可辨識的 ESM import 陳述式（confirmedEsmKeys）：CJS `require()`
      //    解構綁定也共用 isImported 標記，但 ImportParser（見 import-parser.ts）
      //    目前只認得 ESM `import` 語法，貿然回報會產生「有報但刪不掉」的空頭
      //    項目——generateRemovalOperations 排除 isImportBinding 項目、ImportCleaner
      //    也認不得 require 陳述式，兩邊都不會產生 edit。未被確認者維持舊有排除行為
      //    （不回報），是能力邊界而非漏檢（見本檔開頭任務說明的 CJS 涵蓋範圍）。
      // 2. 是否為 JSX classic transform 隱式依賴的 factory（jsxProtectedKeys）：檔案含
      //    JSX 元素時，`<div>` 這類寫法會被編譯為 `factory('div', ...)` 呼叫，
      //    factory 識別符（預設 React，可被 `/** @jsx h */` pragma 覆寫其 root
      //    identifier）在原始碼裡沒有任何顯式 identifier 引用可供 reference-finder
      //    找到，貿然回報並在 --apply 時砍掉會在 classic JSX runtime 下造成執行期
      //    ReferenceError（P2 confirmed）。刪碼工具寧可漏報也不可誤刪，故被保護的
      //    binding 一律跳過。
      const zeroUsageImportSymbols = symbolsToCheck.filter(symbol => {
        const info = symbolUsageMap.get(symbol);
        return isImportedSymbol(symbol) && !!info && info.usageRefs.length === 0;
      });
      const { confirmedEsmKeys: confirmedImportBindingKeys, jsxProtectedKeys } =
        await this.classifyImportBindingCandidates(zeroUsageImportSymbols);

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

          const isImportBinding = isImportedSymbol(symbol);
          if (isImportBinding) {
            const key = makeImportBindingKey(symbol.location.filePath, symbol.name);
            if (!confirmedImportBindingKeys.has(key)) {
              // 無法確認為可辨識的 ESM import 陳述式（如 CJS require 綁定），保守跳過：
              // 回報一個刪不掉的項目比漏報更誤導使用者。
              continue;
            }
            if (jsxProtectedKeys.has(key)) {
              // 檔案含 JSX 元素，且此 binding 正是 JSX classic transform 隱式依賴的
              // factory 識別符：保守跳過，避免 --apply 後留下 runtime ReferenceError。
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
              reason: this.generateReason(symbol, hasExport, references.length),
              ...(isImportBinding ? { isImportBinding: true } : {})
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

    // import specifier 的 local binding（named/default/namespace 皆同）不在此整批排除：
    // 「檔內完全未使用的 import binding」本身就是合法的 dead code 回報目標（來源符號在
    // 別處仍存活、僅本檔未使用）。是否列為候選改由下方 detect() 內的檔案範圍 usage
    // 判定 + classifyImportBindingCandidates() 的 ESM 語法確認／JSX factory 保護把關；
    // 產生的刪除 edit 一律委派
    // ImportCleaner（見 DeadCodeRemover.generateRemovalOperations 排除 isImportBinding
    // 項目、ImportCleaner.analyzeImportCleanups 的 knownDeadImportBindings 參數），避免
    // 本檢測器與 ImportCleaner 對同一段 import 陳述式各自產生一次刪除 TextEdit 而重疊
    // （J1c regression 的治本修法：單一編輯來源，非靠僥倖的誤判掩蓋）。

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
   * 對候選 import binding 做兩項分類：
   * 1. confirmedEsmKeys：是否對應到檔案內可辨識的 ESM import 陳述式（見下方細節）。
   * 2. jsxProtectedKeys：是否為檔案內 JSX classic transform 隱式依賴的 factory
   *    識別符（見下方細節），若是則即使 usage 為 0 也不得回報為 dead。
   *
   * 兩者共用同一次檔案內容讀取，避免對同一批候選檔案重複 I/O。
   *
   * @param candidates file-scoped usage 已確認為 0 的 import-bound 符號
   */
  private async classifyImportBindingCandidates(candidates: readonly Symbol[]): Promise<{
    confirmedEsmKeys: Set<string>;
    jsxProtectedKeys: Set<string>;
  }> {
    const confirmedEsmKeys = new Set<string>();
    const jsxProtectedKeys = new Set<string>();
    if (candidates.length === 0) {
      return { confirmedEsmKeys, jsxProtectedKeys };
    }

    const filePaths = Array.from(new Set(candidates.map(s => s.location.filePath)));
    const fileContents = await Promise.all(
      filePaths.map(async filePath => [filePath, await this.fileUtils.readFile(filePath)] as const)
    );
    const contentByFile = new Map(fileContents);

    // 每檔案的 JSX factory root 名稱：檔案含 JSX 元素時才有值，見 resolveJsxFactoryRoot()。
    const jsxFactoryRootByFile = new Map<string, string>();
    for (const [filePath, content] of contentByFile) {
      if (!content) {
        continue;
      }
      if (await this.fileContainsJsx(content, filePath)) {
        jsxFactoryRootByFile.set(filePath, this.resolveJsxFactoryRoot(content));
      }
    }

    for (const symbol of candidates) {
      const filePath = symbol.location.filePath;
      const content = contentByFile.get(filePath);
      if (!content) {
        continue;
      }

      // 單一來源：直接重用 ImportCleaner 也使用的同一個 ImportParser
      // （import-parser.ts），禁止另抄一份 import 語法判斷。CJS
      // `const { x } = require(...)` 綁定同樣帶 isImported 標記，但 ImportParser
      // 只解析 ESM `import` 語法，對這類綁定一律回傳「未確認」，使其維持不回報
      // （能力邊界，非誤判）。
      const statements = this.importParser.parseImportStatements(content, filePath);
      const isEsmImportBinding = statements.some(stmt =>
        stmt.symbols.some(s => (s.alias ?? s.name) === symbol.name)
      );
      if (isEsmImportBinding) {
        confirmedEsmKeys.add(makeImportBindingKey(filePath, symbol.name));
      }

      const jsxFactoryRoot = jsxFactoryRootByFile.get(filePath);
      if (jsxFactoryRoot && jsxFactoryRoot === symbol.name) {
        jsxProtectedKeys.add(makeImportBindingKey(filePath, symbol.name));
      }
    }

    return { confirmedEsmKeys, jsxProtectedKeys };
  }

  /**
   * 判斷檔案是否含有 JSX 元素（JSXElement／JSXFragment），或無法確認（保守視為可能有）。
   *
   * 重用該檔案對應 Parser 已提供的通用 `parse()` + parser-agnostic 的
   * `findNodesByType`（`@shared/types/ast.js`），不引入 Babel/TS 專屬型別，
   * 也不新增 Parser 能力（不觸碰各語言 plugins 下的 parser.ts）。
   *
   * 沒有對應 Parser（無法判斷是否為 JS/JSX 語言）時視為不含 JSX——非 JS 系語言本就
   * 不可能有 JSX 語法。若有對應 Parser 但重新解析目前內容失敗（例如兩次讀檔之間
   * 檔案被修改成暫時性語法錯誤），則反向保守：回傳 true（視為「可能含 JSX」），
   * 而非放行刪除——這與本功能「寧可漏報也不可誤刪」的方向一致，不可倒反。
   */
  private async fileContainsJsx(content: string, filePath: string): Promise<boolean> {
    const parser = this.fileUtils.getParser(filePath);
    if (!parser) {
      return false;
    }
    try {
      const ast = await parser.parse(content, filePath);
      // Babel（JSXElement/JSXFragment，自閉合同屬 JSXElement）與 TypeScript
      // （JsxElement/JsxSelfClosingElement/JsxFragment）節點命名不同；TS 路徑
      // 目前不產生 import-binding 候選、不會走到這裡，但本判斷是 parser-agnostic
      // 消費端，不得臆測單一 parser 的命名慣例。
      const jsxNodeTypes = ['JSXElement', 'JSXFragment', 'JsxElement', 'JsxSelfClosingElement', 'JsxFragment'];
      return jsxNodeTypes.some((type) => findNodesByType(ast, type).length > 0);
    } catch {
      return true;
    }
  }

  /**
   * 解析檔案的 JSX factory root identifier：
   * - 有 `@jsx <expr>` pragma comment（Babel/TS 慣例，如 `/** @jsx h *\/`）→ 取
   *   其開頭識別符（`Foo.createElement` 取 `Foo`，正是實際 import 進來的 local
   *   binding 名稱）。
   * - 無 pragma → 預設 classic JSX transform 的 factory 識別符 `React`。
   */
  private resolveJsxFactoryRoot(content: string): string {
    const pragmaMatch = content.match(/@jsx\s+([A-Za-z_$][\w$]*)/);
    return pragmaMatch ? pragmaMatch[1] : 'React';
  }

  /**
   * 產生原因說明
   */
  private generateReason(symbol: Symbol, hasExport: boolean, totalRefs: number): string {
    const typeLabel = this.getTypeLabel(symbol.type);

    if (isImportedSymbol(symbol)) {
      return `已 import 的 '${symbol.name}' 在檔案內未使用`;
    }

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
