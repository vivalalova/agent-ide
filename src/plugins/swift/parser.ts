/**
 * Swift Parser 主類別
 * 使用 web-tree-sitter（WASM 模式）實作 ParserPlugin 介面
 */

import {
  Parser,
  type Node as TreeSitterNode,
  type Language,
  type Query
} from 'web-tree-sitter';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  ParserPlugin,
  CodeEdit,
  Definition,
  Usage,
  ValidationResult
} from '@infrastructure/parser/index.js';
import {
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
  DependencyType,
  createDependency
} from '@shared/types/index.js';
import { createLocation } from '@shared/types/core.js';
import type { SwiftAST, SwiftASTNode } from './types.js';
import {
  SwiftNodeKind,
  tsNodeToRange,
  nodeTypeToKind,
  isValidSwiftIdentifier,
  isSwiftTestFile
} from './types.js';
import { createSwiftSymbolExtractor, type SwiftSymbolExtractor } from './symbol-extractor.js';

/** 當前模組目錄路徑 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** WASM 檔案路徑 */
const WASM_PATH = path.join(__dirname, 'wasm', 'tree-sitter-swift.wasm');

/**
 * Swift Parser 實作
 * 實作 ParserPlugin 介面，提供完整的 Swift 語言支援
 */
export class SwiftParser implements ParserPlugin {
  /** 插件名稱 */
  public readonly name = 'swift';

  /** 插件版本 */
  public readonly version = '1.0.0';

  /** 支援的副檔名 */
  public readonly supportedExtensions = ['.swift'] as const;

  /** 支援的語言 */
  public readonly supportedLanguages = ['swift'] as const;

  /** Tree-sitter Parser 實例 */
  private parser: Parser | null = null;

  /** Swift 語言模組 */
  private swiftLanguage: Language | null = null;

  /** 符號提取器 */
  private symbolExtractor: SwiftSymbolExtractor | null = null;

  /** 是否已初始化 */
  private initialized = false;

  /**
   * 建立 SwiftParser 實例
   */
  constructor() {
    // 延遲初始化，在首次使用時才載入 WASM
  }

  /**
   * 確保 Parser 已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 初始化 web-tree-sitter
    await (Parser as any).init();

    // 建立 Parser 實例
    const parser = new (Parser as any)() as Parser;

    // 載入 Swift 語言 WASM
    this.swiftLanguage = await (Parser as any).Language.load(WASM_PATH);
    parser.setLanguage(this.swiftLanguage);
    this.parser = parser;

    // 建立符號提取器（傳入 this 作為 adapter）
    this.symbolExtractor = createSwiftSymbolExtractor(this);

    this.initialized = true;
  }

  /**
   * 解析 Swift 程式碼並生成 AST
   * @param code 原始程式碼
   * @param filePath 檔案路徑
   * @returns 解析後的 AST
   * @throws ParseError 當解析失敗時
   */
  async parse(code: string, filePath: string): Promise<AST> {
    this.validateInput(code, filePath);
    await this.ensureInitialized();

    if (!this.parser) {
      throw new Error('Tree-sitter Parser 未初始化');
    }

    const startTime = Date.now();

    // 使用 tree-sitter 解析程式碼
    const tree = this.parser.parse(code);
    if (!tree) {
      throw new Error('解析失敗：無法建立語法樹');
    }
    const rootTsNode = tree.rootNode;

    // 轉換為內部 AST 結構
    const rootNode = this.createSwiftASTNode(rootTsNode);
    const parseTime = Date.now() - startTime;

    const metadata = createASTMetadata(
      'swift',
      this.version,
      { treeSitterVersion: this.getVersion() },
      parseTime,
      0 // 會在 createAST 中計算
    );

    const baseAST = createAST(filePath, rootNode, metadata);
    const swiftAST: SwiftAST = {
      ...baseAST,
      root: rootNode,
      tree
    };

    return swiftAST;
  }

  /**
   * 從 AST 中提取所有符號
   * @param ast AST 物件
   * @returns 符號列表
   */
  async extractSymbols(ast: AST): Promise<Symbol[]> {
    await this.ensureInitialized();

    if (!this.symbolExtractor) {
      throw new Error('符號提取器未初始化');
    }

    const swiftAST = ast as SwiftAST;
    return await this.symbolExtractor.extractSymbols(swiftAST.tree, swiftAST.sourceFile);
  }

  /**
   * 查找符號的所有引用
   * @param ast AST 物件
   * @param symbol 目標符號
   * @returns 引用列表
   */
  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    await this.ensureInitialized();

    const swiftAST = ast as SwiftAST;
    const references: Reference[] = [];
    const symbolName = symbol.name;

    // 遍歷 tree-sitter 節點查找所有標識符
    this.traverseForReferences(
      swiftAST.tree.rootNode,
      symbolName,
      symbol,
      swiftAST.sourceFile,
      references
    );

    return references;
  }

  /**
   * 從 AST 中提取所有依賴關係
   * @param ast AST 物件
   * @returns 依賴列表
   */
  async extractDependencies(ast: AST): Promise<Dependency[]> {
    await this.ensureInitialized();

    const swiftAST = ast as SwiftAST;
    const dependencies: Dependency[] = [];

    // 遍歷找出所有 import 宣告
    this.traverseForImports(swiftAST.tree.rootNode, dependencies);

    return dependencies;
  }

  /**
   * 重新命名符號
   * @param ast AST 物件
   * @param position 重命名位置
   * @param newName 新名稱
   * @returns 程式碼編輯操作列表
   */
  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    this.validateRenameInput(newName);
    await this.ensureInitialized();

    const swiftAST = ast as SwiftAST;

    // 查找位置上的符號
    const symbol = await this.findSymbolAtPosition(swiftAST, position);
    if (!symbol) {
      throw new Error('在指定位置找不到符號');
    }

    // 查找所有引用
    const references = await this.findReferences(ast, symbol);

    // 建立編輯操作
    const edits: CodeEdit[] = references.map(ref =>
      createCodeEdit(
        ref.location.filePath,
        ref.location.range,
        newName,
        'rename'
      )
    );

    return edits;
  }

  /**
   * 提取函式重構
   * @param ast AST 物件
   * @param selection 選取的程式碼範圍
   * @returns 程式碼編輯操作列表
   */
  async extractFunction(_ast: AST, _selection: Range): Promise<CodeEdit[]> {
    // 提取函式重構是複雜的操作，目前提供基本實作
    throw new Error('提取函式重構尚未實作');
  }

  /**
   * 查找符號定義
   * @param ast AST 物件
   * @param position 查找位置
   * @returns 定義資訊，如果找不到則返回 null
   */
  async findDefinition(ast: AST, position: Position): Promise<Definition | null> {
    await this.ensureInitialized();

    const swiftAST = ast as SwiftAST;

    // 查找位置上的符號
    const symbol = await this.findSymbolAtPosition(swiftAST, position);
    if (!symbol) {
      return null;
    }

    return createDefinition(
      symbol.location,
      this.symbolTypeToDefinitionKind(symbol.type)
    );
  }

  /**
   * 查找符號的所有使用位置
   * @param ast AST 物件
   * @param symbol 目標符號
   * @returns 使用位置列表
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
   * @returns 驗證結果
   */
  async validate(): Promise<ValidationResult> {
    try {
      await this.ensureInitialized();

      if (!this.parser) {
        return createValidationFailure([{
          code: 'SWIFT_PARSER_UNAVAILABLE',
          message: 'Tree-sitter Swift Parser 不可用',
          location: {
            filePath: '',
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 1, offset: 0 }
            }
          }
        }]);
      }

      // 測試解析簡單程式碼
      const testCode = 'let x = 1';
      const tree = this.parser.parse(testCode);
      if (!tree || !tree.rootNode) {
        return createValidationFailure([{
          code: 'SWIFT_PARSE_ERROR',
          message: '測試解析失敗',
          location: {
            filePath: '',
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 1, offset: 0 }
            }
          }
        }]);
      }

      return createValidationSuccess();
    } catch (error) {
      return createValidationFailure([{
        code: 'SWIFT_VALIDATION_ERROR',
        message: `驗證失敗: ${error instanceof Error ? error.message : String(error)}`,
        location: {
          filePath: '',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 1, offset: 0 }
          }
        }
      }]);
    }
  }

  /**
   * 清理資源
   * 釋放插件使用的所有資源
   */
  async dispose(): Promise<void> {
    if (this.parser) {
      this.parser.delete();
      this.parser = null;
    }

    this.swiftLanguage = null;
    this.symbolExtractor = null;
    this.initialized = false;
  }

  /**
   * 獲取 Swift 特定的排除模式
   * @returns 排除模式列表（glob patterns）
   */
  getDefaultExcludePatterns(): string[] {
    return [
      '.build/**',
      'DerivedData/**',
      '.swiftpm/**',
      'Pods/**',
      'Carthage/**',
      '**/*.generated.swift'
    ];
  }

  /**
   * 判斷是否應該忽略特定檔案
   * @param filePath 檔案路徑
   * @returns true 表示應該忽略此檔案
   */
  shouldIgnoreFile(filePath: string): boolean {
    const patterns = this.getDefaultExcludePatterns();
    const normalizedPath = filePath.replace(/^\.?\//, '');

    return patterns.some(pattern => {
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
    });
  }

  /**
   * 判斷符號是否為抽象宣告
   * Swift 的抽象宣告：protocol、class、struct、enum、func、typealias
   * @param symbol 要判斷的符號
   * @returns true 表示此符號是抽象宣告
   */
  isAbstractDeclaration(symbol: Symbol): boolean {
    const abstractTypes = [
      SymbolType.Protocol,
      SymbolType.Class,
      SymbolType.Struct,
      SymbolType.Enum,
      SymbolType.Function,
      SymbolType.Type
    ];

    return abstractTypes.includes(symbol.type);
  }

  /**
   * 判斷檔案是否為測試檔案
   * @param filePath 檔案路徑
   * @returns true 表示此檔案是測試檔案
   */
  isTestFile(filePath: string): boolean {
    return isSwiftTestFile(filePath);
  }

  // ===== Tree-sitter Adapter 介面（供 SwiftSymbolExtractor 使用）=====

  /**
   * 建立 Query 物件
   * @param queryString Query 字串
   * @returns Query 物件
   */
  async createQuery(queryString: string): Promise<Query> {
    await this.ensureInitialized();

    if (!this.swiftLanguage) {
      throw new Error('Swift 語言模組未初始化');
    }

    return this.swiftLanguage.query(queryString);
  }

  /**
   * 取得 Parser 版本
   * @returns 版本字串
   */
  getVersion(): string {
    return this.swiftLanguage?.version?.toString() || '0.0.0';
  }

  // ===== 私有輔助方法 =====

  /**
   * 驗證輸入參數
   */
  private validateInput(code: string, filePath: string): void {
    if (!code.trim()) {
      throw new Error('程式碼內容不能為空');
    }

    if (!filePath.trim()) {
      throw new Error('檔案路徑不能為空');
    }
  }

  /**
   * 驗證重命名輸入
   */
  private validateRenameInput(newName: string): void {
    if (!newName.trim()) {
      throw new Error('新名稱不能為空');
    }

    if (!isValidSwiftIdentifier(newName)) {
      throw new Error('新名稱必須是有效的 Swift 識別符');
    }
  }

  /**
   * 建立 SwiftASTNode
   * @param tsNode tree-sitter 節點
   * @returns SwiftASTNode
   */
  private createSwiftASTNode(tsNode: TreeSitterNode): SwiftASTNode {
    const range = tsNodeToRange(tsNode);
    const children: SwiftASTNode[] = [];

    for (let i = 0; i < tsNode.childCount; i++) {
      const child = tsNode.child(i);
      if (child) {
        children.push(this.createSwiftASTNode(child));
      }
    }

    const node: SwiftASTNode = {
      type: tsNode.type,
      range,
      properties: {
        text: tsNode.text,
        isNamed: tsNode.isNamed
      },
      children,
      treeSitterNode: tsNode,
      swiftKind: nodeTypeToKind(tsNode.type)
    };

    // 設定子節點的 parent 關係
    for (const child of children) {
      (child as any).parent = node;
    }

    return node;
  }

  /**
   * 遍歷 AST 查找符號引用
   */
  private traverseForReferences(
    node: TreeSitterNode,
    symbolName: string,
    targetSymbol: Symbol,
    filePath: string,
    references: Reference[]
  ): void {
    // 檢查節點是否為標識符
    if (this.isIdentifierNodeType(node.type) && node.text === symbolName) {
      const range = tsNodeToRange(node);

      // 判斷是定義還是使用
      const refType = this.isDefinitionNodeType(node.parent?.type || '')
        ? ReferenceType.Definition
        : ReferenceType.Usage;

      references.push({
        symbol: targetSymbol,
        location: createLocation(filePath, range),
        type: refType
      });
    }

    // 遞歸遍歷子節點
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.traverseForReferences(child, symbolName, targetSymbol, filePath, references);
      }
    }
  }

  /**
   * 遍歷 AST 查找 import 宣告
   */
  private traverseForImports(
    node: TreeSitterNode,
    dependencies: Dependency[]
  ): void {
    if (node.type === SwiftNodeKind.ImportDeclaration) {
      const importPath = this.extractImportPath(node);
      if (importPath) {
        dependencies.push(createDependency(
          importPath,
          DependencyType.Import,
          false, // Swift import 通常不是相對路徑
          []
        ));
      }
    }

    // 遞歸遍歷子節點
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.traverseForImports(child, dependencies);
      }
    }
  }

  /**
   * 從 import 節點提取模組路徑
   */
  private extractImportPath(importNode: TreeSitterNode): string | null {
    // 尋找 import_path 或 identifier 子節點
    for (let i = 0; i < importNode.childCount; i++) {
      const child = importNode.child(i);
      if (child) {
        if (child.type === 'import_path' || child.type === 'identifier') {
          return child.text;
        }
        if (child.type === 'simple_identifier') {
          return child.text;
        }
      }
    }

    return null;
  }

  /**
   * 檢查節點類型是否為標識符
   */
  private isIdentifierNodeType(nodeType: string): boolean {
    return nodeType === 'identifier'
      || nodeType === 'simple_identifier'
      || nodeType === 'type_identifier';
  }

  /**
   * 檢查父節點類型是否為定義
   */
  private isDefinitionNodeType(parentType: string): boolean {
    const definitionTypes = [
      SwiftNodeKind.ClassDeclaration,
      SwiftNodeKind.StructDeclaration,
      SwiftNodeKind.EnumDeclaration,
      SwiftNodeKind.ProtocolDeclaration,
      SwiftNodeKind.FunctionDeclaration,
      SwiftNodeKind.PropertyDeclaration,
      SwiftNodeKind.ConstantDeclaration,
      SwiftNodeKind.VariableDeclaration,
      SwiftNodeKind.TypealiasDeclaration
    ];

    return definitionTypes.includes(parentType as SwiftNodeKind);
  }

  /**
   * 在指定位置查找符號
   */
  private async findSymbolAtPosition(ast: SwiftAST, position: Position): Promise<Symbol | null> {
    const symbols = await this.extractSymbols(ast);

    for (const symbol of symbols) {
      if (this.isPositionInRange(position, symbol.location.range)) {
        return symbol;
      }
    }

    return null;
  }

  /**
   * 檢查位置是否在範圍內
   */
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
   * 將 SymbolType 轉換為 DefinitionKind
   */
  private symbolTypeToDefinitionKind(symbolType: SymbolType): any {
    const mapping: Record<SymbolType, string> = {
      [SymbolType.Class]: 'class',
      [SymbolType.Interface]: 'interface',
      [SymbolType.Protocol]: 'interface',
      [SymbolType.Struct]: 'class',
      [SymbolType.Function]: 'function',
      [SymbolType.Variable]: 'variable',
      [SymbolType.Constant]: 'constant',
      [SymbolType.Property]: 'variable',
      [SymbolType.Type]: 'type',
      [SymbolType.Enum]: 'enum',
      [SymbolType.Module]: 'module',
      [SymbolType.Namespace]: 'namespace'
    };

    return mapping[symbolType] ?? 'variable';
  }
}

/**
 * 建立 SwiftParser 實例的工廠函式
 */
export function createSwiftParser(): SwiftParser {
  return new SwiftParser();
}

/**
 * TreeSitterAdapter 介面
 * 供 SwiftSymbolExtractor 使用
 */
export interface TreeSitterAdapter {
  /**
   * 建立 Query 物件
   */
  createQuery(queryString: string): Promise<Query>;

  /**
   * 取得版本
   */
  getVersion(): string;
}
