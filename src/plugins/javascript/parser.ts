/**
 * JavaScript Parser 主要實作
 * 實作 ParserPlugin 介面
 */

import { extname } from 'node:path';
import { parse as babelParse } from '@babel/parser';

import {
  ParserPlugin,
  CodeEdit,
  Definition,
  Usage,
  ValidationResult,
  createValidationSuccess,
  createValidationFailure,
  createCodeEdit,
  createDefinition,
  createUsage,
  type ImportDeclaration,
  type FormattedSignature,
  type Documentation,
  type PatternInfo,
  type ScopedFindReferencesOptions,
  type ScopedReference
} from '@infrastructure/parser/index.js';
import type {
  AST,
  Symbol,
  Reference,
  Dependency,
  Position,
  Range
} from '@shared/types/index.js';
import {
  createAST,
  createASTMetadata,
  ReferenceType,
  SymbolType,
  JAVASCRIPT_SOURCE_EXTENSIONS
} from '@shared/types/index.js';
import { getErrorMessage } from '@shared/errors/index.js';
import {
  JavaScriptAST,
  JavaScriptParseOptions,
  DEFAULT_PARSE_OPTIONS,
  JavaScriptParseError,
  createJavaScriptASTNode,
  createParseError,
  isValidIdentifier,
  getPluginsForFile,
  mergeBabelPlugins
} from './types.js';
import {
  JAVASCRIPT_EXCLUDE_PATTERNS,
  matchesAnyPattern,
  validateParserInput,
  validateRenameInput,
  computeContentHash
} from '@plugins/shared/index.js';
import { createLRUCache, type MemoryCache } from '@infrastructure/cache/index.js';
import { PatternAnalyzer } from './pattern-analyzer.js';
import { ReferenceFinder } from './reference-finder.js';
import { DeclarationAnalyzer } from './declaration-analyzer.js';
import { JavaScriptSymbolExtractor } from './symbol-extractor.js';
import { JavaScriptDependencyAnalyzer } from './dependency-analyzer.js';
import { ReferenceResolver } from './reference-resolver.js';
import { JavaScriptNodeLocator, symbolTypeToDefinitionKind } from './node-locator.js';

/**
 * AST 快取項目
 * 用於儲存已解析的 AST 及其對應的內容雜湊
 */
interface ASTCacheItem {
  /** 已解析的 AST */
  ast: AST;
  /** 原始程式碼的雜湊值（用於驗證快取有效性） */
  contentHash: string;
}

/**
 * JavaScript Parser 實作
 */
export class JavaScriptParser implements ParserPlugin {
  public readonly name = 'javascript';
  public readonly version = '1.0.0';
  public readonly supportedExtensions = JAVASCRIPT_SOURCE_EXTENSIONS;
  public readonly supportedLanguages = ['javascript', 'jsx'] as const;

  private parseOptions: JavaScriptParseOptions;

  /** 設計模式分析器 */
  private readonly patternAnalyzer: PatternAnalyzer;
  /** 引用查找器 */
  private readonly referenceFinder: ReferenceFinder;
  /** 宣告分析器 */
  private readonly declarationAnalyzer: DeclarationAnalyzer;
  /** 符號提取器 */
  private readonly symbolExtractor: JavaScriptSymbolExtractor;
  /** 依賴分析器 */
  private readonly dependencyAnalyzer: JavaScriptDependencyAnalyzer;
  /** 符號引用解析器 */
  private readonly referenceResolver: ReferenceResolver;
  /** 節點位置查找器 */
  private readonly nodeLocator: JavaScriptNodeLocator;
  /** AST 快取（以 filePath 為 key，LRU 由 MemoryCache 自動處理） */
  private readonly astCache: MemoryCache<string, ASTCacheItem> = createLRUCache(100);

  constructor(parseOptions?: Partial<JavaScriptParseOptions>) {
    // 使用者透過 constructor 傳入的 plugins 與預設插件清單合併（去重），
    // 而非讓其中一方整組取代另一方，避免 `new JavaScriptParser({ plugins: ['flow'] })`
    // 這類設定丟失預設插件（或反過來被預設插件完全蓋過）
    const mergedPlugins = mergeBabelPlugins(
      DEFAULT_PARSE_OPTIONS.plugins ?? [],
      parseOptions?.plugins ?? []
    );
    this.parseOptions = { ...DEFAULT_PARSE_OPTIONS, ...parseOptions, plugins: mergedPlugins };
    this.patternAnalyzer = new PatternAnalyzer();
    this.referenceFinder = new ReferenceFinder();
    this.declarationAnalyzer = new DeclarationAnalyzer();
    this.symbolExtractor = new JavaScriptSymbolExtractor();
    this.dependencyAnalyzer = new JavaScriptDependencyAnalyzer();
    this.referenceResolver = new ReferenceResolver(this.referenceFinder);
    this.nodeLocator = new JavaScriptNodeLocator();
  }

  /**
   * 解析 JavaScript 程式碼
   */
  async parse(code: string, filePath: string): Promise<AST> {
    validateParserInput(code, filePath);

    // 檢查 AST 快取
    const contentHash = computeContentHash(code);
    const cached = this.astCache.get(filePath);
    if (cached && cached.contentHash === contentHash) {
      return cached.ast;
    }

    try {
      // 根據檔案類型調整解析選項
      const options = this.getParseOptionsForFile(filePath);

      // 使用 Babel parser 解析程式碼
      const babelAST = babelParse(code, options);

      // 建立我們的 AST 結構
      const rootNode = createJavaScriptASTNode(babelAST, filePath);
      const metadata = createASTMetadata(
        this.getLanguageFromFilePath(filePath),
        this.version,
        { babelOptions: options },
        Date.now(),
        0 // 會在 createAST 中計算
      );

      const baseAST = createAST(filePath, rootNode, metadata);
      const ast: JavaScriptAST = {
        ...baseAST,
        root: rootNode,
        babelAST,
        sourceCode: code
      };

      // 快取 AST
      this.astCache.set(filePath, { ast, contentHash });

      return ast;
    } catch (error) {
      if (error instanceof JavaScriptParseError) {
        throw error;
      }

      // 包裝 Babel 解析錯誤
      const errorMessage = getErrorMessage(error);
      throw createParseError(`解析失敗: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 提取符號
   * 委託給 JavaScriptSymbolExtractor
   */
  async extractSymbols(ast: AST): Promise<Symbol[]> {
    return await this.symbolExtractor.extractSymbols(ast);
  }

  /**
   * 查找符號引用
   * 委託給 ReferenceResolver
   */
  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    return this.referenceResolver.findReferences(ast, symbol);
  }

  /**
   * 提取依賴關係
   * 委託給 JavaScriptDependencyAnalyzer
   */
  async extractDependencies(ast: AST): Promise<Dependency[]> {
    const typedAst = ast as JavaScriptAST;
    return await this.dependencyAnalyzer.extractDependencies(typedAst);
  }

  /**
   * 重新命名符號
   */
  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    validateRenameInput(newName, 'JavaScript', isValidIdentifier);

    const typedAst = ast as JavaScriptAST;

    // 查找位置上的符號
    const symbol = await this.nodeLocator.findSymbolAtPosition(typedAst, position, this.symbolExtractor);
    if (!symbol) {
      throw new Error('在指定位置找不到符號');
    }

    // 查找所有引用
    const references = await this.findReferences(ast, symbol);

    // 建立編輯操作
    const edits: CodeEdit[] = [];

    for (const reference of references) {
      const edit = createCodeEdit(
        reference.location.filePath,
        reference.location.range,
        newName,
        'rename'
      );
      edits.push(edit);
    }

    return edits;
  }

  /**
   * 查找定義
   */
  async findDefinition(ast: AST, position: Position): Promise<Definition | null> {
    const typedAst = ast as JavaScriptAST;
    const symbol = await this.nodeLocator.findSymbolAtPosition(typedAst, position, this.symbolExtractor);

    if (symbol) {
      return createDefinition(symbol.location, symbolTypeToDefinitionKind(symbol.type));
    }

    return null;
  }

  /**
   * 查找使用位置
   */
  async findUsages(ast: AST, symbol: Symbol): Promise<Usage[]> {
    const references = await this.findReferences(ast, symbol);

    // 過濾出使用位置（排除定義）
    return references
      .filter(ref => ref.type === ReferenceType.Usage)
      .map(ref => createUsage(ref.location, 'reference'));
  }

  /**
   * 驗證插件狀態
   */
  async validate(): Promise<ValidationResult> {
    try {
      // 檢查 Babel 是否可用
      const testCode = 'const test = true;';
      babelParse(testCode, { sourceType: 'module' });

      return createValidationSuccess();
    } catch (error) {
      return createValidationFailure([{
        code: 'BABEL_UNAVAILABLE',
        message: `Babel 解析器不可用: ${getErrorMessage(error)}`,
        location: {
          filePath: '',
          range: {
            start: { line: 0, column: 0, offset: 0 },
            end: { line: 0, column: 0, offset: 0 }
          }
        }
      }]);
    }
  }

  /**
   * 清理資源
   */
  async dispose(): Promise<void> {
    this.nodeLocator.clearSymbolIndexCache();
    this.astCache.clear();
  }

  /**
   * 獲取 JavaScript 特定的排除模式
   * 包含基礎排除模式 + JavaScript 測試檔案
   */
  getDefaultExcludePatterns(): string[] {
    return [...JAVASCRIPT_EXCLUDE_PATTERNS];
  }

  /**
   * 判斷是否應該忽略特定檔案
   * JavaScript parser 會忽略測試檔案
   */
  shouldIgnoreFile(filePath: string): boolean {
    return matchesAnyPattern(filePath, JAVASCRIPT_EXCLUDE_PATTERNS);
  }

  /**
   * 判斷符號是否為抽象宣告
   * JavaScript 支援：class（ES6+）、function
   * JavaScript 沒有 interface、type、namespace 等概念
   * 排除實體：variable, constant
   */
  isAbstractDeclaration(symbol: Symbol): boolean {
    return symbol.type === SymbolType.Class || symbol.type === SymbolType.Function;
  }

  // 私有輔助方法

  private getParseOptionsForFile(filePath: string): JavaScriptParseOptions {
    const options = { ...this.parseOptions };
    // 以建構子已合併使用者設定後的 this.parseOptions.plugins 為基底，
    // 只在此基礎上依副檔名補上 jsx/typescript；不可略過使用者設定改用模組預設值
    options.plugins = getPluginsForFile(filePath, this.parseOptions.plugins);

    // 根據副檔名調整 sourceType（比照 node:path.extname 語意：以 basename 為基準取副檔名，
    // 避免把含點號的父目錄誤判成副檔名）
    const ext = extname(filePath);
    if (ext === '.mjs') {
      options.sourceType = 'module';
    } else if (ext === '.cjs') {
      options.sourceType = 'script';
    }

    return options;
  }

  private getLanguageFromFilePath(filePath: string): string {
    // 比照 node:path.extname 語意：以 basename 為基準取副檔名，
    // 避免把含點號的父目錄誤判成副檔名
    const ext = extname(filePath);
    return ext === '.jsx' ? 'jsx' : 'javascript';
  }

  /**
   * 清除特定檔案的符號索引快取
   * 委託給 JavaScriptNodeLocator
   */
  clearSymbolIndexCache(filePath?: string): void {
    this.nodeLocator.clearSymbolIndexCache(filePath);
  }

  /**
   * 判斷檔案是否為測試檔案
   */
  isTestFile(filePath: string): boolean {
    return /\.(test|spec)\.(js|jsx|mjs|cjs)$/.test(filePath) ||
           filePath.includes('/__tests__/') ||
           filePath.includes('/__mocks__/');
  }

  // ===== 委託給分析器的方法 =====

  identifyPatterns(code: string): PatternInfo[] | null {
    return this.patternAnalyzer.identifyPatterns(code);
  }

  findScopedReferences(
    code: string,
    symbolName: string,
    options?: ScopedFindReferencesOptions
  ): ScopedReference[] | null {
    return this.referenceFinder.findScopedReferences(code, symbolName, options);
  }

  getFullDeclarationRange(
    code: string,
    symbolName: string,
    symbolType: string,
    startLine: number
  ): Range | null {
    return this.declarationAnalyzer.getFullDeclarationRange(code, symbolName, symbolType, startLine);
  }

  /**
   * 計算多宣告子語句中，一組已知 dead 的宣告子協調後的刪除範圍
   * 委託給 DeclarationAnalyzer
   */
  computeDeclaratorGroupRemovalRanges(
    code: string,
    anchorSymbolName: string,
    startLine: number,
    deadNames: ReadonlySet<string>
  ): Range[] | null {
    return this.declarationAnalyzer.computeDeclaratorGroupRemovalRanges(code, anchorSymbolName, startLine, deadNames);
  }

  getImportDeclarations(code: string): ImportDeclaration[] | null {
    return this.declarationAnalyzer.getImportDeclarations(code);
  }

  formatSignature(code: string, functionName: string, line?: number): FormattedSignature | null {
    return this.declarationAnalyzer.formatSignature(code, functionName, line);
  }

  getDocumentation(
    code: string,
    symbolName: string,
    symbolType: string,
    line: number
  ): Documentation | null {
    return this.declarationAnalyzer.getDocumentation(code, symbolName, symbolType, line);
  }
}
