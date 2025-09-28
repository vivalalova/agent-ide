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
} from '@infrastructure/parser';
import type {
  AST,
  Symbol,
  Reference,
  Dependency,
  Position,
  Range
} from '@shared/types';
import {
  createAST,
  createASTMetadata,
  ReferenceType,
  SymbolType
} from '@shared/types';
import {
  TypeScriptAST,
  TypeScriptASTNode,
  TypeScriptSymbol,
  DEFAULT_COMPILER_OPTIONS,
  TypeScriptParseError,
  createTypeScriptASTNode,
  createParseError,
  tsPositionToPosition,
  positionToTsPosition,
  tsNodeToRange,
  getNodeName,
  isValidIdentifier
} from './types';
import { TypeScriptSymbolExtractor, createSymbolExtractor } from './symbol-extractor';
import { TypeScriptDependencyAnalyzer, createDependencyAnalyzer } from './dependency-analyzer';

/**
 * TypeScript Parser 實作
 */
export class TypeScriptParser implements ParserPlugin {
  public readonly name = 'typescript';
  public readonly version = '1.0.0';
  public readonly supportedExtensions = ['.ts', '.tsx', '.d.ts'] as const;
  public readonly supportedLanguages = ['typescript', 'tsx'] as const;

  private symbolExtractor: TypeScriptSymbolExtractor;
  private dependencyAnalyzer: TypeScriptDependencyAnalyzer;
  private compilerOptions: ts.CompilerOptions;
  private languageService: ts.LanguageService | null = null;
  private languageServiceHost: ts.LanguageServiceHost | null = null;
  private files: Map<string, { version: number; content: string }> = new Map();

  constructor(compilerOptions?: ts.CompilerOptions) {
    this.symbolExtractor = createSymbolExtractor();
    this.dependencyAnalyzer = createDependencyAnalyzer();
    this.compilerOptions = { ...DEFAULT_COMPILER_OPTIONS, ...compilerOptions };
  }

  /**
   * 解析 TypeScript 程式碼
   */
  async parse(code: string, filePath: string): Promise<AST> {
    this.validateInput(code, filePath);

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
      const program = ts.createProgram([filePath], this.compilerOptions, {
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

      return ast;
    } catch (error) {
      if (error instanceof TypeScriptParseError) {
        throw error;
      }
      throw createParseError(`解析失敗: ${error instanceof Error ? error.message : String(error)}`);
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
   */
  private async findReferencesBasic(ast: AST, symbol: Symbol): Promise<Reference[]> {
    const typedAst = ast as TypeScriptAST;
    const typedSymbol = symbol as TypeScriptSymbol;

    const references: Reference[] = [];
    const symbolName = typedSymbol.name;

    // 獲取符號的標識符節點
    const symbolIdentifier = this.getIdentifierFromSymbolNode(typedSymbol.tsNode);
    if (!symbolIdentifier) {
      return references;
    }

    // 使用 TypeScript 原生的節點遍歷，收集所有標識符
    const collectIdentifiers = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && node.text === symbolName) {
        // 檢查這個標識符是否真的引用了我們的符號
        if (this.isReferenceToSymbol(node, typedSymbol)) {
          const location = {
            filePath: typedAst.tsSourceFile.fileName,
            range: tsNodeToRange(node, typedAst.tsSourceFile)
          };

          const referenceType = this.getReferenceType(node, typedSymbol);

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
    const node = this.findNodeAtPosition(typedAst.tsSourceFile, tsPosition);
    if (!node) {
      throw new Error('在指定位置找不到符號');
    }

    // 確保節點是標識符或可重新命名的宣告
    let targetIdentifier: ts.Identifier | null = null;

    if (ts.isIdentifier(node)) {
      targetIdentifier = node;
    } else if (this.isRenameableNode(node)) {
      targetIdentifier = this.getIdentifierFromSymbolNode(node);
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
    // TypeScript Parser 沒有需要清理的資源
    // 但提供介面供將來擴展使用
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

  private getSyntacticDiagnostics(sourceFile: ts.SourceFile): ts.Diagnostic[] {
    // 對於獨立的 SourceFile，我們跳過語法診斷檢查
    // 在實際專案中，這通常由 Program 提供
    return [];
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

  private isReferenceToSymbol(node: ts.Node, symbol: TypeScriptSymbol): boolean {
    if (!ts.isIdentifier(node)) {
      return false;
    }

    const name = node.text;
    if (name !== symbol.name) {
      return false;
    }

    // 找到符號的標識符節點
    const symbolIdentifier = this.getIdentifierFromSymbolNode(symbol.tsNode);
    if (!symbolIdentifier) {
      return false;
    }

    // 檢查是否為相同符號的引用
    // 1. 如果是符號的定義位置本身
    if (node === symbolIdentifier) {
      return true;
    }

    // 2. 對於型別宣告（類別、介面、型別別名等），檢查是否在型別位置使用
    if (ts.isClassDeclaration(symbol.tsNode) ||
        ts.isInterfaceDeclaration(symbol.tsNode) ||
        ts.isTypeAliasDeclaration(symbol.tsNode) ||
        ts.isEnumDeclaration(symbol.tsNode)) {
      // 對於型別，只要名稱相同就是引用（在同一個檔案中）
      if (node.getSourceFile() === symbolIdentifier.getSourceFile()) {
        return true;
      }
    }

    // 3. 對於變數、函式和方法，使用作用域檢查
    const symbolScope = this.getScopeContainer(symbolIdentifier);
    const nodeScope = this.getScopeContainer(node);

    // 檢查是否在相同作用域或符號的子作用域內
    if (nodeScope === symbolScope || this.isInScopeChain(node, symbolScope)) {
      // 檢查是否被遮蔽（同名變數在更內層作用域）
      if (!this.isShadowed(node, symbolIdentifier)) {
        return true;
      }
    }

    return false;
  }

  private getIdentifierFromSymbolNode(node: ts.Node): ts.Identifier | null {
    // 如果本身就是 Identifier，直接返回
    if (ts.isIdentifier(node)) {
      return node;
    }

    // 對於變數宣告，標識符在 name 屬性中
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於函式宣告，標識符在 name 屬性中
    if (ts.isFunctionDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於類別宣告
    if (ts.isClassDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於方法宣告
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於屬性宣告
    if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於參數
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於介面宣告
    if (ts.isInterfaceDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於型別別名宣告
    if (ts.isTypeAliasDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於列舉宣告
    if (ts.isEnumDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於命名空間宣告
    if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於 Get/Set 存取器
    if ((ts.isGetAccessor(node) || ts.isSetAccessor(node)) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於型別參數（泛型）
    if (ts.isTypeParameterDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於介面/型別的屬性簽名
    if (ts.isPropertySignature(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於方法簽名
    if (ts.isMethodSignature(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    return null;
  }

  private getNodeScope(node: ts.Node): string {
    let current = node.parent;
    while (current) {
      if (ts.isFunctionDeclaration(current) ||
          ts.isMethodDeclaration(current) ||
          ts.isArrowFunction(current) ||
          ts.isFunctionExpression(current)) {
        return `function_${current.pos}_${current.end}`;
      }
      if (ts.isBlock(current) && current.parent &&
          (ts.isIfStatement(current.parent) ||
           ts.isForStatement(current.parent) ||
           ts.isWhileStatement(current.parent))) {
        return `block_${current.pos}_${current.end}`;
      }
      current = current.parent;
    }
    return 'global';
  }

  private isInSameScope(node: ts.Node, symbolNode: ts.Node): boolean {
    // 找到符號定義所在的作用域
    let symbolScope = symbolNode.parent;
    while (symbolScope && !this.isScopeNode(symbolScope)) {
      symbolScope = symbolScope.parent;
    }

    // 檢查節點是否在該作用域內
    let currentScope = node.parent;
    while (currentScope) {
      if (currentScope === symbolScope) {
        return true;
      }
      currentScope = currentScope.parent;
    }

    return false;
  }

  private isScopeNode(node: ts.Node): boolean {
    return ts.isFunctionDeclaration(node) ||
           ts.isMethodDeclaration(node) ||
           ts.isArrowFunction(node) ||
           ts.isFunctionExpression(node) ||
           ts.isBlock(node) ||
           ts.isSourceFile(node);
  }

  private getReferenceType(node: ts.Node, symbol: TypeScriptSymbol): ReferenceType {
    // 找到符號的標識符節點
    const symbolIdentifier = this.getIdentifierFromSymbolNode(symbol.tsNode);

    // 如果是符號的原始定義位置
    if (node === symbolIdentifier) {
      return ReferenceType.Definition;
    }

    // 檢查是否為宣告（例如函式參數、變數宣告等）
    if (this.isDeclarationNode(node.parent)) {
      return ReferenceType.Declaration;
    }

    // 否則為使用
    return ReferenceType.Usage;
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

  private getDefinitionKind(node: ts.Node): any {
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
      const identifier = this.getIdentifierFromSymbolNode(typedSymbol.tsNode);
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
    this.languageServiceHost = {
      getScriptFileNames: () => {
        const fileNames = Array.from(this.files.keys());
        // 確保包含當前檔案
        if (!fileNames.includes(sourceFile.fileName)) {
          fileNames.push(sourceFile.fileName);
        }
        return fileNames;
      },
      getScriptVersion: (fileName) => {
        const file = this.files.get(fileName);
        return file ? String(file.version) : '0';
      },
      getScriptSnapshot: (fileName) => {
        const file = this.files.get(fileName);
        if (file) {
          return ts.ScriptSnapshot.fromString(file.content);
        }
        // 嘗試讀取實際檔案
        try {
          const content = ts.sys.readFile(fileName);
          if (content) {
            return ts.ScriptSnapshot.fromString(content);
          }
        } catch {
          // 忽略錯誤
        }
        return undefined;
      },
      getCurrentDirectory: () => process.cwd(),
      getCompilationSettings: () => ({
        ...this.compilerOptions,
        // 確保啟用必要的選項
        allowNonTsExtensions: true,
        noResolve: false,
        noLib: false,
        lib: this.compilerOptions.lib || ['lib.es2020.d.ts']
      }),
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: (fileName) => {
        return this.files.has(fileName) || (ts.sys.fileExists ? ts.sys.fileExists(fileName) : false);
      },
      readFile: (fileName) => {
        const file = this.files.get(fileName);
        if (file) {
          return file.content;
        }
        return ts.sys.readFile ? ts.sys.readFile(fileName) : undefined;
      },
      readDirectory: ts.sys.readDirectory ? ts.sys.readDirectory : () => [],
      getDirectories: ts.sys.getDirectories ? ts.sys.getDirectories : () => [],
      directoryExists: ts.sys.directoryExists ? ts.sys.directoryExists : () => false,
      realpath: ts.sys.realpath ? ts.sys.realpath : (path) => path,
      getNewLine: () => '\n'
    };

    // 建立 Language Service
    this.languageService = ts.createLanguageService(
      this.languageServiceHost,
      ts.createDocumentRegistry()
    );
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
    const identifier = this.getIdentifierFromSymbolNode(symbol.tsNode);
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

  /**
   * 取得節點的作用域容器
   */
  private getScopeContainer(node: ts.Node): ts.Node {
    let current = node.parent;
    while (current) {
      if (ts.isFunctionDeclaration(current) ||
          ts.isFunctionExpression(current) ||
          ts.isArrowFunction(current) ||
          ts.isMethodDeclaration(current) ||
          ts.isConstructorDeclaration(current) ||
          ts.isBlock(current) ||
          ts.isSourceFile(current)) {
        return current;
      }
      current = current.parent;
    }
    return node.getSourceFile();
  }

  /**
   * 檢查節點是否在指定作用域鏈內
   */
  private isInScopeChain(node: ts.Node, scopeContainer: ts.Node): boolean {
    let current = node.parent;
    while (current) {
      if (current === scopeContainer) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * 檢查符號是否被遮蔽
   */
  private isShadowed(node: ts.Node, originalIdentifier: ts.Identifier): boolean {
    const name = originalIdentifier.text;
    let current = node.parent;

    // 從 node 向上遍歷到 originalIdentifier 的作用域
    while (current && current !== originalIdentifier.parent) {
      // 檢查當前作用域是否有同名的宣告
      if (ts.isFunctionDeclaration(current) ||
          ts.isFunctionExpression(current) ||
          ts.isArrowFunction(current) ||
          ts.isMethodDeclaration(current)) {
        // 檢查參數
        if (current.parameters) {
          for (const param of current.parameters) {
            if (ts.isIdentifier(param.name) && param.name.text === name) {
              return true; // 被參數遮蔽
            }
          }
        }
      }

      // 檢查區塊作用域中的宣告
      if (ts.isBlock(current)) {
        for (const statement of current.statements) {
          if (ts.isVariableStatement(statement)) {
            for (const decl of statement.declarationList.declarations) {
              if (ts.isIdentifier(decl.name) && decl.name.text === name) {
                // 確認這個宣告在 node 之前
                if (decl.pos < node.pos) {
                  return true; // 被區域變數遮蔽
                }
              }
            }
          }
        }
      }

      current = current.parent;
    }

    return false;
  }
}