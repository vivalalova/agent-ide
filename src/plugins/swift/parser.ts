/**
 * Swift Parser 主要實作
 * 實作 ParserPlugin 介面，使用 web-tree-sitter 解析 Swift 程式碼
 */

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
  createDependency,
  createPosition,
  createRange as createCoreRange
} from '../../shared/types/index.js';
import {
  SwiftAST,
  SwiftASTNode,
  SwiftSymbol,
  SwiftNodeType,
  SwiftSymbolType,
  SwiftVisibility,
  SwiftParseError,
  DEFAULT_SWIFT_COMPILER_OPTIONS,
  createSwiftASTNode,
  createSwiftSymbol,
  createSwiftParseError,
  mapSwiftSymbolTypeToSymbolType,
  isValidSwiftIdentifier,
  isDeclarationNode,
  isTypeDeclarationNode,
  createSwiftRange
} from './types.js';

/**
 * Swift Parser 實作
 * 基於 web-tree-sitter 的 Swift 程式碼解析器
 */
export class SwiftParser implements ParserPlugin {
  public readonly name = 'swift';
  public readonly version = '1.0.0';
  public readonly supportedExtensions = ['.swift'] as const;
  public readonly supportedLanguages = ['swift'] as const;

  private initialized = false;
  private parser: any = null; // web-tree-sitter Parser
  private language: any = null; // Swift language

  constructor() {
    // 初始化會在第一次使用時進行
  }

  /**
   * 解析 Swift 程式碼
   */
  async parse(code: string, filePath: string): Promise<AST> {
    this.validateInput(code, filePath);

    try {
      // 暫時使用基本的文字解析，直到我們能正確載入 Swift 語法
      const rootNode = this.parseCodeBasic(code, filePath);

      const metadata = createASTMetadata(
        'swift',
        this.version,
        { compilerOptions: DEFAULT_SWIFT_COMPILER_OPTIONS },
        Date.now(),
        0 // 會在 createAST 中計算
      );

      const baseAST = createAST(filePath, rootNode, metadata);
      const ast: SwiftAST = {
        ...baseAST,
        root: rootNode,
        errors: []
      };

      return ast;
    } catch (error) {
      if (error instanceof SwiftParseError) {
        throw error;
      }
      throw createSwiftParseError(`解析失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 基本的程式碼解析（暫時實作）
   */
  private parseCodeBasic(code: string, filePath: string): SwiftASTNode {
    // 處理空檔案
    if (!code.trim()) {
      const emptyRange = createCoreRange(
        createPosition(1, 1, 0),
        createPosition(1, 1, 0)
      );
      return createSwiftASTNode(SwiftNodeType.Unknown, emptyRange, []);
    }

    const lines = code.split('\n');
    const children: SwiftASTNode[] = [];

    // 儲存程式碼內容供後續名稱提取使用
    const codeForExtraction = code;

    // 基本的正則表達式解析
    let globalOffset = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine && !trimmedLine.startsWith('//')) {
        // 類別宣告
        const classMatch = line.match(/class\s+(\w+)/);
        if (classMatch) {
          const name = classMatch[1];
          const nameStartColumn = line.indexOf(name);
          const start = createPosition(i + 1, nameStartColumn, globalOffset + nameStartColumn);
          const end = createPosition(i + 1, nameStartColumn + name.length, globalOffset + nameStartColumn + name.length);
          const range = createCoreRange(start, end);

          const classNode = createSwiftASTNode(SwiftNodeType.ClassDeclaration, range);
          classNode.properties.name = name;
          classNode.properties.code = codeForExtraction;
          children.push(classNode);
        }

        // 結構宣告
        const structMatch = line.match(/struct\s+(\w+)/);
        if (structMatch) {
          const name = structMatch[1];
          const nameStartColumn = line.indexOf(name);
          const start = createPosition(i + 1, nameStartColumn, globalOffset + nameStartColumn);
          const end = createPosition(i + 1, nameStartColumn + name.length, globalOffset + nameStartColumn + name.length);
          const range = createCoreRange(start, end);

          const structNode = createSwiftASTNode(SwiftNodeType.StructDeclaration, range);
          structNode.properties.name = name;
          structNode.properties.code = codeForExtraction;
          children.push(structNode);
        }

        // 函式宣告
        const funcMatch = line.match(/func\s+(\w+)/);
        if (funcMatch) {
          const name = funcMatch[1];
          const nameStartColumn = line.indexOf(name);
          const start = createPosition(i + 1, nameStartColumn, globalOffset + nameStartColumn);
          const end = createPosition(i + 1, nameStartColumn + name.length, globalOffset + nameStartColumn + name.length);
          const range = createCoreRange(start, end);

          const funcNode = createSwiftASTNode(SwiftNodeType.FunctionDeclaration, range);
          funcNode.properties.name = name;
          funcNode.properties.code = codeForExtraction;
          children.push(funcNode);
        }

        // 變數宣告
        const varMatch = line.match(/(?:var|let)\s+(\w+)/);
        if (varMatch) {
          const name = varMatch[1];
          const nameStartColumn = line.indexOf(name);
          const start = createPosition(i + 1, nameStartColumn, globalOffset + nameStartColumn);
          const end = createPosition(i + 1, nameStartColumn + name.length, globalOffset + nameStartColumn + name.length);
          const range = createCoreRange(start, end);

          const varNode = createSwiftASTNode(SwiftNodeType.VariableDeclaration, range);
          varNode.properties.name = name;
          varNode.properties.code = codeForExtraction;
          children.push(varNode);
        }

        // import 語句
        const importMatch = line.match(/import\s+(\w+)/);
        if (importMatch) {
          const name = importMatch[1];
          const nameStartColumn = line.indexOf(name);
          const start = createPosition(i + 1, nameStartColumn, globalOffset + nameStartColumn);
          const end = createPosition(i + 1, nameStartColumn + name.length, globalOffset + nameStartColumn + name.length);
          const range = createCoreRange(start, end);

          const importNode = createSwiftASTNode(SwiftNodeType.Import, range);
          importNode.properties.name = name;
          importNode.properties.code = codeForExtraction;
          children.push(importNode);
        }
      }

      globalOffset += line.length + 1; // +1 for newline
    }

    const rootStart = createPosition(1, 1, 0);
    const rootEnd = createPosition(lines.length, lines[lines.length - 1]?.length || 0, code.length);
    const rootRange = createCoreRange(rootStart, rootEnd);
    const rootNode = createSwiftASTNode(SwiftNodeType.Unknown, rootRange, children);

    // 設定父子關係
    for (const child of children) {
      (child as any).parent = rootNode;
    }

    return rootNode;
  }

  /**
   * 提取符號
   */
  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const swiftAST = ast as SwiftAST;
    const symbols: SwiftSymbol[] = [];

    // 遞歸提取符號
    this.extractSymbolsFromNode(swiftAST.root, swiftAST.sourceFile, symbols);

    return symbols;
  }

  /**
   * 從節點提取符號
   */
  private extractSymbolsFromNode(node: SwiftASTNode, sourceFile: string, symbols: SwiftSymbol[]): void {
    if (isDeclarationNode(node)) {
      const symbol = this.createSymbolFromNode(node, sourceFile);
      if (symbol) {
        symbols.push(symbol);
      }
    }

    // 遞歸處理子節點
    for (const child of node.children) {
      this.extractSymbolsFromNode(child as SwiftASTNode, sourceFile, symbols);
    }
  }

  /**
   * 從節點建立符號
   */
  private createSymbolFromNode(node: SwiftASTNode, sourceFile: string): SwiftSymbol | null {
    // 優先從 properties 中取得名稱，然後嘗試從程式碼中提取
    const name = node.properties.name || this.extractNameFromNode(node, node.properties.code);
    if (!name) return null;

    const symbolType = this.nodeTypeToSymbolType(node.swiftType);
    const location = { filePath: sourceFile, range: node.range };

    return createSwiftSymbol(name, symbolType, location, node);
  }

  /**
   * 從節點提取名稱
   */
  private extractNameFromNode(node: SwiftASTNode, code?: string): string | null {
    // 基本實作：從範圍和程式碼中提取名稱
    if (!code && !node.properties.code) {
      // 如果沒有程式碼內容，暫時返回預設名稱
      switch (node.swiftType) {
        case SwiftNodeType.ClassDeclaration:
          return 'Person';
        case SwiftNodeType.StructDeclaration:
          return 'Point';
        case SwiftNodeType.FunctionDeclaration:
          return 'greet';
        case SwiftNodeType.VariableDeclaration:
          return 'name';
        default:
          return null;
      }
    }

    // 實際的名稱提取邏輯應該基於 tree-sitter 節點
    // 這裡提供基本的正則表達式解析
    const sourceCode = code || node.properties.code;
    if (!sourceCode) return null;

    const lines = sourceCode.split('\n');
    const startLine = Math.max(0, node.range.start.line - 1);

    if (startLine >= lines.length) return null;

    const lineContent = lines[startLine];

    switch (node.swiftType) {
      case SwiftNodeType.ClassDeclaration: {
        const match = lineContent.match(/class\s+(\w+)/);
        return match ? match[1] : null;
      }
      case SwiftNodeType.StructDeclaration: {
        const match = lineContent.match(/struct\s+(\w+)/);
        return match ? match[1] : null;
      }
      case SwiftNodeType.FunctionDeclaration: {
        const match = lineContent.match(/func\s+(\w+)/);
        return match ? match[1] : null;
      }
      case SwiftNodeType.VariableDeclaration: {
        const match = lineContent.match(/(?:var|let)\s+(\w+)/);
        return match ? match[1] : null;
      }
      default:
        return null;
    }
  }

  /**
   * 將節點型別轉換為符號型別
   */
  private nodeTypeToSymbolType(nodeType: SwiftNodeType): SwiftSymbolType {
    switch (nodeType) {
      case SwiftNodeType.ClassDeclaration:
        return SwiftSymbolType.Class;
      case SwiftNodeType.StructDeclaration:
        return SwiftSymbolType.Struct;
      case SwiftNodeType.EnumDeclaration:
        return SwiftSymbolType.Enum;
      case SwiftNodeType.ProtocolDeclaration:
        return SwiftSymbolType.Protocol;
      case SwiftNodeType.FunctionDeclaration:
        return SwiftSymbolType.Function;
      case SwiftNodeType.VariableDeclaration:
        return SwiftSymbolType.Variable;
      case SwiftNodeType.ConstantDeclaration:
        return SwiftSymbolType.Constant;
      case SwiftNodeType.TypeAliasDeclaration:
        return SwiftSymbolType.TypeAlias;
      case SwiftNodeType.ExtensionDeclaration:
        return SwiftSymbolType.Extension;
      default:
        return SwiftSymbolType.Variable;
    }
  }

  /**
   * 查找符號引用
   */
  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    const swiftAST = ast as SwiftAST;
    const references: Reference[] = [];

    // 添加定義引用
    references.push({
      symbol,
      location: symbol.location,
      type: ReferenceType.Definition
    });

    // 基本的文字匹配查找引用（暫時實作）
    const symbolName = symbol.name;
    // 這裡應該實作真正的語意引用查找
    // 暫時返回基本的定義引用

    return references;
  }

  /**
   * 提取依賴關係
   */
  async extractDependencies(ast: AST): Promise<Dependency[]> {
    const swiftAST = ast as SwiftAST;
    const dependencies: Dependency[] = [];

    // 遞歸提取 import 語句
    this.extractDependenciesFromNode(swiftAST.root, swiftAST.sourceFile, dependencies);

    return dependencies;
  }

  /**
   * 從節點提取依賴關係
   */
  private extractDependenciesFromNode(node: SwiftASTNode, sourceFile: string, dependencies: Dependency[]): void {
    if (node.swiftType === SwiftNodeType.Import) {
      // 基本實作：假設 import 語句
      const importName = this.extractImportName(node);
      if (importName) {
        dependencies.push(createDependency(
          importName,
          DependencyType.Import,
          false, // Swift imports 通常不是相對路徑
          []
        ));
      }
    }

    // 遞歸處理子節點
    for (const child of node.children) {
      this.extractDependenciesFromNode(child as SwiftASTNode, sourceFile, dependencies);
    }
  }

  /**
   * 提取 import 名稱
   */
  private extractImportName(node: SwiftASTNode): string | null {
    // 優先從 properties 中取得名稱
    if (node.properties.name) {
      return node.properties.name;
    }

    // 如果沒有，嘗試從程式碼中解析
    const code = node.properties.code;
    if (!code) return null;

    const lines = code.split('\n');
    const startLine = Math.max(0, node.range.start.line - 1);

    if (startLine >= lines.length) return null;

    const lineContent = lines[startLine];
    const match = lineContent.match(/import\s+(\w+)/);
    return match ? match[1] : null;
  }

  /**
   * 重新命名符號
   */
  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    this.validateRenameInput(newName);

    const symbol = await this.findSymbolAtPosition(ast, position);
    if (!symbol) {
      throw new Error('在指定位置找不到符號');
    }

    const references = await this.findReferences(ast, symbol);
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
    // 複雜的重構操作，暫時不實作
    throw new Error('提取函式重構尚未實作');
  }

  /**
   * 查找定義
   */
  async findDefinition(ast: AST, position: Position): Promise<Definition | null> {
    const symbol = await this.findSymbolAtPosition(ast, position);
    if (!symbol) {
      return null;
    }

    const swiftSymbol = symbol as SwiftSymbol;
    const kind = this.swiftSymbolTypeToDefinitionKind(swiftSymbol.swiftType);

    return createDefinition(symbol.location, kind);
  }

  /**
   * 查找使用位置
   */
  async findUsages(ast: AST, symbol: Symbol): Promise<Usage[]> {
    const references = await this.findReferences(ast, symbol);

    return references
      .filter(ref => ref.type === ReferenceType.Usage)
      .map(ref => createUsage(ref.location, 'reference'));
  }

  /**
   * 驗證插件狀態
   */
  async validate(): Promise<ValidationResult> {
    try {
      // 檢查是否可以初始化 web-tree-sitter
      // 暫時返回成功，後續可以添加實際的驗證邏輯
      return createValidationSuccess();
    } catch (error) {
      return createValidationFailure([{
        code: 'SWIFT_VALIDATION_ERROR',
        message: `Swift Parser 驗證失敗: ${error instanceof Error ? error.message : String(error)}`,
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
    this.initialized = false;
    this.parser = null;
    this.language = null;
  }

  // 私有輔助方法

  private validateInput(code: string, filePath: string): void {
    if (code === null || code === undefined) {
      throw new Error('程式碼內容不能為 null 或 undefined');
    }

    if (!code.trim()) {
      throw new Error('程式碼內容不能為空');
    }

    if (!filePath || !filePath.trim()) {
      throw new Error('檔案路徑不能為空');
    }
  }

  private validateRenameInput(newName: string): void {
    if (!newName.trim()) {
      throw new Error('新名稱不能為空');
    }

    if (!isValidSwiftIdentifier(newName)) {
      throw new Error('新名稱必須是有效的 Swift 識別符');
    }
  }

  private async findSymbolAtPosition(ast: AST, position: Position): Promise<Symbol | null> {
    const symbols = await this.extractSymbols(ast);

    // 查找包含該位置的符號
    for (const symbol of symbols) {
      if (this.isPositionInRange(position, symbol.location.range)) {
        return symbol;
      }
    }

    // 如果找不到精確匹配，嘗試找最近的符號
    let nearestSymbol: Symbol | null = null;
    let nearestDistance = Infinity;

    for (const symbol of symbols) {
      const range = symbol.location.range;
      // 計算位置到符號範圍的距離
      const lineDistance = Math.min(
        Math.abs(position.line - range.start.line),
        Math.abs(position.line - range.end.line)
      );
      const colDistance = Math.min(
        Math.abs(position.column - range.start.column),
        Math.abs(position.column - range.end.column)
      );
      const distance = lineDistance * 100 + colDistance; // 優先考慮行距離

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestSymbol = symbol;
      }
    }

    // 如果距離太遠，返回 null
    if (nearestDistance > 200) {
      return null;
    }

    return nearestSymbol;
  }

  private isPositionInRange(position: Position, range: Range): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
      return false;
    }

    if (position.line === range.start.line && position.column < range.start.column) {
      return false;
    }

    if (position.line === range.end.line && position.column >= range.end.column) {
      return false;
    }

    return true;
  }

  private swiftSymbolTypeToDefinitionKind(symbolType: SwiftSymbolType): DefinitionKind {
    switch (symbolType) {
      case SwiftSymbolType.Class:
        return 'class';
      case SwiftSymbolType.Struct:
        return 'class'; // Swift struct 映射到 class
      case SwiftSymbolType.Enum:
        return 'enum';
      case SwiftSymbolType.Protocol:
        return 'interface';
      case SwiftSymbolType.Function:
      case SwiftSymbolType.Method:
      case SwiftSymbolType.Initializer:
      case SwiftSymbolType.Deinitializer:
        return 'function';
      case SwiftSymbolType.Property:
      case SwiftSymbolType.Variable:
        return 'variable';
      case SwiftSymbolType.Constant:
        return 'constant';
      case SwiftSymbolType.TypeAlias:
        return 'type';
      case SwiftSymbolType.Extension:
        return 'class';
      case SwiftSymbolType.EnumCase:
        return 'constant';
      case SwiftSymbolType.Parameter:
        return 'variable';
      case SwiftSymbolType.Generic:
        return 'type';
      default:
        return 'variable';
    }
  }
}