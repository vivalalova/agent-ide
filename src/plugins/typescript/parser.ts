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
  createUsage
} from '../../infrastructure/parser/index.js';
import type {
  AST,
  Symbol,
  Reference,
  Dependency,
  Position,
  Range
} from '../../shared/types/index.js';
import {
  createAST,
  createASTMetadata,
  ReferenceType,
  SymbolType
} from '../../shared/types/index.js';
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
import { MemoryMonitor, type Disposable } from '../shared/index.js';

// 導入拆分的工具模組
import {
  findNodeAtPosition,
  isRenameableNode,
  isDefinitionNode,
  getIdentifierFromSymbolNode,
  getDefinitionKind
} from './node-utils.js';
import { isReferenceToSymbol, getReferenceType } from './reference-finder.js';
import {
  createLanguageServiceHost,
  createLanguageService,
  type FileEntry
} from './language-service-host.js';

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
  private languageService: ts.LanguageService | null = null;
  private languageServiceHost: ts.LanguageServiceHost | null = null;
  private files: Map<string, FileEntry> = new Map();

  constructor(compilerOptions?: ts.CompilerOptions) {
    this.symbolExtractor = createSymbolExtractor();
    this.dependencyAnalyzer = createDependencyAnalyzer();
    this.compilerOptions = { ...DEFAULT_COMPILER_OPTIONS, ...compilerOptions };

    // 註冊到記憶體監控器
    MemoryMonitor.getInstance().register(this);
  }

  /**
   * 解析 TypeScript 程式碼
   */
  async parse(code: string, filePath: string): Promise<AST> {
    this.validateInput(code, filePath);

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
    this.ensureLanguageServiceInitialized(typedAst.tsSourceFile);

    if (!this.languageService) {
      // 如果無法使用 Language Service，回退到原始方法
      return this.findReferencesBasic(ast, symbol);
    }

    const fileName = typedAst.tsSourceFile.fileName;

    // 取得符號位置
    const symbolPosition = this.getSymbolPosition(typedSymbol, typedAst.tsSourceFile);
    if (symbolPosition === undefined) {
      return [];
    }

    // 使用 Language Service 查找引用
    const referencesResult = this.languageService.findReferences(fileName, symbolPosition);

    if (!referencesResult) {
      return [];
    }

    const references: Reference[] = [];

    for (const refSymbol of referencesResult) {
      for (const ref of refSymbol.references) {
        const sourceFile = this.getSourceFileFromFileName(ref.fileName);
        if (!sourceFile) {continue;}

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
    const symbolIdentifier = getIdentifierFromSymbolNode(typedSymbol.tsNode);
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
        if (isReferenceToSymbol(node, typedSymbol)) {
          const location = {
            filePath: typedAst.tsSourceFile.fileName,
            range: tsNodeToRange(node, typedAst.tsSourceFile)
          };

          const referenceType = getReferenceType(node, typedSymbol);

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
    this.validateRenameInput(newName);

    const typedAst = ast as TypeScriptAST;
    const tsPosition = positionToTsPosition(typedAst.tsSourceFile, position);

    // 查找位置上的節點
    const node = findNodeAtPosition(typedAst.tsSourceFile, tsPosition);
    if (!node) {
      throw new Error('在指定位置找不到符號');
    }

    // 確保節點是標識符或可重新命名的宣告
    let targetIdentifier: ts.Identifier | null = null;

    if (ts.isIdentifier(node)) {
      targetIdentifier = node;
    } else if (isRenameableNode(node)) {
      targetIdentifier = getIdentifierFromSymbolNode(node);
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
  async extractFunction(ast: AST, selection: Range): Promise<CodeEdit[]> {
    // 這是一個複雜的重構操作，目前提供基本實作
    throw new Error('提取函式重構尚未實作');
  }

  /**
   * 查找定義
   */
  async findDefinition(ast: AST, position: Position): Promise<Definition | null> {
    const typedAst = ast as TypeScriptAST;
    const tsPosition = positionToTsPosition(typedAst.tsSourceFile, position);

    const node = findNodeAtPosition(typedAst.tsSourceFile, tsPosition);
    if (!node) {
      return null;
    }

    // 檢查節點是否有效
    if (!node.kind) {
      return null;
    }

    // 如果當前節點本身就是定義，返回它
    if (isDefinitionNode(node)) {
      const location = {
        filePath: typedAst.tsSourceFile.fileName,
        range: tsNodeToRange(node, typedAst.tsSourceFile)
      };

      return createDefinition(location, getDefinitionKind(node) as DefinitionKind);
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
        errors: []
      } as any);

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
   */
  async dispose(): Promise<void> {
    // 從記憶體監控器取消註冊
    MemoryMonitor.getInstance().unregister(this);

    // 清理 Language Service 和相關資源
    if (this.languageService) {
      this.languageService.dispose();
      this.languageService = null;
    }

    // 清理 Language Service Host
    this.languageServiceHost = null;

    // 清理檔案快取
    this.files.clear();

    // 清理編譯器選項參考（完全清空而非設為空物件）
    this.compilerOptions = null as any;

    // 清理符號提取器和依賴分析器（如果有 dispose 方法）
    if (this.symbolExtractor && 'dispose' in this.symbolExtractor && typeof (this.symbolExtractor as any).dispose === 'function') {
      await (this.symbolExtractor as any).dispose();
    }
    if (this.dependencyAnalyzer && 'dispose' in this.dependencyAnalyzer && typeof (this.dependencyAnalyzer as any).dispose === 'function') {
      await (this.dependencyAnalyzer as any).dispose();
    }

    // 清理其他參考
    this.symbolExtractor = null as any;
    this.dependencyAnalyzer = null as any;

    // 多次觸發垃圾收集以確保記憶體完全釋放
    if (typeof global !== 'undefined' && 'gc' in global && typeof global.gc === 'function') {
      // 進行多次垃圾回收以確保釋放所有 TypeScript 相關資源
      for (let i = 0; i < 3; i++) {
        global.gc();
      }
    }
  }

  /**
   * 獲取 TypeScript 特定的排除模式
   * 包含基礎排除模式 + TypeScript 測試檔案和型別定義
   */
  getDefaultExcludePatterns(): string[] {
    return [
      // 通用排除模式
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.next/**',
      '.nuxt/**',
      'out/**',
      '.cache/**',
      '.turbo/**',
      // TypeScript 特定排除模式
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/*.test.tsx',
      '**/*.spec.tsx',
      '**/__tests__/**',
      '**/__mocks__/**',
      '**/*.d.ts' // 型別定義檔案通常不需要分析
    ];
  }

  /**
   * 判斷是否應該忽略特定檔案
   * TypeScript parser 會忽略測試檔案和型別定義檔案
   */
  shouldIgnoreFile(filePath: string): boolean {
    const patterns = this.getDefaultExcludePatterns();
    const normalizedPath = filePath.replace(/^\.?\//, '');

    // 使用 minimatch 進行模式匹配
    return patterns.some(pattern => {
      try {
        // 直接使用字串包含檢查來提高效能
        if (pattern.includes('**')) {
          // 對於包含 ** 的模式，進行簡單的子字串匹配
          const simplePattern = pattern.replace(/\*\*/g, '').replace(/\//g, '');
          if (normalizedPath.includes(simplePattern)) {
            return true;
          }
        }

        // 檢查檔案路徑是否匹配模式
        if (pattern.startsWith('**/')) {
          const suffix = pattern.substring(3);
          if (normalizedPath.endsWith(suffix) || normalizedPath.includes('/' + suffix)) {
            return true;
          }
        }

        return false;
      } catch (error) {
        return false;
      }
    });
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

  /**
   * 判斷檔案是否為測試檔案
   */
  isTestFile(filePath: string): boolean {
    return /\.(test|spec)\.(ts|tsx)$/.test(filePath) ||
           filePath.includes('/__tests__/') ||
           filePath.includes('/__mocks__/');
  }

  // 私有輔助方法

  private validateInput(code: string, filePath: string): void {
    if (!code.trim()) {
      throw new Error('程式碼內容不能為空');
    }

    if (!filePath.trim()) {
      throw new Error('檔案路徑不能為空');
    }
  }

  private validateRenameInput(newName: string): void {
    if (!newName.trim()) {
      throw new Error('新名稱不能為空');
    }

    if (!isValidIdentifier(newName)) {
      throw new Error('新名稱必須是有效的 TypeScript 識別符');
    }
  }

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

  private symbolTypeToDefinitionKind(symbolType: any): DefinitionKind {
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

  private getReferenceUsageKind(reference: Reference): any {
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
      const identifier = getIdentifierFromSymbolNode(typedSymbol.tsNode);
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

  /**
   * 初始化 Language Service
   */
  private ensureLanguageServiceInitialized(sourceFile: ts.SourceFile): void {
    if (this.languageService) {
      // 更新檔案內容
      this.updateFile(sourceFile.fileName, sourceFile.text);
      return;
    }

    // 添加當前檔案到檔案列表
    this.updateFile(sourceFile.fileName, sourceFile.text);

    // 建立 Language Service Host
    this.languageServiceHost = createLanguageServiceHost({
      files: this.files,
      compilerOptions: this.compilerOptions,
      currentFileName: sourceFile.fileName
    });

    // 建立 Language Service
    this.languageService = createLanguageService(this.languageServiceHost);
  }

  /**
   * 更新檔案內容
   */
  private updateFile(fileName: string, content: string): void {
    const existing = this.files.get(fileName);
    if (existing && existing.content === content) {
      return;
    }

    this.files.set(fileName, {
      version: existing ? existing.version + 1 : 0,
      content
    });
  }

  /**
   * 取得符號在檔案中的位置
   */
  private getSymbolPosition(symbol: TypeScriptSymbol, sourceFile: ts.SourceFile): number | undefined {
    const identifier = getIdentifierFromSymbolNode(symbol.tsNode);
    if (!identifier) {
      return undefined;
    }
    return identifier.getStart(sourceFile);
  }

  /**
   * 根據檔案名稱取得 SourceFile
   */
  private getSourceFileFromFileName(fileName: string): ts.SourceFile | undefined {
    if (!this.languageService) {
      return undefined;
    }
    const program = this.languageService.getProgram();
    return program?.getSourceFile(fileName);
  }
}
