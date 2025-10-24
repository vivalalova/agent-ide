/**
 * JavaScript Parser 主要實作
 * 實作 ParserPlugin 介面
 */

import { parse as babelParse } from '@babel/parser';
import * as babel from '@babel/types';
import babelTraverse, { NodePath } from '@babel/traverse';
import babelGenerate from '@babel/generator';

// Handle both ESM and CJS module formats
const traverse = (babelTraverse as any).default || babelTraverse;
const generate = (babelGenerate as any).default || babelGenerate;
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
  SymbolType,
  DependencyType,
  createSymbol,
  createReference,
  createDependency
} from '../../shared/types/index.js';
import {
  JavaScriptAST,
  JavaScriptASTNode,
  JavaScriptSymbol,
  JavaScriptParseOptions,
  DEFAULT_PARSE_OPTIONS,
  JavaScriptParseError,
  createJavaScriptASTNode,
  createParseError,
  babelLocationToPosition,
  getNodeName,
  isValidIdentifier,
  isSymbolDeclaration,
  isDependencyNode,
  getDependencyPath,
  isRelativePath,
  getImportedSymbols,
  getPluginsForFile,
  getScopeType,
  BABEL_SYMBOL_TYPE_MAP
} from './types.js';

/**
 * JavaScript Parser 實作
 */
export class JavaScriptParser implements ParserPlugin {
  public readonly name = 'javascript';
  public readonly version = '1.0.0';
  public readonly supportedExtensions = ['.js', '.jsx', '.mjs', '.cjs'] as const;
  public readonly supportedLanguages = ['javascript', 'jsx'] as const;

  private parseOptions: JavaScriptParseOptions;

  constructor(parseOptions?: Partial<JavaScriptParseOptions>) {
    this.parseOptions = { ...DEFAULT_PARSE_OPTIONS, ...parseOptions };
  }

  /**
   * 解析 JavaScript 程式碼
   */
  async parse(code: string, filePath: string): Promise<AST> {
    this.validateInput(code, filePath);

    try {
      // 根據檔案類型調整解析選項
      const options = this.getParseOptionsForFile(filePath);

      // 使用 Babel parser 解析程式碼
      const babelAST = babelParse(code, options as any);

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

      return ast;
    } catch (error) {
      if (error instanceof JavaScriptParseError) {
        throw error;
      }

      // 包裝 Babel 解析錯誤
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw createParseError(`解析失敗: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 提取符號
   */
  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const typedAst = ast as JavaScriptAST;
    const symbols: JavaScriptSymbol[] = [];

    // 使用 Babel traverse 遍歷 AST
    traverse(typedAst.babelAST, {
      // 處理各種宣告節點
      FunctionDeclaration: (path: NodePath<babel.FunctionDeclaration>) => {
        this.extractFunctionSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ClassDeclaration: (path: NodePath<babel.ClassDeclaration>) => {
        this.extractClassSymbol(path.node, symbols, typedAst.sourceFile);
      },

      VariableDeclarator: (path: NodePath<babel.VariableDeclarator>) => {
        this.extractVariableSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ImportDefaultSpecifier: (path: NodePath<babel.ImportDefaultSpecifier>) => {
        this.extractImportSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ImportSpecifier: (path: NodePath<babel.ImportSpecifier>) => {
        this.extractImportSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ImportNamespaceSpecifier: (path: NodePath<babel.ImportNamespaceSpecifier>) => {
        this.extractImportSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ClassMethod: (path: NodePath<babel.ClassMethod>) => {
        this.extractMethodSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ClassProperty: (path: NodePath<babel.ClassProperty>) => {
        this.extractPropertySymbol(path.node, symbols, typedAst.sourceFile);
      },

      ObjectMethod: (path: NodePath<babel.ObjectMethod>) => {
        this.extractObjectMethodSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ObjectProperty: (path: NodePath<babel.ObjectProperty>) => {
        this.extractObjectPropertySymbol(path.node, symbols, typedAst.sourceFile);
      }
    });

    return symbols as Symbol[];
  }

  /**
   * 查找符號引用
   */
  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    const typedAst = ast as JavaScriptAST;
    const typedSymbol = symbol as JavaScriptSymbol;
    const references: Reference[] = [];

    // 使用 Babel traverse 查找引用
    traverse(typedAst.babelAST, {
      Identifier: (path: NodePath<babel.Identifier>) => {
        if (path.node.name === typedSymbol.name) {
          // 檢查是否為真正的引用
          if (this.isReferenceToSymbol(path, typedSymbol)) {
            const location = {
              filePath: typedAst.sourceFile,
              range: this.getNodeRange(path.node)
            };

            const referenceType = this.getReferenceType(path, typedSymbol);

            references.push(createReference(symbol, location, referenceType));
          }
        }
      },

      JSXIdentifier: (path: NodePath<babel.JSXIdentifier>) => {
        // 處理 JSX 中的識別符
        if (path.node.name === typedSymbol.name) {
          const location = {
            filePath: typedAst.sourceFile,
            range: this.getNodeRange(path.node)
          };

          references.push(createReference(symbol, location, ReferenceType.Usage));
        }
      }
    });

    return references;
  }

  /**
   * 提取依賴關係
   */
  async extractDependencies(ast: AST): Promise<Dependency[]> {
    const typedAst = ast as JavaScriptAST;
    const dependencies: Dependency[] = [];

    traverse(typedAst.babelAST, {
      ImportDeclaration: (path: NodePath<babel.ImportDeclaration>) => {
        this.extractImportDependency(path.node, dependencies, typedAst.sourceFile);
      },

      ExportNamedDeclaration: (path: NodePath<babel.ExportNamedDeclaration>) => {
        this.extractExportDependency(path.node, dependencies, typedAst.sourceFile);
      },

      ExportAllDeclaration: (path: NodePath<babel.ExportAllDeclaration>) => {
        this.extractExportDependency(path.node, dependencies, typedAst.sourceFile);
      },

      CallExpression: (path: NodePath<babel.CallExpression>) => {
        // 處理 require() 和動態 import()
        this.extractCallExpressionDependency(path.node, dependencies, typedAst.sourceFile);
      }
    });

    return dependencies;
  }

  /**
   * 重新命名符號
   */
  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    this.validateRenameInput(newName);

    const typedAst = ast as JavaScriptAST;

    // 查找位置上的符號
    const symbol = await this.findSymbolAtPosition(typedAst, position);
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
    const typedAst = ast as JavaScriptAST;
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
        message: `Babel 解析器不可用: ${error instanceof Error ? error.message : String(error)}`,
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
    // JavaScript Parser 沒有需要清理的資源
    // 但提供介面供將來擴展使用
  }

  /**
   * 獲取 JavaScript 特定的排除模式
   * 包含基礎排除模式 + JavaScript 測試檔案
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
      // JavaScript 特定排除模式
      '**/*.test.js',
      '**/*.spec.js',
      '**/*.test.jsx',
      '**/*.spec.jsx',
      '**/*.test.mjs',
      '**/*.spec.mjs',
      '**/*.test.cjs',
      '**/*.spec.cjs',
      '**/__tests__/**',
      '**/__mocks__/**'
    ];
  }

  /**
   * 判斷是否應該忽略特定檔案
   * JavaScript parser 會忽略測試檔案
   */
  shouldIgnoreFile(filePath: string): boolean {
    const patterns = this.getDefaultExcludePatterns();
    const normalizedPath = filePath.replace(/^\.?\//, '');

    // 使用簡單的模式匹配
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
   * JavaScript 支援：class（ES6+）、function
   * JavaScript 沒有 interface、type、namespace 等概念
   * 排除實體：variable, constant
   */
  isAbstractDeclaration(symbol: Symbol): boolean {
    return symbol.type === SymbolType.Class || symbol.type === SymbolType.Function;
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
      throw new Error('新名稱必須是有效的 JavaScript 識別符');
    }
  }

  private getParseOptionsForFile(filePath: string): JavaScriptParseOptions {
    const options = { ...this.parseOptions };
    options.plugins = getPluginsForFile(filePath);

    // 根據副檔名調整 sourceType
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    if (ext === '.mjs') {
      options.sourceType = 'module';
    } else if (ext === '.cjs') {
      options.sourceType = 'script';
    }

    return options;
  }

  private getLanguageFromFilePath(filePath: string): string {
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    return ext === '.jsx' ? 'jsx' : 'javascript';
  }

  private getNodeRange(node: babel.Node): Range {
    if (node.loc) {
      return babelLocationToPosition(node.loc);
    }

    // 如果沒有位置資訊，返回預設範圍
    return {
      start: { line: 0, column: 0, offset: 0 },
      end: { line: 0, column: 0, offset: 0 }
    };
  }

  private extractFunctionSymbol(
    node: babel.FunctionDeclaration,
    symbols: JavaScriptSymbol[],
    sourceFile: string
  ): void {
    if (node.id) {
      const symbol = this.createSymbolFromNode(
        node,
        node.id.name,
        SymbolType.Function,
        sourceFile
      );
      symbols.push(symbol);
    }
  }

  private extractClassSymbol(
    node: babel.ClassDeclaration,
    symbols: JavaScriptSymbol[],
    sourceFile: string
  ): void {
    if (node.id) {
      const symbol = this.createSymbolFromNode(
        node,
        node.id.name,
        SymbolType.Class,
        sourceFile
      );
      symbols.push(symbol);
    }
  }

  private extractVariableSymbol(
    node: babel.VariableDeclarator,
    symbols: JavaScriptSymbol[],
    sourceFile: string
  ): void {
    if (babel.isIdentifier(node.id)) {
      const symbol = this.createSymbolFromNode(
        node,
        node.id.name,
        SymbolType.Variable,
        sourceFile
      );
      symbols.push(symbol);
    }
  }

  private extractImportSymbol(
    node: babel.ImportDefaultSpecifier | babel.ImportSpecifier | babel.ImportNamespaceSpecifier,
    symbols: JavaScriptSymbol[],
    sourceFile: string
  ): void {
    const symbol = this.createSymbolFromNode(
      node,
      node.local.name,
      SymbolType.Variable,
      sourceFile,
      { isImported: true }
    );
    symbols.push(symbol);
  }

  private extractMethodSymbol(
    node: babel.ClassMethod,
    symbols: JavaScriptSymbol[],
    sourceFile: string
  ): void {
    if (babel.isIdentifier(node.key)) {
      const symbol = this.createSymbolFromNode(
        node,
        node.key.name,
        SymbolType.Function,
        sourceFile
      );
      symbols.push(symbol);
    }
  }

  private extractPropertySymbol(
    node: babel.ClassProperty,
    symbols: JavaScriptSymbol[],
    sourceFile: string
  ): void {
    if (babel.isIdentifier(node.key)) {
      const symbol = this.createSymbolFromNode(
        node,
        node.key.name,
        SymbolType.Variable,
        sourceFile
      );
      symbols.push(symbol);
    }
  }

  private extractObjectMethodSymbol(
    node: babel.ObjectMethod,
    symbols: JavaScriptSymbol[],
    sourceFile: string
  ): void {
    if (babel.isIdentifier(node.key)) {
      const symbol = this.createSymbolFromNode(
        node,
        node.key.name,
        SymbolType.Function,
        sourceFile
      );
      symbols.push(symbol);
    }
  }

  private extractObjectPropertySymbol(
    node: babel.ObjectProperty,
    symbols: JavaScriptSymbol[],
    sourceFile: string
  ): void {
    if (babel.isIdentifier(node.key)) {
      const symbol = this.createSymbolFromNode(
        node,
        node.key.name,
        SymbolType.Variable,
        sourceFile
      );
      symbols.push(symbol);
    }
  }

  private createSymbolFromNode(
    node: babel.Node,
    name: string,
    type: SymbolType,
    sourceFile: string,
    options: { isImported?: boolean; isExported?: boolean } = {}
  ): JavaScriptSymbol {
    const range = this.getNodeRange(node);
    const location = { filePath: sourceFile, range };

    const baseSymbol = createSymbol(name, type, location, undefined, []);

    return {
      ...baseSymbol,
      babelNode: node,
      isImported: options.isImported,
      isExported: options.isExported
    };
  }

  private extractImportDependency(
    node: babel.ImportDeclaration,
    dependencies: Dependency[],
    sourceFile: string
  ): void {
    const target = node.source.value;
    const range = this.getNodeRange(node);
    const location = { filePath: sourceFile, range };

    const dependency = createDependency(
      target,
      DependencyType.Import,
      isRelativePath(target),
      getImportedSymbols(node)
    );

    dependencies.push(dependency);
  }

  private extractExportDependency(
    node: babel.ExportNamedDeclaration | babel.ExportAllDeclaration,
    dependencies: Dependency[],
    sourceFile: string
  ): void {
    if (node.source) {
      const target = node.source.value;
      const range = this.getNodeRange(node);
      const location = { filePath: sourceFile, range };

      const dependency = createDependency(
        target,
        DependencyType.Import,
        isRelativePath(target),
        []
      );

      dependencies.push(dependency);
    }
  }

  private extractCallExpressionDependency(
    node: babel.CallExpression,
    dependencies: Dependency[],
    sourceFile: string
  ): void {
    // 處理 require() 呼叫
    if (babel.isIdentifier(node.callee) && node.callee.name === 'require') {
      const firstArg = node.arguments[0];
      if (babel.isStringLiteral(firstArg)) {
        const target = firstArg.value;
        const range = this.getNodeRange(node);
        const location = { filePath: sourceFile, range };

        const dependency = createDependency(
          target,
          DependencyType.Require,
          isRelativePath(target),
          []
        );

        dependencies.push(dependency);
      }
    }

    // 處理動態 import()
    if (babel.isImport(node.callee)) {
      const firstArg = node.arguments[0];
      if (babel.isStringLiteral(firstArg)) {
        const target = firstArg.value;
        const range = this.getNodeRange(node);
        const location = { filePath: sourceFile, range };

        const dependency = createDependency(
          target,
          DependencyType.Import,
          isRelativePath(target),
          []
        );

        dependencies.push(dependency);
      }
    }
  }

  private isReferenceToSymbol(
    path: any, // Babel traverse path
    symbol: JavaScriptSymbol
  ): boolean {
    // 檢查名稱是否相同且在合理的作用域內，過濾字串和屬性名
    const node = path.node;

    if (!babel.isIdentifier(node)) {
      return false;
    }

    if (node.name !== symbol.name) {
      return false;
    }

    // 🚨 過濾：跳過物件屬性名（key 位置）
    // 例如：{ oldName: value } 中的 oldName 不應被重命名
    const parent = path.parent;
    if (babel.isObjectProperty(parent) && parent.key === node && !parent.computed) {
      return false; // 非計算屬性的 key 不是引用
    }

    // 🚨 過濾：跳過物件方法名
    if (babel.isObjectMethod(parent) && parent.key === node && !parent.computed) {
      return false;
    }

    // 🚨 過濾：跳過類別方法名
    if (babel.isClassMethod(parent) && parent.key === node && !parent.computed) {
      return false;
    }

    // 🚨 過濾：跳過類別屬性名
    if (babel.isClassProperty(parent) && parent.key === node && !parent.computed) {
      return false;
    }

    // 🚨 過濾：跳過 import/export 的字串部分
    // 例如：import { foo as oldName } from 'module' 中的 foo
    if (babel.isImportSpecifier(parent) && parent.imported === node) {
      // imported 是外部名稱，不應重命名（除非是 default）
      // 只有 local 是本地名稱才需要重命名
      return false;
    }

    // 基本的作用域檢查
    // Babel traverse 的 path 已經處理了作用域，字串和註解不會進入這裡
    return true;
  }

  private getReferenceType(
    path: any, // Babel traverse path
    symbol: JavaScriptSymbol
  ): ReferenceType {
    const node = path.node;

    // 如果是符號的原始定義位置
    if (node === symbol.babelNode) {
      return ReferenceType.Definition;
    }

    // 檢查是否為宣告上下文
    if (path.isReferencedIdentifier()) {
      return ReferenceType.Usage;
    }

    if (path.isBindingIdentifier()) {
      return ReferenceType.Declaration;
    }

    return ReferenceType.Usage;
  }

  private symbolTypeToDefinitionKind(symbolType: SymbolType): DefinitionKind {
    switch (symbolType) {
    case SymbolType.Class:
      return 'class';
    case SymbolType.Function:
      return 'function';
    case SymbolType.Variable:
      return 'variable';
    case SymbolType.Constant:
      return 'constant';
    case SymbolType.Type:
      return 'type';
    case SymbolType.Interface:
      return 'interface';
    case SymbolType.Enum:
      return 'enum';
    case SymbolType.Module:
      return 'module';
    case SymbolType.Namespace:
      return 'namespace';
    default:
      return 'variable';
    }
  }

  private async findSymbolAtPosition(ast: JavaScriptAST, position: Position): Promise<Symbol | null> {
    const symbols = await this.extractSymbols(ast);

    // 查找包含該位置的符號
    for (const symbol of symbols) {
      if (this.isPositionInRange(position, symbol.location.range)) {
        return symbol;
      }
    }

    return null;
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

  // ===== 新增：程式碼分析方法 =====

  /**
   * 檢測未使用的符號（JavaScript 基本實作）
   */
  async detectUnusedSymbols(_ast: AST, _allSymbols: Symbol[]): Promise<any[]> {
    // JavaScript 版本暫時返回空結果
    // 未來可以實作類似 TypeScript 的檢測邏輯
    return [];
  }

  /**
   * 分析程式碼複雜度
   */
  async analyzeComplexity(_code: string, _ast: AST): Promise<any> {
    // JavaScript 版本暫時返回簡單結果
    return {
      cyclomaticComplexity: 1,
      cognitiveComplexity: 0,
      evaluation: 'simple',
      functionCount: 0,
      averageComplexity: 0,
      maxComplexity: 0
    };
  }

  /**
   * 提取程式碼片段（用於重複代碼檢測）
   */
  async extractCodeFragments(code: string, filePath: string): Promise<import('../../infrastructure/parser/analysis-types.js').CodeFragment[]> {
    const fragments: import('../../infrastructure/parser/analysis-types.js').CodeFragment[] = [];

    // 1. 提取頂層註解
    const commentFragments = await this.extractTopLevelComments(code, filePath);
    fragments.push(...commentFragments);

    // 2. 提取方法
    const methodFragments = await this.extractMethods(code, filePath);
    fragments.push(...methodFragments);

    // 3. 提取常數定義
    const constantFragments = await this.extractConstants(code, filePath);
    fragments.push(...constantFragments);

    // 4. 提取配置物件
    const configFragments = await this.extractConfigObjects(code, filePath);
    fragments.push(...configFragments);

    return fragments;
  }

  private async extractTopLevelComments(code: string, filePath: string): Promise<import('../../infrastructure/parser/analysis-types.js').CodeFragment[]> {
    const { createHash } = await import('crypto');
    const fragments: import('../../infrastructure/parser/analysis-types.js').CodeFragment[] = [];
    const lines = code.split('\n');

    let commentStart = -1;
    let inBlockComment = false;

    for (let i = 0; i < Math.min(50, lines.length); i++) {
      const line = lines[i].trim();

      if ((line.startsWith('/**') || line.startsWith('/*')) && commentStart === -1) {
        commentStart = i;
        inBlockComment = true;
      }

      if (inBlockComment && line.includes('*/')) {
        const commentEnd = i;
        const commentCode = lines.slice(commentStart, commentEnd + 1).join('\n');
        const lineCount = commentEnd - commentStart + 1;

        if (lineCount >= 3) {
          fragments.push({
            type: 'comment',
            code: commentCode,
            tokens: this.tokenizeCode(commentCode, true),
            location: { filePath, startLine: commentStart + 1, endLine: commentEnd + 1 },
            hash: createHash('md5').update(commentCode).digest('hex')
          });
        }

        commentStart = -1;
        inBlockComment = false;
      }

      if (!inBlockComment && line && !line.startsWith('//') && !line.startsWith('*')) {
        break;
      }
    }

    return fragments;
  }

  private async extractMethods(code: string, filePath: string): Promise<import('../../infrastructure/parser/analysis-types.js').CodeFragment[]> {
    const { createHash } = await import('crypto');
    const fragments: import('../../infrastructure/parser/analysis-types.js').CodeFragment[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 匹配方法定義（支援 ES6+）
      if (/(async\s+)?(function\s+\w+|const\s+\w+\s*=\s*(async\s+)?\([^)]*\)\s*=>|\w+\s*\([^)]*\)\s*{)/.test(line)) {
        let braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        let endLine = i;

        for (let j = i + 1; j < lines.length && braceCount > 0; j++) {
          braceCount += (lines[j].match(/{/g) || []).length;
          braceCount -= (lines[j].match(/}/g) || []).length;
          endLine = j;
        }

        if (endLine > i && (endLine - i + 1) >= 3) {
          const methodCode = lines.slice(i, endLine + 1).join('\n');
          fragments.push({
            type: 'method',
            code: methodCode,
            tokens: this.tokenizeCode(methodCode, false),
            location: { filePath, startLine: i + 1, endLine: endLine + 1 },
            hash: createHash('md5').update(methodCode).digest('hex')
          });
        }
      }
    }

    return fragments;
  }

  private async extractConstants(code: string, filePath: string): Promise<import('../../infrastructure/parser/analysis-types.js').CodeFragment[]> {
    const { createHash } = await import('crypto');
    const fragments: import('../../infrastructure/parser/analysis-types.js').CodeFragment[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 匹配 const/export const XXX = { ... }
      if (/(export\s+)?const\s+\w+\s*=\s*{/.test(line)) {
        let braceCount = 1;
        let endLine = i;

        for (let j = i + 1; j < lines.length && braceCount > 0; j++) {
          braceCount += (lines[j].match(/{/g) || []).length;
          braceCount -= (lines[j].match(/}/g) || []).length;
          endLine = j;
        }

        if (endLine > i && (endLine - i + 1) >= 3) {
          const constantCode = lines.slice(i, endLine + 1).join('\n');
          fragments.push({
            type: 'constant',
            code: constantCode,
            tokens: this.tokenizeCode(constantCode, false),
            location: { filePath, startLine: i + 1, endLine: endLine + 1 },
            hash: createHash('md5').update(constantCode).digest('hex')
          });
        }
      }
    }

    return fragments;
  }

  private async extractConfigObjects(code: string, filePath: string): Promise<import('../../infrastructure/parser/analysis-types.js').CodeFragment[]> {
    const { createHash } = await import('crypto');
    const fragments: import('../../infrastructure/parser/analysis-types.js').CodeFragment[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/config|Config|options|Options/.test(line) && /{/.test(line)) {
        let braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        let endLine = i;

        for (let j = i + 1; j < lines.length && braceCount > 0; j++) {
          braceCount += (lines[j].match(/{/g) || []).length;
          braceCount -= (lines[j].match(/}/g) || []).length;
          endLine = j;
        }

        if (endLine > i && (endLine - i + 1) >= 3) {
          const configCode = lines.slice(i, endLine + 1).join('\n');
          fragments.push({
            type: 'config',
            code: configCode,
            tokens: this.tokenizeCode(configCode, false),
            location: { filePath, startLine: i + 1, endLine: endLine + 1 },
            hash: createHash('md5').update(configCode).digest('hex')
          });
        }
      }
    }

    return fragments;
  }

  private tokenizeCode(code: string, includeComments: boolean): string[] {
    if (includeComments) {
      return code.split(/\s+/).filter(t => t.length > 0);
    }
    const withoutComments = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');
    return withoutComments.split(/\s+/).filter(t => t.length > 0);
  }

  /**
   * 檢測樣板模式
   */
  async detectPatterns(_code: string, _ast: AST): Promise<import('../../infrastructure/parser/analysis-types.js').PatternMatch[]> {
    // JavaScript 可以檢測相同的模式
    return [];
  }

  /**
   * 檢查型別安全問題（JavaScript 無型別系統）
   */
  async checkTypeSafety(_code: string, _ast: AST): Promise<import('../../infrastructure/parser/analysis-types.js').TypeSafetyIssue[]> {
    // JavaScript 沒有型別系統
    return [];
  }

  /**
   * 檢查錯誤處理問題
   */
  async checkErrorHandling(code: string, ast: AST): Promise<import('../../infrastructure/parser/analysis-types.js').ErrorHandlingIssue[]> {
    const issues: import('../../infrastructure/parser/analysis-types.js').ErrorHandlingIssue[] = [];
    const lines = code.split('\n');

    // 檢測空 catch 區塊
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
        issues.push({
          type: 'empty-catch',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: '空的 catch 區塊，應該處理錯誤或記錄日誌',
          severity: 'warning'
        });
      }

      // 檢測靜默吞錯
      if (/catch\s*\([^)]*\)\s*\{[^}]*\/\/\s*(ignore|skip|TODO)[^}]*\}/.test(line)) {
        issues.push({
          type: 'silent-error',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: 'catch 區塊靜默吞錯，只有註解沒有實際處理',
          severity: 'warning'
        });
      }
    }

    return issues;
  }

  /**
   * 檢查安全性問題
   */
  async checkSecurity(code: string, ast: AST): Promise<import('../../infrastructure/parser/analysis-types.js').SecurityIssue[]> {
    const issues: import('../../infrastructure/parser/analysis-types.js').SecurityIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 檢測硬編碼密碼
      if (/(password|passwd|pwd|secret|apiKey|token)\s*[:=]\s*['"][^'"]{3,}['"]/.test(line) &&
          !/(process\.env|config\.|import|require)/.test(line)) {
        issues.push({
          type: 'hardcoded-secret',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: '硬編碼的密碼或密鑰，應使用環境變數',
          severity: 'critical'
        });
      }

      // 檢測 eval 使用
      if (/\beval\s*\(/.test(line)) {
        issues.push({
          type: 'unsafe-eval',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: '使用 eval 可能導致代碼注入風險',
          severity: 'high'
        });
      }

      // 檢測 innerHTML
      if (/\.innerHTML\s*=/.test(line) && !/(DOMPurify|sanitize)/.test(line)) {
        issues.push({
          type: 'xss-vulnerability',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: '直接設定 innerHTML 可能導致 XSS 攻擊',
          severity: 'medium'
        });
      }
    }

    return issues;
  }

  /**
   * 檢查命名規範問題
   */
  async checkNamingConventions(symbols: Symbol[], filePath: string): Promise<import('../../infrastructure/parser/analysis-types.js').NamingIssue[]> {
    const issues: import('../../infrastructure/parser/analysis-types.js').NamingIssue[] = [];

    for (const symbol of symbols) {
      // 檢測底線開頭變數
      if (symbol.name.startsWith('_') && symbol.type === SymbolType.Variable) {
        issues.push({
          type: 'invalid-naming',
          symbolName: symbol.name,
          symbolType: symbol.type,
          location: {
            filePath,
            line: symbol.location.range.start.line,
            column: symbol.location.range.start.column
          },
          message: `變數 "${symbol.name}" 以底線開頭，違反命名規範`
        });
      }
    }

    return issues;
  }

  /**
   * 判斷檔案是否為測試檔案
   */
  isTestFile(filePath: string): boolean {
    return /\.(test|spec)\.(js|jsx|mjs|cjs)$/.test(filePath) ||
           filePath.includes('/__tests__/') ||
           filePath.includes('/__mocks__/');
  }
}