/**
 * JavaScript Parser 主要實作
 * 實作 ParserPlugin 介面
 */

import { parse as babelParse } from '@babel/parser';
import * as babel from '@babel/types';
import babelTraverse, { NodePath } from '@babel/traverse';

// Handle both ESM and CJS module formats
const traverse = (babelTraverse as any).default || babelTraverse;

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
  createReference
} from '@shared/types/index.js';
import {
  JavaScriptAST,
  JavaScriptSymbol,
  JavaScriptParseOptions,
  DEFAULT_PARSE_OPTIONS,
  JavaScriptParseError,
  createJavaScriptASTNode,
  createParseError,
  babelLocationToPosition,
  isValidIdentifier,
  getPluginsForFile
} from './types.js';
import {
  extractFunctionSymbol,
  extractClassSymbol,
  extractVariableSymbol,
  extractImportSymbol,
  extractMethodSymbol,
  extractPropertySymbol,
  extractObjectMethodSymbol,
  extractObjectPropertySymbol
} from './symbol-extractor.js';
import {
  extractImportDependency,
  extractExportDependency,
  extractCallExpressionDependency
} from './dependency-extractor.js';
import {
  checkErrorHandling,
  checkSecurity,
  checkNamingConventions,
  extractCodeFragments
} from './code-analyzer.js';
import type {
  CodeFragment,
  ErrorHandlingIssue,
  SecurityIssue,
  NamingIssue,
  PatternMatch,
  TypeSafetyIssue
} from '@infrastructure/parser/analysis-types.js';

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
      FunctionDeclaration: (path: NodePath<babel.FunctionDeclaration>) => {
        extractFunctionSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ClassDeclaration: (path: NodePath<babel.ClassDeclaration>) => {
        extractClassSymbol(path.node, symbols, typedAst.sourceFile);
      },

      VariableDeclarator: (path: NodePath<babel.VariableDeclarator>) => {
        extractVariableSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ImportDefaultSpecifier: (path: NodePath<babel.ImportDefaultSpecifier>) => {
        extractImportSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ImportSpecifier: (path: NodePath<babel.ImportSpecifier>) => {
        extractImportSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ImportNamespaceSpecifier: (path: NodePath<babel.ImportNamespaceSpecifier>) => {
        extractImportSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ClassMethod: (path: NodePath<babel.ClassMethod>) => {
        extractMethodSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ClassProperty: (path: NodePath<babel.ClassProperty>) => {
        extractPropertySymbol(path.node, symbols, typedAst.sourceFile);
      },

      ObjectMethod: (path: NodePath<babel.ObjectMethod>) => {
        extractObjectMethodSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ObjectProperty: (path: NodePath<babel.ObjectProperty>) => {
        extractObjectPropertySymbol(path.node, symbols, typedAst.sourceFile);
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
        extractImportDependency(path.node, dependencies);
      },

      ExportNamedDeclaration: (path: NodePath<babel.ExportNamedDeclaration>) => {
        extractExportDependency(path.node, dependencies);
      },

      ExportAllDeclaration: (path: NodePath<babel.ExportAllDeclaration>) => {
        extractExportDependency(path.node, dependencies);
      },

      CallExpression: (path: NodePath<babel.CallExpression>) => {
        extractCallExpressionDependency(path.node, dependencies);
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
  async extractFunction(_ast: AST, _selection: Range): Promise<CodeEdit[]> {
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
  }

  /**
   * 獲取 JavaScript 特定的排除模式
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
   */
  shouldIgnoreFile(filePath: string): boolean {
    const patterns = this.getDefaultExcludePatterns();
    const normalizedPath = filePath.replace(/^\.?\//, '');

    return patterns.some(pattern => {
      try {
        if (pattern.includes('**')) {
          const simplePattern = pattern.replace(/\*\*/g, '').replace(/\//g, '');
          if (normalizedPath.includes(simplePattern)) {
            return true;
          }
        }

        if (pattern.startsWith('**/')) {
          const suffix = pattern.substring(3);
          if (normalizedPath.endsWith(suffix) || normalizedPath.includes('/' + suffix)) {
            return true;
          }
        }

        return false;
      } catch {
        return false;
      }
    });
  }

  /**
   * 判斷符號是否為抽象宣告
   */
  isAbstractDeclaration(symbol: Symbol): boolean {
    return symbol.type === SymbolType.Class || symbol.type === SymbolType.Function;
  }

  /**
   * 檢測未使用的符號
   */
  async detectUnusedSymbols(_ast: AST, _allSymbols: Symbol[]): Promise<any[]> {
    return [];
  }

  /**
   * 分析程式碼複雜度
   */
  async analyzeComplexity(_code: string, _ast: AST): Promise<any> {
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
  async extractCodeFragments(code: string, filePath: string): Promise<CodeFragment[]> {
    return extractCodeFragments(code, filePath);
  }

  /**
   * 檢測樣板模式
   */
  async detectPatterns(_code: string, _ast: AST): Promise<PatternMatch[]> {
    return [];
  }

  /**
   * 檢查型別安全問題（JavaScript 無型別系統）
   */
  async checkTypeSafety(_code: string, _ast: AST): Promise<TypeSafetyIssue[]> {
    return [];
  }

  /**
   * 檢查錯誤處理問題
   */
  async checkErrorHandling(code: string, ast: AST): Promise<ErrorHandlingIssue[]> {
    return checkErrorHandling(code, ast.sourceFile);
  }

  /**
   * 檢查安全性問題
   */
  async checkSecurity(code: string, ast: AST): Promise<SecurityIssue[]> {
    return checkSecurity(code, ast.sourceFile);
  }

  /**
   * 檢查命名規範問題
   */
  async checkNamingConventions(symbols: Symbol[], filePath: string): Promise<NamingIssue[]> {
    return checkNamingConventions(symbols, filePath);
  }

  /**
   * 判斷檔案是否為測試檔案
   */
  isTestFile(filePath: string): boolean {
    return /\.(test|spec)\.(js|jsx|mjs|cjs)$/.test(filePath)
      || filePath.includes('/__tests__/')
      || filePath.includes('/__mocks__/');
  }

  // ===== 私有輔助方法 =====

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

    return {
      start: { line: 0, column: 0, offset: 0 },
      end: { line: 0, column: 0, offset: 0 }
    };
  }

  private isReferenceToSymbol(
    path: any,
    symbol: JavaScriptSymbol
  ): boolean {
    const node = path.node;

    if (!babel.isIdentifier(node)) {
      return false;
    }

    if (node.name !== symbol.name) {
      return false;
    }

    const parent = path.parent;

    // 過濾：跳過物件屬性名（key 位置）
    if (babel.isObjectProperty(parent) && parent.key === node && !parent.computed) {
      return false;
    }

    // 過濾：跳過物件方法名
    if (babel.isObjectMethod(parent) && parent.key === node && !parent.computed) {
      return false;
    }

    // 過濾：跳過類別方法名
    if (babel.isClassMethod(parent) && parent.key === node && !parent.computed) {
      return false;
    }

    // 過濾：跳過類別屬性名
    if (babel.isClassProperty(parent) && parent.key === node && !parent.computed) {
      return false;
    }

    // 過濾：跳過 import/export 的字串部分
    if (babel.isImportSpecifier(parent) && parent.imported === node) {
      return false;
    }

    return true;
  }

  private getReferenceType(
    path: any,
    symbol: JavaScriptSymbol
  ): ReferenceType {
    const node = path.node;

    if (node === symbol.babelNode) {
      return ReferenceType.Definition;
    }

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
