/**
 * 統一的符號查找器
 * 整合 AST 分析和文字匹配，提供跨檔案符號查找能力
 */

import * as path from 'path';
import { SymbolType, type Symbol } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ScopedFindReferencesOptions, ScopedReference, ParserPlugin } from '@infrastructure/parser/interface.js';
import type { ModuleSpecifierResolver } from '@infrastructure/parser/types.js';
import { ScopedReferenceKind } from '@infrastructure/parser/interface.js';

import {
  SymbolReferenceType,
  ClassMemberType,
  type SymbolReference,
  type CallSite,
  type ClassMember,
  type SymbolDefinition,
  symbolToKey,
  serializeSymbolKey
} from './types.js';
import { TextMatcher } from './text-matcher.js';
import { CallSiteParser } from './call-site-parser.js';
import { createFileUtils, type FileUtils } from '../file-utils.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';

/** 批次並行讀取的檔案數量上限（避免 fd 耗盡） */
const BATCH_SIZE = 20;

interface NamedImportAlias {
  readonly moduleSpecifier: string;
  readonly localName: string;
}

/**
 * 符號查找器
 */
export class SymbolFinder {
  private readonly textMatcher: TextMatcher;
  private readonly callSiteParser: CallSiteParser;
  private readonly fileUtils: FileUtils;

  constructor(
    parserRegistry: ParserRegistry,
    fileSystem: IFileSystem
  ) {
    this.textMatcher = new TextMatcher();
    this.callSiteParser = new CallSiteParser();
    this.fileUtils = createFileUtils(fileSystem, parserRegistry);
  }

  /**
   * 查找符號定義
   */
  async findDefinition(filePath: string, symbolName: string): Promise<SymbolDefinition | null> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return null;
    }

    const parser = this.fileUtils.getParser(filePath);
    if (!parser) {
      return null;
    }

    try {
      const ast = await parser.parse(content, filePath);
      const symbols = await parser.extractSymbols(ast);

      const symbol = symbols.find(s => s.name === symbolName);
      if (!symbol) {
        return null;
      }

      // 優先使用 Parser 的 getDocumentation 方法（AST 精確解析）
      // 若 Parser 不支援或返回 null，fallback 到行號回掃邏輯
      let documentation: string | undefined;
      if (parser.getDocumentation) {
        const doc = parser.getDocumentation(
          content,
          symbol.name,
          symbol.type,
          symbol.location.range.start.line
        );
        documentation = doc?.rawText;
      }
      if (!documentation) {
        documentation = this.extractDocumentationByLineScanning(content, symbol);
      }

      return {
        symbol,
        signature: this.extractSignature(content, symbol),
        documentation
      };
    } catch (error) {
      diagnostics.warn('symbol-finder', 'AST_PARSE_FAILED', `Parse failed: ${error instanceof Error ? error.message : String(error)}`, filePath);
      return null;
    }
  }

  /**
   * 批次查找符號的引用（使用完整 Symbol 資訊，可區分同名符號）
   *
   * 時間複雜度：O(M x N)，M=檔案數，N=符號數
   * 優化點：M 次檔案讀取/解析（一次遍歷 M 檔查找 N 符號），
   * 而非 N x M 次（N 符號各遍歷 M 檔）
   *
   * @param symbols 要查找的符號陣列（包含完整的作用域資訊）
   * @param projectFiles 專案檔案列表
   * @returns Map<序列化的SymbolKey, 引用列表>，可使用 deserializeSymbolKey 還原
   *
   * @example
   * ```typescript
   * const results = await finder.findReferencesMultiple(symbols, files);
   * for (const symbol of symbols) {
   *   const key = serializeSymbolKey(symbolToKey(symbol));
   *   const refs = results.get(key) ?? [];
   * }
   * ```
   */
  async findReferencesMultiple(
    symbols: ReadonlyArray<Symbol>,
    projectFiles: readonly string[]
  ): Promise<Map<string, SymbolReference[]>> {
    const results = new Map<string, SymbolReference[]>();

    // 建立 symbolKey -> symbol 的對應，用於後續精確匹配
    const symbolKeyMap = new Map<string, Symbol>();
    for (const symbol of symbols) {
      const key = serializeSymbolKey(symbolToKey(symbol));
      results.set(key, []);
      symbolKeyMap.set(key, symbol);
    }

    // 同時建立 name -> symbols 的對應，用於快速過濾
    const symbolsByName = new Map<string, Symbol[]>();
    for (const symbol of symbols) {
      const existing = symbolsByName.get(symbol.name) || [];
      existing.push(symbol);
      symbolsByName.set(symbol.name, existing);
    }

    // 批次並行遍歷所有檔案（控制並發數避免 fd 耗盡）
    for (let i = 0; i < projectFiles.length; i += BATCH_SIZE) {
      const batch = projectFiles.slice(i, i + BATCH_SIZE);
      const fileContents = await Promise.all(
        batch.map(async (filePath) => {
          const content = await this.fileUtils.readFile(filePath);
          return { filePath, content };
        })
      );

      // 處理這批檔案的結果
      for (const { filePath, content } of fileContents) {
        if (!content) {
          continue;
        }

        const parser = this.fileUtils.getParser(filePath);
        const lines = content.split('\n');

        // 別名 import 感知：此檔以 `import { X as Y }` 形式匯入的符號，其真正使用點是本地
        // 別名 Y，而 findScopedReferences 只依原始名 X 掃描會完全對不上（C15：使用中的
        // export 被誤判 dead）。先建 匯入名 → 本地別名 的對應，稍後對每個目標符號補搜其別名。
        const aliasMap = this.collectNamedImportAliases(parser, content);

        // 對每個目標符號查找引用
        for (const [key, symbol] of symbolKeyMap) {
          // 對於 class method，需要使用 class name 作為 containerName
          // symbol.scope 是 method 的 function scope，其 parent 是 class scope
          let containerName: string | undefined;
          if (symbol.scope?.type === 'function' && symbol.scope?.parent?.type === 'class') {
            containerName = symbol.scope.parent.name;
          } else {
            containerName = symbol.scope?.name;
          }

          // 優先使用 findScopedReferences（精確匹配作用域）
          if (parser && typeof parser.findScopedReferences === 'function') {
            const scopedRefs = parser.findScopedReferences(content, symbol.name, { className: containerName });

            if (scopedRefs) {
              const refs = results.get(key);
              if (!refs) {continue;}
              for (const ref of scopedRefs) {
                refs.push(this.scopedRefToSymbolReference(ref, symbol.name, filePath, lines));
              }

              // 補搜本地別名的引用（C15）：以原始名綁定、但使用點為別名的引用會在上面漏掉。
              // 別名的 import binding token 本身回傳為 Import 類型，不會被誤算為 usage。
              const sameNameSymbols = symbolsByName.get(symbol.name) ?? [];
              const hasAmbiguousName = sameNameSymbols.length > 1;
              for (const alias of aliasMap.get(symbol.name) ?? []) {
                if (
                  hasAmbiguousName
                  && !this.importResolvesToSymbolFile(filePath, alias.moduleSpecifier, symbol.location.filePath)
                ) {
                  continue;
                }
                const aliasRefs = parser.findScopedReferences(content, alias.localName, { className: containerName });
                for (const ref of aliasRefs ?? []) {
                  refs.push(this.scopedRefToSymbolReference(ref, symbol.name, filePath, lines));
                }
              }
              continue;
            }
          }

          // Fallback：使用完整符號資訊查找
          if (parser) {
            try {
              const ast = await parser.parse(content, filePath);
              const references = await parser.findReferences(ast, symbol);

              const refs = results.get(key);
              if (!refs) {continue;}
              for (const ref of references) {
                const lineIndex = ref.location.range.start.line - 1;
                const context = lineIndex >= 0 && lineIndex < lines.length
                  ? lines[lineIndex]
                  : undefined;

                refs.push({
                  symbolName: symbol.name,
                  location: ref.location,
                  type: this.mapParserReferenceTypeString(ref.type),
                  context
                });
              }
            } catch (error) {
              // Parser 失敗，降級到文字匹配
              diagnostics.warn('symbol-finder', 'AST_PARSE_FAILED', `Parse failed, falling back to text match: ${error instanceof Error ? error.message : String(error)}`, filePath);
              const textRefs = this.textMatcher.findReferencesByText(filePath, content, symbol.name);
              const refs = results.get(key);
              if (refs) {refs.push(...textRefs);}
            }
          } else {
            // 無 Parser，降級到文字匹配
            diagnostics.warn('symbol-finder', 'ANALYSIS_DEGRADED', 'No parser available, falling back to text match', filePath);
            const textRefs = this.textMatcher.findReferencesByText(filePath, content, symbol.name);
            const refs = results.get(key);
            if (refs) {refs.push(...textRefs);}
          }
        }
      }
    }

    return results;
  }

  /**
   * 查找檔案中的符號引用
   */
  async findReferencesInFile(filePath: string, symbolName: string): Promise<SymbolReference[]> {
    return this.findReferencesInFileCore(filePath, symbolName, { filtered: false });
  }

  /**
   * 使用完整符號資訊查找檔案中的引用（作用域感知版本）
   *
   * 此方法會：
   * 1. 使用完整的符號資訊（包含類型、作用域等）進行精確匹配
   * 2. 過濾掉註解和字串中的符號
   * 3. 包含完整的程式碼上下文
   *
   * @param filePath 檔案路徑
   * @param symbol 完整的符號資訊
   * @returns 符號引用陣列
   */
  async findReferencesInFileWithSymbol(
    filePath: string,
    symbol: Symbol,
    moduleResolver?: ModuleSpecifierResolver
  ): Promise<SymbolReference[]> {
    return this.findReferencesInFileCore(filePath, symbol, { filtered: true, moduleResolver });
  }

  /**
   * 在多個檔案中查找符號引用（使用完整符號資訊）
   *
   * @param symbol 完整的符號資訊
   * @param projectFiles 專案檔案列表
   * @returns 所有找到的引用
   */
  async findReferencesWithSymbol(symbol: Symbol, projectFiles: readonly string[]): Promise<SymbolReference[]> {
    const allReferences: SymbolReference[] = [];

    // 批次並行處理（控制並發數避免 fd 耗盡）
    for (let i = 0; i < projectFiles.length; i += BATCH_SIZE) {
      const batch = projectFiles.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(filePath => this.findReferencesInFileWithSymbol(filePath, symbol))
      );
      for (const refs of batchResults) {
        allReferences.push(...refs);
      }
    }

    return allReferences;
  }

  // ===== 作用域感知的符號查找（優先使用 Parser 語義分析） =====

  /**
   * 使用 Parser 的 findScopedReferences 方法查找符號引用（作用域感知版本）
   *
   * 此方法優先使用 Parser 的語義分析能力來精確匹配符號，
   * 可以區分不同類別的同名方法。
   *
   * @example
   * ```typescript
   * // 區分 Dog.bark() 和 Car.bark()
   * const refs = await finder.findScopedReferencesInFile(
   *   'src/animals.ts',
   *   'bark',
   *   { className: 'Dog' }
   * );
   * ```
   *
   * @param filePath 檔案路徑
   * @param symbolName 符號名稱
   * @param options 作用域查找選項（可限定類別等）
   * @returns 符號引用陣列
   */
  async findScopedReferencesInFile(
    filePath: string,
    symbolName: string,
    options?: ScopedFindReferencesOptions
  ): Promise<SymbolReference[]> {
    return this.findReferencesInFileCore(filePath, symbolName, {
      scoped: true,
      scopeOptions: options,
      filtered: true
    });
  }

  /**
   * 在多個檔案中查找符號引用（作用域感知版本）
   *
   * @param symbolName 符號名稱
   * @param projectFiles 專案檔案列表
   * @param options 作用域查找選項
   * @returns 所有找到的引用
   */
  async findScopedReferences(
    symbolName: string,
    projectFiles: readonly string[],
    options?: ScopedFindReferencesOptions
  ): Promise<SymbolReference[]> {
    const allReferences: SymbolReference[] = [];

    // 批次並行處理（控制並發數避免 fd 耗盡）
    for (let i = 0; i < projectFiles.length; i += BATCH_SIZE) {
      const batch = projectFiles.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(filePath => this.findScopedReferencesInFile(filePath, symbolName, options))
      );
      for (const refs of batchResults) {
        allReferences.push(...refs);
      }
    }

    return allReferences;
  }

  /**
   * 查找函式的所有呼叫點
   */
  async findCallSites(
    functionName: string,
    projectFiles: readonly string[],
    options?: { readonly includeNewExpressions?: boolean }
  ): Promise<CallSite[]> {
    const results: CallSite[] = [];

    // 批次並行處理（控制並發數避免 fd 耗盡）
    for (let i = 0; i < projectFiles.length; i += BATCH_SIZE) {
      const batch = projectFiles.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(filePath => this.findCallSitesInFile(filePath, functionName, options))
      );
      for (const callSites of batchResults) {
        results.push(...callSites);
      }
    }

    return results;
  }

  /**
   * 查找檔案中的函式呼叫點
   *
   * @param options.includeNewExpressions - 是否一併掃描 `new X(...)` 建構子呼叫點；預設 false
   */
  async findCallSitesInFile(
    filePath: string,
    functionName: string,
    options?: { readonly includeNewExpressions?: boolean }
  ): Promise<CallSite[]> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return [];
    }

    const parser = this.fileUtils.getParser(filePath);
    if (!parser) {
      return [];
    }

    try {
      // 驗證檔案可解析（確保語法正確）
      await parser.parse(content, filePath);

      // 使用 CallSiteParser 查找呼叫點
      return this.callSiteParser.findCallSitesInFile(filePath, content, functionName, options);
    } catch (error) {
      diagnostics.warn('symbol-finder', 'AST_PARSE_FAILED', `Parse failed: ${error instanceof Error ? error.message : String(error)}`, filePath);
      return [];
    }
  }

  /**
   * 查找類別成員
   */
  async findClassMembers(filePath: string, className: string): Promise<ClassMember[]> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return [];
    }

    const parser = this.fileUtils.getParser(filePath);
    if (!parser) {
      return [];
    }

    try {
      const ast = await parser.parse(content, filePath);
      const symbols = await parser.extractSymbols(ast);

      // 查找類別
      const classSymbol = symbols.find(s => s.name === className && s.type === 'class');
      if (!classSymbol) {
        return [];
      }

      // 查找類別成員
      return symbols
        .filter(s => {
          // 檢查是否在類別範圍內
          const classRange = classSymbol.location.range;
          const symbolRange = s.location.range;

          return s.location.filePath === filePath
            && symbolRange.start.line >= classRange.start.line
            && symbolRange.end.line <= classRange.end.line
            && s.name !== className;
        })
        .map(s => ({
          name: s.name,
          type: this.symbolTypeToMemberType(s.type),
          location: s.location,
          modifiers: [...s.modifiers],
          valueType: undefined
        }));
    } catch (error) {
      diagnostics.warn('symbol-finder', 'AST_PARSE_FAILED', `Parse failed: ${error instanceof Error ? error.message : String(error)}`, filePath);
      return [];
    }
  }

  /**
   * 將 Parser 的 ScopedReference 轉換為 SymbolReference（含行內容 context）。
   * findReferencesMultiple 的原始名/別名查找與 findReferencesInFileCore 的作用域查找共用，
   * 避免同一套轉換邏輯散落多處（Single Source of Truth）。
   */
  private scopedRefToSymbolReference(
    ref: ScopedReference,
    symbolName: string,
    filePath: string,
    lines: string[]
  ): SymbolReference {
    const lineIndex = ref.location.range.start.line - 1;
    const context = lineIndex >= 0 && lineIndex < lines.length
      ? lines[lineIndex]
      : undefined;

    return {
      symbolName,
      location: { filePath, range: ref.location.range },
      type: this.scopedReferenceKindToType(ref.kind),
      context,
      containerName: ref.containerName,
      isMethodCall: ref.kind === ScopedReferenceKind.Call
    };
  }

  /**
   * 建立此檔「被匯入名稱 → 本地別名」的對應，只收錄別名與原名不同的 named import
   * （如 `import { ping as p }` → ping → [{ moduleSpecifier, localName: 'p' }]）。
   * 同一名稱可能有多個別名，故值為陣列。
   * 供 findReferencesMultiple 對別名使用點補搜，修正別名 import 使用中的 export 被漏抓
   * （C15）。Parser 不支援 getImportDeclarations 或解析失敗時回傳空 Map。
   */
  private collectNamedImportAliases(
    parser: ParserPlugin | null | undefined,
    content: string
  ): Map<string, NamedImportAlias[]> {
    const aliasMap = new Map<string, NamedImportAlias[]>();
    if (!parser?.getImportDeclarations) {
      return aliasMap;
    }

    const declarations = parser.getImportDeclarations(content);
    if (!declarations) {
      return aliasMap;
    }

    for (const declaration of declarations) {
      for (const named of declaration.namedImports ?? []) {
        if (!named.alias || named.alias === named.name) {
          continue;
        }
        const aliases = aliasMap.get(named.name) ?? [];
        const alias = {
          moduleSpecifier: declaration.moduleSpecifier,
          localName: named.alias
        };
        if (!aliases.some(existing =>
          existing.moduleSpecifier === alias.moduleSpecifier && existing.localName === alias.localName
        )) {
          aliases.push(alias);
        }
        aliasMap.set(named.name, aliases);
      }
    }

    return aliasMap;
  }

  /**
   * 判定 import 是否直接指向指定 symbol 所在檔案。
   * 只處理相對／絕對路徑；node module 與未注入 tsconfig path alias 的 bare specifier 不可安全推斷。
   * 同時容許 TypeScript 專案以 `.js` import 指向 `.ts` 檔，以及目錄 index 檔。
   */
  private importResolvesToSymbolFile(
    importingFilePath: string,
    moduleSpecifier: string,
    symbolFilePath: string
  ): boolean {
    if (!moduleSpecifier.startsWith('.') && !path.isAbsolute(moduleSpecifier)) {
      return false;
    }

    const importedPath = path.resolve(path.dirname(importingFilePath), moduleSpecifier);
    const targetPath = path.resolve(symbolFilePath);
    const withoutExtension = (filePath: string): string => filePath.replace(/\.[^/.]+$/, '');

    return withoutExtension(importedPath) === withoutExtension(targetPath)
      || withoutExtension(path.join(importedPath, 'index')) === withoutExtension(targetPath);
  }

  /**
   * 轉換 ScopedReferenceKind 到 SymbolReferenceType
   */
  private scopedReferenceKindToType(kind: ScopedReferenceKind): SymbolReferenceType {
    return scopedReferenceKindToType(kind);
  }

  /**
   * 將 Parser（ReferenceType 字串：'definition' | 'usage' | 'declaration' | 'import'）
   * 的引用類型字串轉換為 SymbolReferenceType
   * 供 findReferencesMultiple 的 fallback 分支與 convertParserRefToSymbolReference 共用，
   * 避免同一套映射邏輯散落兩處（Single Source of Truth）
   */
  private mapParserReferenceTypeString(type: string): SymbolReferenceType {
    switch (type) {
      case 'definition':
        return SymbolReferenceType.Definition;
      case 'import':
        return SymbolReferenceType.Import;
      default:
        return SymbolReferenceType.Usage;
    }
  }

  /**
   * 將 Parser 引用結果轉換為 SymbolReference
   *
   * @param ref Parser 返回的引用資訊
   * @param symbolName 符號名稱
   * @param filePath 檔案路徑
   * @param lines 檔案內容按行分割
   * @returns 標準化的 SymbolReference
   */
  private convertParserRefToSymbolReference(
    ref: { location: { filePath: string; range: { start: { line: number; column: number }; end: { line: number; column: number } } }; type: string },
    symbolName: string,
    _filePath: string,
    lines: string[]
  ): SymbolReference {
    const lineIndex = ref.location.range.start.line - 1;
    const context = lineIndex >= 0 && lineIndex < lines.length
      ? lines[lineIndex]
      : undefined;

    return {
      symbolName,
      location: ref.location,
      type: this.mapParserReferenceTypeString(ref.type),
      context
    };
  }

  /**
   * 內部共用：在單一檔案中查找引用的核心邏輯
   *
   * 統一處理：
   * 1. 讀取檔案內容
   * 2. 獲取 Parser
   * 3. AST 解析或降級到文字匹配
   * 4. 將結果轉換為 SymbolReference
   *
   * @param filePath 檔案路徑
   * @param symbolOrName 符號物件或符號名稱
   * @param options 選項
   * @returns 符號引用陣列
   */
  private async findReferencesInFileCore(
    filePath: string,
    symbolOrName: string | Symbol,
    options?: {
      /** 是否使用 findScopedReferences（作用域感知） */
      scoped?: boolean;
      /** findScopedReferences 選項 */
      scopeOptions?: ScopedFindReferencesOptions;
      /** 是否使用 filtered 文字匹配（過濾字串和註解） */
      filtered?: boolean;
      /** 跨 path alias 與多層 barrel re-export 的 specifier 曝露判定（由 rename 引擎注入） */
      moduleResolver?: ModuleSpecifierResolver;
    }
  ): Promise<SymbolReference[]> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return [];
    }

    const symbolName = typeof symbolOrName === 'string' ? symbolOrName : symbolOrName.name;
    const symbol = typeof symbolOrName === 'string' ? null : symbolOrName;
    const parser = this.fileUtils.getParser(filePath);
    const lines = content.split('\n');
    const useFiltered = options?.filtered ?? false;

    // 無 Parser 時降級到文字匹配
    if (!parser) {
      diagnostics.warn('symbol-finder', 'ANALYSIS_DEGRADED', 'No parser available, falling back to text match', filePath);
      return useFiltered
        ? this.textMatcher.findReferencesByTextFiltered(filePath, content, symbolName)
        : this.textMatcher.findReferencesByText(filePath, content, symbolName);
    }

    // 作用域感知模式：優先使用 findScopedReferences
    if (options?.scoped && typeof parser.findScopedReferences === 'function') {
      const scopedRefs = parser.findScopedReferences(content, symbolName, options.scopeOptions);

      if (scopedRefs) {
        return scopedRefs.map(ref => this.scopedRefToSymbolReference(ref, symbolName, filePath, lines));
      }
    }

    // AST 模式：使用 parser.findReferences
    try {
      const ast = await parser.parse(content, filePath);

      // 建立符號（若傳入的是字串則建立虛擬符號）
      const targetSymbol: Symbol = symbol ?? {
        name: symbolName,
        type: SymbolType.Variable,
        location: {
          filePath,
          range: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 1 }
          }
        },
        scope: undefined,
        modifiers: []
      };

      const references = await parser.findReferences(ast, targetSymbol, options?.moduleResolver);

      // 只保留目前檔案的引用：此方法語意為「查找單一檔案內的引用」，逐檔迭代時各檔獨立
      // 負責自己的引用。Language Service 在模組可解析時可能回傳跨檔引用，若不過濾會被
      // 呼叫端（rename 逐檔收集）錯誤歸屬到目前檔案，造成重複或張冠李戴。
      // 路徑正規化後比較（縱深防禦）：parser 引用路徑來自 LS（絕對），filePath 可能沿用呼叫端
      // 傳入的路徑形式，形式分歧（相對 vs 絕對）會讓同檔引用被誤篩掉（缺陷 N1／N2-a 的其中一環）。
      const resolvedFilePath = path.resolve(filePath);
      return references
        .filter(ref => path.resolve(ref.location.filePath) === resolvedFilePath)
        .map(ref => this.convertParserRefToSymbolReference(ref, symbolName, filePath, lines));
    } catch (error) {
      // Parser 失敗，降級到文字匹配
      diagnostics.warn('symbol-finder', 'AST_PARSE_FAILED', `Parse failed, falling back to text match: ${error instanceof Error ? error.message : String(error)}`, filePath);
      return useFiltered
        ? this.textMatcher.findReferencesByTextFiltered(filePath, content, symbolName)
        : this.textMatcher.findReferencesByText(filePath, content, symbolName);
    }
  }

  /**
   * 提取函式簽名
   */
  private extractSignature(content: string, symbol: Symbol): string | undefined {
    const lines = content.split('\n');
    const line = lines[symbol.location.range.start.line - 1];
    return line?.trim();
  }

  /**
   * 提取文件註解（行號回掃方式）
   * 這是 fallback 方法，當 Parser 不支援 getDocumentation 時使用
   */
  private extractDocumentationByLineScanning(content: string, symbol: Symbol): string | undefined {
    const lines = content.split('\n');
    const lineIndex = symbol.location.range.start.line - 2; // 前一行

    if (lineIndex < 0) {
      return undefined;
    }

    // 查找 JSDoc 或區塊註解
    const docLines: string[] = [];
    let i = lineIndex;

    while (i >= 0) {
      const line = lines[i].trim();

      if (line.endsWith('*/')) {
        // 找到註解結尾，開始收集
        docLines.unshift(line);
        i--;

        while (i >= 0 && !lines[i].trim().startsWith('/**') && !lines[i].trim().startsWith('/*')) {
          docLines.unshift(lines[i].trim());
          i--;
        }

        if (i >= 0) {
          docLines.unshift(lines[i].trim());
        }
        break;
      } else if (line.startsWith('//')) {
        // 單行註解
        docLines.unshift(line.substring(2).trim());
        i--;
      } else if (line === '') {
        i--;
      } else {
        break;
      }
    }

    return docLines.length > 0 ? docLines.join('\n') : undefined;
  }

  /**
   * 符號類型轉換為成員類型
   */
  private symbolTypeToMemberType(type: SymbolType): ClassMemberType {
    switch (type) {
      case 'function':
        return ClassMemberType.Method;
      case 'variable':
      case 'property':
        return ClassMemberType.Property;
      default:
        return ClassMemberType.Property;
    }
  }
}

/**
 * 轉換 ScopedReferenceKind 到 SymbolReferenceType。
 * - Definition（宣告點）→ Definition
 * - Write（賦值）是使用而非定義 → Usage
 * - Import → Import
 * - Call / Read → Usage
 */
export function scopedReferenceKindToType(kind: ScopedReferenceKind): SymbolReferenceType {
  switch (kind) {
    case ScopedReferenceKind.Definition:
      return SymbolReferenceType.Definition;
    case ScopedReferenceKind.Import:
      return SymbolReferenceType.Import;
    case ScopedReferenceKind.Write:
    case ScopedReferenceKind.Call:
    case ScopedReferenceKind.Read:
    default:
      return SymbolReferenceType.Usage;
  }
}

/**
 * 建立 SymbolFinder 實例
 */
export function createSymbolFinder(parserRegistry: ParserRegistry, fileSystem: IFileSystem): SymbolFinder {
  return new SymbolFinder(parserRegistry, fileSystem);
}
