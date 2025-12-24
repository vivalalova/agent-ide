/**
 * TypeScript Parser 主要實作
 * 實作 ParserPlugin 介面
 */

import * as ts from 'typescript';
import {
  ParserPlugin,
  CodeEdit,
  Definition,
  Usage,
  ValidationResult,
  DefinitionKind,
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
  SymbolType
} from '@shared/types/index.js';
import {
  TypeScriptAST,
  TypeScriptSymbol,
  DEFAULT_COMPILER_OPTIONS,
  TypeScriptParseError,
  createTypeScriptASTNode,
  createParseError,
  tsPositionToPosition,
  positionToTsPosition,
  tsNodeToRange,
  isValidIdentifier
} from './types.js';
import { TypeScriptSymbolExtractor, createSymbolExtractor } from '@plugins/typescript/symbol-extractor.js';
import { TypeScriptDependencyAnalyzer, createDependencyAnalyzer } from '@plugins/typescript/dependency-analyzer.js';
import { MemoryMonitor, type Disposable } from '@plugins/shared/utils/memory-monitor.js';
import {
  TYPESCRIPT_EXCLUDE_PATTERNS,
  matchesAnyPattern,
  validateParserInput,
  validateRenameInput
} from '@plugins/shared/index.js';
import { createLanguageServiceManager, type ILanguageServiceManager } from './language-service.js';
import { createScopeAnalyzer, type ScopeAnalyzer } from './scope-analyzer.js';
import { createDeclarationAnalyzer, type DeclarationAnalyzer } from './declaration-analyzer.js';
import { createPatternAnalyzer, type PatternAnalyzer } from './pattern-analyzer.js';
import { createReferenceFinder, type ReferenceFinder } from './reference-finder.js';

/**
 * TypeScript Parser 實作
 */
export class TypeScriptParser implements ParserPlugin, Disposable {
  public readonly name = 'typescript';
  public readonly version = '1.0.0';
  public readonly supportedExtensions = ['.ts', '.tsx', '.d.ts'] as const;
  public readonly supportedLanguages = ['typescript', 'tsx'] as const;

  private symbolExtractor: TypeScriptSymbolExtractor;
  private dependencyAnalyzer: TypeScriptDependencyAnalyzer;
  private compilerOptions: ts.CompilerOptions;
  private languageServiceManager: ILanguageServiceManager;
  private scopeAnalyzer: ScopeAnalyzer;
  private declarationAnalyzer: DeclarationAnalyzer;
  private patternAnalyzer: PatternAnalyzer;
  private referenceFinder: ReferenceFinder;

  constructor(compilerOptions?: ts.CompilerOptions) {
    this.compilerOptions = { ...DEFAULT_COMPILER_OPTIONS, ...compilerOptions };
    this.symbolExtractor = createSymbolExtractor();
    this.dependencyAnalyzer = createDependencyAnalyzer();
    this.languageServiceManager = createLanguageServiceManager(this.compilerOptions);
    this.scopeAnalyzer = createScopeAnalyzer();
    this.declarationAnalyzer = createDeclarationAnalyzer(this.compilerOptions);
    this.patternAnalyzer = createPatternAnalyzer(this.compilerOptions);
    this.referenceFinder = createReferenceFinder(this.compilerOptions);

    // 註冊到記憶體監控器
    MemoryMonitor.getInstance().register(this);
  }

  /**
   * 解析 TypeScript 程式碼
   */
  async parse(code: string, filePath: string): Promise<AST> {
    validateParserInput(code, filePath);

    let program: ts.Program | null = null;
    try {
      // 使用 TypeScript Compiler API 解析程式碼
      const sourceFile = ts.createSourceFile(
        filePath,
        code,
        this.compilerOptions.target || ts.ScriptTarget.ES2020,
        true, // setParentNodes
        this.getScriptKind(filePath)
      );

      // 檢查語法錯誤 - 使用 TypeScript Program 來檢查語法錯誤
      program = ts.createProgram([filePath], this.compilerOptions, {
        getSourceFile: (fileName) => fileName === filePath ? sourceFile : undefined,
        writeFile: () => {},
        getCurrentDirectory: () => process.cwd(),
        getDirectories: () => [],
        fileExists: () => true,
        readFile: () => code,
        getCanonicalFileName: (fileName) => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options)
      });

      // 獲取語法診斷，但不拋出錯誤（TypeScript 能從語法錯誤中恢復）
      const syntacticDiagnostics = program.getSyntacticDiagnostics(sourceFile);

      // 建立我們的 AST 結構
      const rootNode = createTypeScriptASTNode(sourceFile, sourceFile);
      const metadata = createASTMetadata(
        this.getLanguageFromFilePath(filePath),
        this.version,
        { compilerOptions: this.compilerOptions },
        Date.now(),
        0 // 會在 createAST 中計算
      );

      const baseAST = createAST(filePath, rootNode, metadata);
      const ast: TypeScriptAST = {
        ...baseAST,
        root: rootNode,
        tsSourceFile: sourceFile,
        diagnostics: [...syntacticDiagnostics]
      };

      // 立即清理 Program 以避免記憶體洩漏
      program = null;

      return ast;
    } catch (error) {
      // 確保在錯誤情況下也清理 Program
      program = null;

      if (error instanceof TypeScriptParseError) {
        throw error;
      }
      throw createParseError(`解析失敗: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // 最終清理，確保 Program 被釋放
      if (program) {
        program = null;
      }

      // 觸發垃圾回收（如果可用）
      if (typeof global !== 'undefined' && 'gc' in global && typeof global.gc === 'function') {
        global.gc();
      }
    }
  }

  /**
   * 提取符號
   */
  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const typedAst = ast as TypeScriptAST;
    return await this.symbolExtractor.extractSymbols(typedAst);
  }

  /**
   * 查找符號引用
   */
  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    const typedAst = ast as TypeScriptAST;
    const typedSymbol = symbol as TypeScriptSymbol;

    // 確保 Language Service 已初始化
    this.languageServiceManager.ensureInitialized(typedAst.tsSourceFile);

    if (!this.languageServiceManager.languageService) {
      // 如果無法使用 Language Service，回退到原始方法
      return this.findReferencesBasic(ast, symbol);
    }

    const fileName = typedAst.tsSourceFile.fileName;

    // 取得符號位置
    const symbolPosition = this.languageServiceManager.getSymbolPosition(
      typedSymbol,
      typedAst.tsSourceFile,
      (node) => this.scopeAnalyzer.getIdentifierFromSymbolNode(node) ?? undefined
    );
    if (symbolPosition === undefined) {
      return [];
    }

    // 使用 Language Service 查找引用
    const referencesResult = this.languageServiceManager.languageService.findReferences(fileName, symbolPosition);

    if (!referencesResult) {
      return [];
    }

    const references: Reference[] = [];

    for (const refSymbol of referencesResult) {
      for (const ref of refSymbol.references) {
        const sourceFile = this.languageServiceManager.getSourceFileFromFileName(ref.fileName);
        if (!sourceFile) { continue; }

        const range: Range = {
          start: tsPositionToPosition(sourceFile, ref.textSpan.start),
          end: tsPositionToPosition(sourceFile, ref.textSpan.start + ref.textSpan.length)
        };

        const refType: ReferenceType = ref.isDefinition
          ? ReferenceType.Definition
          : ReferenceType.Usage;

        references.push({
          symbol,
          location: {
            filePath: ref.fileName,
            range
          },
          type: refType
        });
      }
    }

    return references;
  }

  /**
   * 基本的符號引用查找（回退方法）
   * 使用 AST 遍歷，過濾字串和註解中的符號
   */
  private async findReferencesBasic(ast: AST, symbol: Symbol): Promise<Reference[]> {
    const typedAst = ast as TypeScriptAST;
    const typedSymbol = symbol as TypeScriptSymbol;

    const references: Reference[] = [];
    const symbolName = typedSymbol.name;

    // 獲取符號的標識符節點
    const symbolIdentifier = this.scopeAnalyzer.getIdentifierFromSymbolNode(typedSymbol.tsNode);
    if (!symbolIdentifier) {
      return references;
    }

    // 使用 TypeScript 原生的節點遍歷，收集所有標識符
    const collectIdentifiers = (node: ts.Node): void => {
      // 過濾：跳過字串字面值
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return; // 不處理子節點
      }

      // 過濾：跳過模板字串
      if (ts.isTemplateExpression(node)) {
        // 只處理模板表達式中的插值部分，跳過字串部分
        node.templateSpans.forEach(span => {
          collectIdentifiers(span.expression);
        });
        return;
      }

      if (ts.isIdentifier(node) && node.text === symbolName) {
        // 檢查這個標識符是否真的引用了我們的符號
        if (this.scopeAnalyzer.isReferenceToSymbol(node, typedSymbol)) {
          const location = {
            filePath: typedAst.tsSourceFile.fileName,
            range: tsNodeToRange(node, typedAst.tsSourceFile)
          };

          const referenceType = this.scopeAnalyzer.getReferenceType(
            node,
            typedSymbol,
            this.isDeclarationNode.bind(this)
          );

          references.push({
            symbol,
            location,
            type: referenceType
          });
        }
      }

      // 遞歸處理所有子節點
      ts.forEachChild(node, collectIdentifiers);
    };

    // 從 SourceFile 開始遍歷
    collectIdentifiers(typedAst.tsSourceFile);
    return references;
  }

  /**
   * 提取依賴關係
   */
  async extractDependencies(ast: AST): Promise<Dependency[]> {
    const typedAst = ast as TypeScriptAST;
    return await this.dependencyAnalyzer.extractDependencies(typedAst);
  }

  /**
   * 重新命名符號
   */
  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    validateRenameInput(newName, 'TypeScript', isValidIdentifier);

    const typedAst = ast as TypeScriptAST;
    const tsPosition = positionToTsPosition(typedAst.tsSourceFile, position);

    // 查找位置上的節點
    const node = this.findNodeAtPosition(typedAst.tsSourceFile, tsPosition);
    if (!node) {
      throw new Error('在指定位置找不到符號');
    }

    // 確保節點是標識符或可重新命名的宣告
    let targetIdentifier: ts.Identifier | null = null;

    if (ts.isIdentifier(node)) {
      targetIdentifier = node;
    } else if (this.isRenameableNode(node)) {
      targetIdentifier = this.scopeAnalyzer.getIdentifierFromSymbolNode(node);
    }

    if (!targetIdentifier) {
      throw new Error('該位置的符號不支援重新命名');
    }

    // 驗證位置確實在標識符上
    const identifierStart = targetIdentifier.getStart(typedAst.tsSourceFile);
    const identifierEnd = targetIdentifier.getEnd();

    if (tsPosition < identifierStart || tsPosition >= identifierEnd) {
      throw new Error('指定位置不在有效的符號標識符上');
    }

    // 查找所有引用
    const symbol = await this.findSymbolAtPosition(typedAst, position);
    if (!symbol) {
      throw new Error('無法找到符號定義');
    }

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
   * 提取函式重構
   */
  async extractFunction(_ast: AST, _selection: Range): Promise<CodeEdit[]> {
    // 這是一個複雜的重構操作，目前提供基本實作
    throw new Error('提取函式重構尚未實作');
  }

  /**
   * 查找定義
   */
  async findDefinition(ast: AST, position: Position): Promise<Definition | null> {
    const typedAst = ast as TypeScriptAST;
    const tsPosition = positionToTsPosition(typedAst.tsSourceFile, position);

    const node = this.findNodeAtPosition(typedAst.tsSourceFile, tsPosition);
    if (!node) {
      return null;
    }

    // 檢查節點是否有效
    if (!node.kind) {
      return null;
    }

    // 如果當前節點本身就是定義，返回它
    if (this.isDefinitionNode(node)) {
      const location = {
        filePath: typedAst.tsSourceFile.fileName,
        range: tsNodeToRange(node, typedAst.tsSourceFile)
      };

      return createDefinition(location, this.getDefinitionKind(node));
    }

    // 如果是標識符，查找它的定義
    if (ts.isIdentifier(node)) {
      const name = node.text;
      const symbols = await this.extractSymbols(ast);

      // 查找匹配名稱的符號定義
      for (const symbol of symbols) {
        if (symbol.name === name) {
          // 直接返回符號的定義位置（不需要檢查 isReferenceToSymbol，因為我們是在查找定義）
          return createDefinition(symbol.location, this.symbolTypeToDefinitionKind(symbol.type));
        }
      }
    }

    // 查找符號的定義
    const symbol = await this.findSymbolAtPosition(typedAst, position);
    if (symbol) {
      return createDefinition(symbol.location, this.symbolTypeToDefinitionKind(symbol.type));
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
      .map(ref => createUsage(ref.location, this.getReferenceUsageKind(ref)));
  }

  /**
   * 驗證插件狀態
   */
  async validate(): Promise<ValidationResult> {
    try {
      // 檢查 TypeScript 編譯器是否可用
      const version = ts.version;
      if (!version) {
        return createValidationFailure([{
          code: 'TS_UNAVAILABLE',
          message: 'TypeScript 編譯器不可用',
          location: { filePath: '', range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } } }
        }]);
      }

      // 檢查編譯器選項
      const diagnostics = ts.getConfigFileParsingDiagnostics({
        options: this.compilerOptions,
        fileNames: [],
        errors: []
      } as ts.ParsedCommandLine);

      if (diagnostics.length > 0) {
        return createValidationFailure([{
          code: 'TS_CONFIG_ERROR',
          message: '編譯器選項配置錯誤',
          location: { filePath: '', range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } } }
        }]);
      }

      return createValidationSuccess();
    } catch (error) {
      return createValidationFailure([{
        code: 'TS_VALIDATION_ERROR',
        message: `驗證失敗: ${error instanceof Error ? error.message : String(error)}`,
        location: { filePath: '', range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } } }
      }]);
    }
  }

  /**
   * 清理資源
   * 使用 null as unknown as T 模式釋放資源參考，讓 GC 可以回收記憶體
   */
  async dispose(): Promise<void> {
    // 從記憶體監控器取消註冊
    MemoryMonitor.getInstance().unregister(this);

    // 清理 Language Service Manager
    if (this.languageServiceManager && 'dispose' in this.languageServiceManager) {
      await this.languageServiceManager.dispose();
    }

    this.languageServiceManager = null as unknown as ILanguageServiceManager;

    // 清理新模組

    this.scopeAnalyzer = null as unknown as ScopeAnalyzer;

    this.declarationAnalyzer = null as unknown as DeclarationAnalyzer;

    this.patternAnalyzer = null as unknown as PatternAnalyzer;

    this.referenceFinder = null as unknown as ReferenceFinder;

    // 清理編譯器選項參考

    this.compilerOptions = null as unknown as ts.CompilerOptions;

    // 清理符號提取器和依賴分析器（如果有 dispose 方法）
    const symbolExtractorWithDispose = this.symbolExtractor as { dispose?: () => Promise<void> };
    if (symbolExtractorWithDispose.dispose) {
      await symbolExtractorWithDispose.dispose();
    }
    const dependencyAnalyzerWithDispose = this.dependencyAnalyzer as { dispose?: () => Promise<void> };
    if (dependencyAnalyzerWithDispose.dispose) {
      await dependencyAnalyzerWithDispose.dispose();
    }

    // 清理其他參考

    this.symbolExtractor = null as unknown as TypeScriptSymbolExtractor;

    this.dependencyAnalyzer = null as unknown as TypeScriptDependencyAnalyzer;

    // V8 的 GC 會自動處理記憶體管理
    // 只在開發環境且有 --expose-gc 時觸發一次（用於除錯）
    if (process.env.NODE_ENV === 'development'
        && typeof global !== 'undefined'
        && 'gc' in global
        && typeof global.gc === 'function') {
      global.gc();
    }
  }

  /**
   * 獲取 TypeScript 特定的排除模式
   * 包含基礎排除模式 + TypeScript 測試檔案和型別定義
   */
  getDefaultExcludePatterns(): string[] {
    return [...TYPESCRIPT_EXCLUDE_PATTERNS];
  }

  /**
   * 判斷是否應該忽略特定檔案
   * TypeScript parser 會忽略測試檔案和型別定義檔案
   */
  shouldIgnoreFile(filePath: string): boolean {
    return matchesAnyPattern(filePath, TYPESCRIPT_EXCLUDE_PATTERNS);
  }

  /**
   * 判斷符號是否為抽象宣告
   * TypeScript 支援所有抽象宣告：class, interface, type, enum, function, namespace, module
   * 排除實體：variable, constant
   */
  isAbstractDeclaration(symbol: Symbol): boolean {
    const abstractTypes = [
      SymbolType.Class,
      SymbolType.Interface,
      SymbolType.Type,
      SymbolType.Enum,
      SymbolType.Function,
      SymbolType.Module,
      SymbolType.Namespace
    ];

    return abstractTypes.includes(symbol.type);
  }

  // 私有輔助方法

  private getScriptKind(filePath: string): ts.ScriptKind {
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    switch (ext) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.d.ts':
      return ts.ScriptKind.TS;
    case '.ts':
    default:
      return ts.ScriptKind.TS;
    }
  }

  private getLanguageFromFilePath(filePath: string): string {
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    return ext === '.tsx' ? 'tsx' : 'typescript';
  }

  private findNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
    function findNode(node: ts.Node): ts.Node | undefined {
      if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
        // 先檢查子節點
        for (const child of node.getChildren(sourceFile)) {
          const result = findNode(child);
          if (result) {
            return result;
          }
        }
        // 如果子節點中沒找到，返回當前節點
        return node;
      }
      return undefined;
    }

    return findNode(sourceFile);
  }

  private isRenameableNode(node: ts.Node): boolean {
    return (
      ts.isIdentifier(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isGetAccessor(node) ||
      ts.isSetAccessor(node) ||
      ts.isTypeParameterDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isMethodSignature(node)
    );
  }

  private isDefinitionNode(node: ts.Node): boolean {
    return (
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    );
  }

  private isDeclarationNode(node: ts.Node): boolean {
    return (
      ts.isParameter(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isBindingElement(node)
    );
  }

  private getDefinitionKind(node: ts.Node): DefinitionKind {
    if (ts.isClassDeclaration(node)) {return 'class';}
    if (ts.isInterfaceDeclaration(node)) {return 'interface';}
    if (ts.isFunctionDeclaration(node)) {return 'function';}
    if (ts.isMethodDeclaration(node)) {return 'method';}
    if (ts.isVariableDeclaration(node)) {return 'variable';}
    if (ts.isPropertyDeclaration(node)) {return 'variable';}
    if (ts.isTypeAliasDeclaration(node)) {return 'type';}
    if (ts.isEnumDeclaration(node)) {return 'enum';}
    if (ts.isModuleDeclaration(node)) {return 'module';}
    return 'variable';
  }

  private symbolTypeToDefinitionKind(symbolType: SymbolType): DefinitionKind {
    // 將 SymbolType 映射到 DefinitionKind
    switch (symbolType) {
    case SymbolType.Class:
      return 'class';
    case SymbolType.Interface:
      return 'interface';
    case SymbolType.Function:
      return 'function';
    case SymbolType.Variable:
      return 'variable';
    case SymbolType.Constant:
      return 'constant';
    case SymbolType.Type:
      return 'type';
    case SymbolType.Enum:
      return 'enum';
    case SymbolType.Module:
      return 'module';
    case SymbolType.Namespace:
      return 'namespace';
    default:
      return 'variable'; // 預設為變數
    }
  }

  private getReferenceUsageKind(_reference: Reference): 'read' | 'write' | 'call' | 'reference' {
    // 基於上下文判斷使用類型
    return 'reference'; // 簡化實作
  }

  private async findSymbolAtPosition(ast: TypeScriptAST, position: Position): Promise<Symbol | null> {
    const symbols = await this.extractSymbols(ast);
    const tsPosition = positionToTsPosition(ast.tsSourceFile, position);

    // 查找最精確匹配該位置的符號
    let bestMatch: Symbol | null = null;
    let bestMatchSize = Number.MAX_SAFE_INTEGER;

    for (const symbol of symbols) {
      const typedSymbol = symbol as TypeScriptSymbol;

      // 獲取符號的標識符節點
      const identifier = this.scopeAnalyzer.getIdentifierFromSymbolNode(typedSymbol.tsNode);
      if (!identifier) {
        continue;
      }

      // 檢查位置是否在標識符範圍內
      const identifierStart = identifier.getStart(ast.tsSourceFile);
      const identifierEnd = identifier.getEnd();

      if (tsPosition >= identifierStart && tsPosition < identifierEnd) {
        // 找到最小的匹配範圍（最精確的符號）
        const size = identifierEnd - identifierStart;
        if (size < bestMatchSize) {
          bestMatch = symbol;
          bestMatchSize = size;
        }
      }
    }

    return bestMatch;
  }

  private isPositionInRange(position: Position, range: Range): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
      return false;
    }

    if (position.line === range.start.line && position.column < range.start.column) {
      return false;
    }

    if (position.line === range.end.line && position.column > range.end.column) {
      return false;
    }

    return true;
  }

  /**
   * 判斷檔案是否為測試檔案
   */
  isTestFile(filePath: string): boolean {
    return /\.(test|spec)\.(ts|tsx)$/.test(filePath) ||
           filePath.includes('/__tests__/') ||
           filePath.includes('/__mocks__/');
  }

  /**
   * 取得符號的完整宣告範圍（包含 JSDoc、裝飾器）
   * 委託給 DeclarationAnalyzer
   */
  getFullDeclarationRange(
    code: string,
    symbolName: string,
    symbolType: string,
    startLine: number
  ): Range | null {
    return this.declarationAnalyzer.getFullDeclarationRange(code, symbolName, symbolType, startLine);
  }

  /**
   * 解析程式碼中的所有 import 宣告
   * 委託給 DeclarationAnalyzer
   */
  getImportDeclarations(code: string): ImportDeclaration[] | null {
    return this.declarationAnalyzer.getImportDeclarations(code);
  }

  /**
   * 格式化函數簽章
   * 委託給 DeclarationAnalyzer
   */
  formatSignature(
    code: string,
    functionName: string,
    line?: number
  ): FormattedSignature | null {
    return this.declarationAnalyzer.formatSignature(code, functionName, line);
  }

  /**
   * 提取符號的 JSDoc 文件註解
   * 委託給 DeclarationAnalyzer
   */
  getDocumentation(
    code: string,
    symbolName: string,
    symbolType: string,
    line: number
  ): Documentation | null {
    return this.declarationAnalyzer.getDocumentation(code, symbolName, symbolType, line);
  }

  // ===== 設計模式識別支援 =====

  /**
   * 識別程式碼中的設計模式
   * 委託給 PatternAnalyzer
   */
  identifyPatterns(code: string): PatternInfo[] | null {
    return this.patternAnalyzer.identifyPatterns(code);
  }

  // ===== 作用域感知符號查找支援 =====

  /**
   * 作用域感知的符號引用查找
   * 委託給 ReferenceFinder
   */
  findScopedReferences(
    code: string,
    symbolName: string,
    options?: ScopedFindReferencesOptions
  ): ScopedReference[] | null {
    return this.referenceFinder.findScopedReferences(code, symbolName, options);
  }
}