/**
 * Python Parser 主類別
 * 實作 ParserPlugin 介面，提供 Python 程式碼解析功能
 */

import type { AST, Symbol, Reference, Dependency, Position, Range } from '@shared/types/index.js';
import { ReferenceType, createReference, SymbolType } from '@shared/types/index.js';
import { BaseParserPlugin } from '@infrastructure/parser/base.js';
import type {
  CodeEdit,
  Definition,
  DefinitionKind,
  Usage,
  ValidationResult,
  ParserCapabilities
} from '@infrastructure/parser/types.js';
import { createValidationSuccess, createValidationFailure, createDefinition, createUsage } from '@infrastructure/parser/types.js';

import { type PythonAST, type PythonASTNode, PythonNodeKind, isPythonTestFile } from './types.js';
import {
  initializeParser,
  parseCode,
  createPythonAST,
  disposeParser,
  isParserInitialized,
  findNodeAtPosition,
  getNodeText,
  traverseAST
} from './tree-sitter-bridge.js';
import { PythonSymbolExtractor } from './symbol-extractor.js';
import { PythonDependencyAnalyzer } from './dependency-analyzer.js';


/**
 * Python Parser 類別
 */
export class PythonParser extends BaseParserPlugin {
  readonly name = 'python';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.py', '.pyi', '.pyw'] as const;
  readonly supportedLanguages = ['python', 'python3'] as const;

  private symbolExtractor: PythonSymbolExtractor;
  private dependencyAnalyzer: PythonDependencyAnalyzer;

  constructor() {
    super();
    this.symbolExtractor = new PythonSymbolExtractor();
    this.dependencyAnalyzer = new PythonDependencyAnalyzer();
  }

  /**
   * 解析 Python 程式碼並生成 AST
   */
  async parse(code: string, filePath: string): Promise<AST> {
    this.log('debug', `Parsing Python file: ${filePath}`);

    if (!this.validateCode(code)) {
      throw new Error('無效的程式碼內容');
    }

    // 確保 Parser 已初始化
    await initializeParser();

    const startTime = performance.now();
    const tree = await parseCode(code);
    const parseTime = performance.now() - startTime;

    return createPythonAST(tree, filePath, parseTime);
  }

  /**
   * 從 AST 提取符號
   */
  async extractSymbols(ast: AST): Promise<Symbol[]> {
    this.log('debug', `Extracting symbols from ${ast.sourceFile}`);
    return this.symbolExtractor.extractSymbols(ast as PythonAST);
  }

  /**
   * 查找符號引用
   */
  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    this.log('debug', `Finding references for symbol: ${symbol.name}`);

    const pythonAST = ast as PythonAST;
    const references: Reference[] = [];

    traverseAST(pythonAST.root, (node) => {
      if (node.pythonKind === PythonNodeKind.Identifier) {
        const text = getNodeText(node);
        if (text === symbol.name) {
          references.push(createReference(
            symbol,
            { filePath: ast.sourceFile, range: node.range },
            this.getReferenceType(node, symbol)
          ));
        }
      }
    });

    return references;
  }

  /**
   * 判斷引用類型
   */
  private getReferenceType(node: PythonASTNode, symbol: Symbol): ReferenceType {
    // 檢查是否為符號定義位置
    if (
      node.range.start.line === symbol.location.range.start.line
      && node.range.start.column === symbol.location.range.start.column
    ) {
      return ReferenceType.Definition;
    }

    // 檢查是否在 import 語句內
    if (this.isInImportStatement(node)) {
      return ReferenceType.Import;
    }

    return ReferenceType.Usage;
  }

  /**
   * 檢查節點是否位於 import 語句內
   */
  private isInImportStatement(node: PythonASTNode): boolean {
    let current = node.treeSitterNode.parent;
    while (current) {
      if (
        current.type === PythonNodeKind.ImportStatement
        || current.type === PythonNodeKind.ImportFromStatement
      ) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * 提取依賴關係
   */
  async extractDependencies(ast: AST): Promise<Dependency[]> {
    this.log('debug', `Extracting dependencies from ${ast.sourceFile}`);
    return this.dependencyAnalyzer.extractDependencies(ast as PythonAST);
  }

  /**
   * 重命名符號
   */
  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    this.log('debug', `Renaming at position ${position.line}:${position.column} to ${newName}`);

    const pythonAST = ast as PythonAST;
    const edits: CodeEdit[] = [];

    // 找到位置對應的節點
    const targetNode = findNodeAtPosition(pythonAST.root, position.line, position.column);
    if (!targetNode || targetNode.pythonKind !== PythonNodeKind.Identifier) {
      return edits;
    }

    const oldName = getNodeText(targetNode);

    // 查找所有同名引用
    traverseAST(pythonAST.root, (node) => {
      if (node.pythonKind === PythonNodeKind.Identifier && getNodeText(node) === oldName) {
        edits.push(this.createCodeEdit(ast.sourceFile, node.range, newName, 'rename'));
      }
    });

    return edits;
  }

  /**
   * 提取函式重構
   * 將選取的程式碼片段提取為獨立函式
   */
  async extractFunction(ast: AST, selection: Range): Promise<CodeEdit[]> {
    this.log('debug', 'Extracting function from selection');

    const pythonAST = ast as PythonAST;
    const edits: CodeEdit[] = [];

    // 取得選取範圍的程式碼
    const sourceCode = this.getSourceCode(pythonAST);
    const lines = sourceCode.split('\n');
    const selectedLines = lines.slice(selection.start.line, selection.end.line + 1);

    if (selectedLines.length === 0) {
      return edits;
    }

    // 計算基礎縮排
    const baseIndent = this.getIndentation(selectedLines[0]);

    // 移除基礎縮排，準備函式內容
    const bodyLines = selectedLines.map(line => {
      if (line.startsWith(baseIndent)) {
        return '    ' + line.slice(baseIndent.length);
      }
      return '    ' + line;
    });

    // 分析變數使用
    const { parameters, returnVars } = this.analyzeVariables(pythonAST, selection, selectedLines.join('\n'));

    // 生成函式名稱
    const functionName = 'extracted_function';

    // 生成參數列表
    const paramList = parameters.join(', ');

    // 生成返回語句
    let returnStatement = '';
    if (returnVars.length > 0) {
      returnStatement = `\n    return ${returnVars.length === 1 ? returnVars[0] : returnVars.join(', ')}`;
    }

    // 生成新函式定義
    const functionDef = `def ${functionName}(${paramList}):\n${bodyLines.join('\n')}${returnStatement}\n\n`;

    // 找到插入點（選取範圍前面的函式定義位置）
    const insertLine = this.findInsertionPoint(pythonAST, selection.start.line);

    // 新增函式定義編輯
    edits.push(this.createCodeEdit(
      ast.sourceFile,
      {
        start: { line: insertLine, column: 0, offset: 0 },
        end: { line: insertLine, column: 0, offset: 0 }
      },
      functionDef,
      'extract'
    ));

    // 生成函式呼叫
    let functionCall = `${functionName}(${paramList})`;
    if (returnVars.length > 0) {
      functionCall = `${returnVars.length === 1 ? returnVars[0] : returnVars.join(', ')} = ${functionCall}`;
    }

    // 替換選取範圍為函式呼叫
    edits.push(this.createCodeEdit(
      ast.sourceFile,
      selection,
      baseIndent + functionCall,
      'extract'
    ));

    return edits;
  }

  /**
   * 取得原始碼
   */
  private getSourceCode(ast: PythonAST): string {
    return ast.tree.rootNode.text;
  }

  /**
   * 取得縮排
   */
  private getIndentation(line: string): string {
    const match = line.match(/^(\s*)/);
    return match ? match[1] : '';
  }

  /**
   * 分析變數使用，找出參數和返回值
   */
  private analyzeVariables(
    ast: PythonAST,
    selection: Range,
    _selectedCode: string
  ): { parameters: string[]; returnVars: string[] } {
    const parameters = new Set<string>();
    const returnVars = new Set<string>();
    const definedInSelection = new Set<string>();

    // 遍歷選取範圍內的節點
    traverseAST(ast.root, (node) => {
      const inSelection = this.isNodeInRange(node, selection);

      if (inSelection) {
        // 找出在選取範圍內定義的變數
        if (node.pythonKind === PythonNodeKind.Assignment) {
          const nameNode = node.treeSitterNode.childForFieldName('left');
          if (nameNode && nameNode.type === 'identifier') {
            definedInSelection.add(nameNode.text);
          }
        }

        // 找出使用的識別符
        if (node.pythonKind === PythonNodeKind.Identifier) {
          const name = getNodeText(node);
          // 排除 Python 內建名稱
          if (!this.isPythonBuiltin(name)) {
            // 檢查是否在選取範圍前定義
            if (!definedInSelection.has(name)) {
              parameters.add(name);
            }
          }
        }
      }
    });

    // 找出選取範圍後使用的變數（需要返回）
    traverseAST(ast.root, (node) => {
      if (node.range.start.line > selection.end.line) {
        if (node.pythonKind === PythonNodeKind.Identifier) {
          const name = getNodeText(node);
          if (definedInSelection.has(name)) {
            returnVars.add(name);
          }
        }
      }
    });

    return {
      parameters: Array.from(parameters),
      returnVars: Array.from(returnVars)
    };
  }

  /**
   * 檢查節點是否在範圍內
   */
  private isNodeInRange(node: { range: Range }, selection: Range): boolean {
    return (
      node.range.start.line >= selection.start.line
      && node.range.end.line <= selection.end.line
    );
  }

  /**
   * 找到函式插入點
   */
  private findInsertionPoint(ast: PythonAST, beforeLine: number): number {
    let insertLine = 0;

    traverseAST(ast.root, (node) => {
      if (
        (node.pythonKind === PythonNodeKind.FunctionDefinition
          || node.pythonKind === PythonNodeKind.AsyncFunctionDefinition)
        && node.range.end.line < beforeLine
      ) {
        insertLine = Math.max(insertLine, node.range.end.line + 1);
      }
    });

    return insertLine;
  }

  /**
   * 檢查是否為 Python 內建名稱
   */
  private isPythonBuiltin(name: string): boolean {
    const builtins = new Set([
      'True', 'False', 'None',
      'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple',
      'open', 'type', 'isinstance', 'issubclass', 'hasattr', 'getattr', 'setattr',
      'sum', 'min', 'max', 'abs', 'round', 'sorted', 'reversed', 'enumerate', 'zip',
      'map', 'filter', 'any', 'all', 'iter', 'next', 'input', 'format',
      'self', 'cls', 'super'
    ]);
    return builtins.has(name);
  }

  /**
   * 查找定義
   */
  async findDefinition(ast: AST, position: Position): Promise<Definition | null> {
    this.log('debug', `Finding definition at position ${position.line}:${position.column}`);

    const pythonAST = ast as PythonAST;
    const targetNode = findNodeAtPosition(pythonAST.root, position.line, position.column);

    if (!targetNode || targetNode.pythonKind !== PythonNodeKind.Identifier) {
      return null;
    }

    const name = getNodeText(targetNode);
    const symbols = await this.extractSymbols(ast);

    // 查找同名符號的定義
    const symbol = symbols.find(s => s.name === name);
    if (symbol) {
      return createDefinition(
        symbol.location,
        this.symbolTypeToDefinitionKind(symbol.type),
        symbol.scope?.name
      );
    }

    return null;
  }

  /**
   * 將 SymbolType 轉換為 DefinitionKind
   */
  private symbolTypeToDefinitionKind(symbolType: SymbolType): DefinitionKind {
    switch (symbolType) {
      case SymbolType.Class: return 'class';
      case SymbolType.Function: return 'function';
      case SymbolType.Variable: return 'variable';
      case SymbolType.Module: return 'module';
      default: return 'variable';
    }
  }

  /**
   * 查找使用位置
   */
  async findUsages(ast: AST, symbol: Symbol): Promise<Usage[]> {
    this.log('debug', `Finding usages for symbol: ${symbol.name}`);

    const references = await this.findReferences(ast, symbol);
    return references.map(ref => createUsage(ref.location, 'reference'));
  }

  /**
   * 驗證插件狀態
   */
  async validate(): Promise<ValidationResult> {
    this.log('debug', 'Validating Python parser');

    if (this.isDisposed()) {
      return createValidationFailure([{
        code: 'PLUGIN_DISPOSED',
        message: '插件已被清理',
        location: { filePath: '', range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } } }
      }]);
    }

    // 檢查 tree-sitter 是否可用
    try {
      await initializeParser();
      if (!isParserInitialized()) {
        return createValidationFailure([{
          code: 'PARSER_NOT_INITIALIZED',
          message: 'tree-sitter Parser 初始化失敗',
          location: { filePath: '', range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } } }
        }]);
      }
    } catch (error) {
      return createValidationFailure([{
        code: 'INITIALIZATION_ERROR',
        message: `Parser 初始化錯誤: ${(error as Error).message}`,
        location: { filePath: '', range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } } }
      }]);
    }

    return createValidationSuccess();
  }

  /**
   * 清理資源
   */
  async dispose(): Promise<void> {
    this.log('info', 'Disposing Python parser');
    await disposeParser();
    await super.dispose();
  }

  /**
   * 獲取插件能力聲明
   */
  override getCapabilities(): ParserCapabilities {
    return {
      supportsRename: true,
      supportsExtractFunction: true,
      supportsGoToDefinition: true,
      supportsFindUsages: true,
      supportsCodeActions: false
    };
  }

  /**
   * 獲取 Python 專用的排除模式
   */
  override getDefaultExcludePatterns(): string[] {
    return [
      ...super.getDefaultExcludePatterns(),
      '__pycache__/**',
      '*.pyc',
      '*.pyo',
      '*.pyd',
      '.eggs/**',
      '*.egg-info/**',
      '.venv/**',
      'venv/**',
      'env/**',
      '.env/**',
      '.tox/**',
      '.nox/**',
      '.pytest_cache/**',
      '.mypy_cache/**',
      '.hypothesis/**',
      'htmlcov/**',
      '.coverage',
      'migrations/**'
    ];
  }

  /**
   * 判斷是否為測試檔案
   */
  override isTestFile(filePath: string): boolean {
    return isPythonTestFile(filePath);
  }

  /**
   * 判斷符號是否為抽象宣告
   */
  override isAbstractDeclaration(symbol: Symbol): boolean {
    // Python 中，class 和 function 都是抽象宣告
    // variable 和 constant 是具體值
    const abstractTypes = [
      SymbolType.Class,
      SymbolType.Function,
      SymbolType.Module
    ];

    return abstractTypes.includes(symbol.type);
  }

}

/**
 * 創建 Python Parser 實例
 */
export function createPythonParser(): PythonParser {
  return new PythonParser();
}
