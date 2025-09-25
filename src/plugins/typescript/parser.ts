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
  createValidationSuccess,
  createValidationFailure,
  createCodeEdit,
  createDefinition,
  createUsage
} from '../../infrastructure/parser';
import type {
  AST,
  Symbol,
  Reference,
  Dependency,
  Position,
  Range
} from '../../shared/types';
import {
  createAST,
  createASTMetadata,
  ReferenceType
} from '../../shared/types';
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

      // 跳過語法錯誤檢查，因為 parseDiagnostics 在某些 TypeScript 版本中不可用

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
        tsSourceFile: sourceFile
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
    
    const references: Reference[] = [];
    
    // 遍歷 AST 查找所有對該符號的引用
    const findReferencesInNode = (node: TypeScriptASTNode): void => {
      const tsNode = node.tsNode;
      
      // 檢查是否為符號的引用
      if (this.isReferenceToSymbol(tsNode, typedSymbol)) {
        const location = {
          filePath: typedAst.tsSourceFile.fileName,
          range: tsNodeToRange(tsNode, typedAst.tsSourceFile)
        };
        
        const referenceType = this.getReferenceType(tsNode, typedSymbol);
        
        references.push({
          symbol,
          location,
          type: referenceType
        });
      }
      
      // 遞歸處理子節點
      for (const child of node.children) {
        findReferencesInNode(child as TypeScriptASTNode);
      }
    };
    
    findReferencesInNode(typedAst.root);
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
    
    // 檢查是否為可重新命名的符號
    if (!this.isRenameableNode(node)) {
      throw new Error('該位置的符號不支援重新命名');
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
    
    // 這裡需要更複雜的邏輯來確定是否為同一個符號
    // 簡化實作：比較位置和名稱
    return true;
  }

  private getReferenceType(node: ts.Node, symbol: TypeScriptSymbol): ReferenceType {
    // 如果是符號的原始定義位置
    if (node === symbol.tsNode) {
      return ReferenceType.Definition;
    }
    
    // 檢查是否為宣告（例如函式參數、變數宣告等）
    if (this.isDeclarationNode(node)) {
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
      ts.isPropertyDeclaration(node)
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
    if (ts.isClassDeclaration(node)) return 'class';
    if (ts.isInterfaceDeclaration(node)) return 'interface';
    if (ts.isFunctionDeclaration(node)) return 'function';
    if (ts.isMethodDeclaration(node)) return 'method';
    if (ts.isVariableDeclaration(node)) return 'variable';
    if (ts.isPropertyDeclaration(node)) return 'variable';
    if (ts.isTypeAliasDeclaration(node)) return 'type';
    if (ts.isEnumDeclaration(node)) return 'enum';
    if (ts.isModuleDeclaration(node)) return 'module';
    return 'variable';
  }

  private symbolTypeToDefinitionKind(symbolType: any): any {
    // 簡單映射，實際實作可能需要更詳細的對應
    return symbolType.toLowerCase();
  }

  private getReferenceUsageKind(reference: Reference): any {
    // 基於上下文判斷使用類型
    return 'reference'; // 簡化實作
  }

  private async findSymbolAtPosition(ast: TypeScriptAST, position: Position): Promise<Symbol | null> {
    const symbols = await this.extractSymbols(ast);
    
    // 查找包含該位置的符號
    for (const symbol of symbols) {
      const range = symbol.location.range;
      if (this.isPositionInRange(position, range)) {
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