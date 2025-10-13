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
}