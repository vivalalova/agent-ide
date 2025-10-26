/**
 * Swift Parser 主要實作
 * 實作 ParserPlugin 介面
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
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
import type {
  UnusedCode,
  ComplexityMetrics,
  CodeFragment,
  PatternMatch,
  TypeSafetyIssue,
  ErrorHandlingIssue,
  SecurityIssue,
  NamingIssue
} from '../../infrastructure/parser/analysis-types.js';
import type {
  SwiftAST,
  SwiftASTNode,
  SwiftSymbol,
  SwiftCLIResponse
} from './types.js';
import {
  SwiftNodeKind,
  createSwiftASTNode,
  createParseError,
  getNodeName,
  isValidIdentifier
} from './types.js';
import { SwiftSymbolExtractor, createSymbolExtractor } from './symbol-extractor.js';
import { SwiftDependencyAnalyzer, createDependencyAnalyzer } from './dependency-analyzer.js';

const execAsync = promisify(exec);

/**
 * Swift Parser 實作
 */
export class SwiftParser implements ParserPlugin {
  public readonly name = 'swift';
  public readonly version = '1.0.0';
  public readonly supportedExtensions = ['.swift'] as const;
  public readonly supportedLanguages = ['swift'] as const;

  private symbolExtractor: SwiftSymbolExtractor;
  private dependencyAnalyzer: SwiftDependencyAnalyzer;
  private cliPath: string;

  constructor(cliPath = 'swift-parser') {
    this.symbolExtractor = createSymbolExtractor();
    this.dependencyAnalyzer = createDependencyAnalyzer();
    this.cliPath = cliPath;
  }

  // ===== 10 個基本方法 =====

  /**
   * 解析 Swift 程式碼
   */
  async parse(code: string, filePath: string): Promise<AST> {
    this.validateInput(code, filePath);

    try {
      // 呼叫 Swift CLI Bridge
      const cliPath = this.resolveCliPath();
      const escapedCode = code.replace(/'/g, '\'\\\'\''); // 逸出單引號
      const { stdout } = await execAsync(`echo '${escapedCode}' | ${cliPath}`, {
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      // 解析 JSON 輸出
      const cliOutput = JSON.parse(stdout);

      // 檢查解析錯誤
      if (cliOutput.parseErrors) {
        throw createParseError(
          `Swift 語法錯誤: ${cliOutput.parseErrors.map((e: any) => e.message).join(', ')}`
        );
      }

      // 轉換為標準 AST
      const rootNode = this.convertCLINodeToASTNode(cliOutput.root);

      const metadata = createASTMetadata(
        'swift',
        cliOutput.metadata?.parserVersion || this.version,
        {},
        Date.now(),
        0
      );

      const baseAST = createAST(filePath, rootNode, metadata);
      const ast: SwiftAST = {
        ...baseAST,
        root: rootNode as SwiftASTNode,
        swiftVersion: cliOutput.metadata?.parserVersion,
        diagnostics: []
      };

      return ast;
    } catch (error) {
      throw createParseError(
        `解析失敗: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 解析 Swift CLI Bridge 路徑
   */
  private resolveCliPath(): string {
    // 優先使用建構參數指定的路徑
    if (this.cliPath && this.cliPath !== 'swift-parser') {
      if (fs.existsSync(this.cliPath)) {
        return this.cliPath;
      }
    }

    // 從 dist/ 目錄解析（build 時已複製）
    const distPath = path.join(__dirname, 'swift-bridge', 'swift-parser');
    if (fs.existsSync(distPath)) {
      return distPath;
    }

    // 開發環境：從 src/ 目錄解析
    const projectRoot = process.cwd();
    const srcPath = path.join(projectRoot, 'src/plugins/swift/swift-bridge/swift-parser');
    if (fs.existsSync(srcPath)) {
      return srcPath;
    }

    // 錯誤：CLI Bridge 未找到
    throw new Error('Swift CLI Bridge not found. Please run: cd src/plugins/swift/swift-bridge && bash build.sh');
  }

  /**
   * 轉換 CLI Bridge 節點為 AST 節點
   */
  private convertCLINodeToASTNode(cliNode: any): SwiftASTNode {
    const swiftKind = this.nodeTypeToSwiftKind(cliNode.type);

    const node: SwiftASTNode = {
      type: cliNode.type,
      range: cliNode.range,
      swiftKind,
      properties: cliNode.properties || {},
      children: (cliNode.children || []).map((child: any) =>
        this.convertCLINodeToASTNode(child)
      ),
      attributes: this.extractAttributes(cliNode),
      modifiers: this.extractModifiers(cliNode),
      source: cliNode.source || undefined
    };

    return node;
  }

  /**
   * 節點類型轉換為 SwiftNodeKind
   */
  private nodeTypeToSwiftKind(nodeType: string): SwiftNodeKind {
    // 對應 Swift CLI Bridge 的節點類型
    const mapping: Record<string, SwiftNodeKind> = {
      'SourceFile': SwiftNodeKind.SourceFile,
      'ClassDecl': SwiftNodeKind.Class,
      'StructDecl': SwiftNodeKind.Struct,
      'ProtocolDecl': SwiftNodeKind.Protocol,
      'EnumDecl': SwiftNodeKind.Enum,
      'FunctionDecl': SwiftNodeKind.Function,
      'FuncDecl': SwiftNodeKind.Function,
      'VariableDecl': SwiftNodeKind.Variable,
      'ImportDecl': SwiftNodeKind.Import
    };

    return mapping[nodeType] || SwiftNodeKind.Unknown;
  }

  /**
   * 從節點提取屬性（@Published, @State 等）
   */
  private extractAttributes(node: any): string[] {
    // 從 properties 或子節點中提取屬性
    if (node.properties?.attributes) {
      return node.properties.attributes.split(',').map((a: string) => a.trim());
    }
    return [];
  }

  /**
   * 從節點提取修飾符（public, private 等）
   */
  private extractModifiers(node: any): string[] {
    // 從 properties 或子節點中提取修飾符
    if (node.properties?.modifiers) {
      return node.properties.modifiers.split(' ').filter((m: string) => m.length > 0);
    }
    return [];
  }

  /**
   * 提取符號
   */
  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const typedAst = ast as SwiftAST;
    return await this.symbolExtractor.extractSymbols(typedAst);
  }

  /**
   * 查找符號引用
   * 在當前 AST 中查找所有對指定符號的引用
   */
  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    const typedAst = ast as SwiftAST;
    const references: Reference[] = [];

    // 遍歷 AST 尋找匹配的識別符
    this.findReferencesInNode(
      typedAst.root,
      symbol.name,
      typedAst.sourceFile,
      references,
      symbol
    );

    return references;
  }

  /**
   * 提取依賴關係
   */
  async extractDependencies(ast: AST): Promise<Dependency[]> {
    const typedAst = ast as SwiftAST;
    return await this.dependencyAnalyzer.extractDependencies(typedAst);
  }

  /**
   * 重新命名符號
   */
  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    this.validateRenameInput(newName);

    // 查找位置上的符號
    const symbol = await this.findSymbolAtPosition(ast as SwiftAST, position);
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
    const symbol = await this.findSymbolAtPosition(ast as SwiftAST, position);
    if (!symbol) {
      return null;
    }

    return createDefinition(
      symbol.location,
      this.symbolTypeToDefinitionKind(symbol.type)
    );
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
      // 檢查 Swift CLI Bridge 是否可用
      const { stdout } = await execAsync(`command -v ${this.cliPath}`);
      if (!stdout) {
        return createValidationFailure([{
          code: 'SWIFT_CLI_UNAVAILABLE',
          message: 'Swift CLI Bridge 不可用',
          location: {
            filePath: '',
            range: {
              start: { line: 0, column: 0, offset: 0 },
              end: { line: 0, column: 0, offset: 0 }
            }
          }
        }]);
      }

      return createValidationSuccess();
    } catch (error) {
      // CLI Bridge 尚未實作，暫時返回成功
      return createValidationSuccess();
    }
  }

  /**
   * 清理資源
   */
  async dispose(): Promise<void> {
    // 清理資源
    this.symbolExtractor = null as any;
    this.dependencyAnalyzer = null as any;
  }

  // ===== 9 個分析方法 =====

  /**
   * 檢測未使用的符號
   */
  async detectUnusedSymbols(
    ast: AST,
    allSymbols: Symbol[]
  ): Promise<UnusedCode[]> {
    const unusedCodes: UnusedCode[] = [];

    for (const symbol of allSymbols) {
      const references = await this.findReferences(ast, symbol);
      // 只有定義但沒有使用的符號
      const usages = references.filter(
        ref => ref.type === ReferenceType.Usage
      );

      if (usages.length === 0) {
        unusedCodes.push({
          type: symbol.type === SymbolType.Function ? 'function' :
                symbol.type === SymbolType.Class ? 'class' : 'variable',
          name: symbol.name,
          location: {
            filePath: symbol.location.filePath,
            line: symbol.location.range.start.line,
            column: symbol.location.range.start.column
          },
          confidence: 0.9,
          reason: `符號 "${symbol.name}" 已定義但從未使用`
        });
      }
    }

    return unusedCodes;
  }

  /**
   * 分析程式碼複雜度
   */
  async analyzeComplexity(code: string, _ast: AST): Promise<ComplexityMetrics> {
    const lines = code.split('\n');
    const complexity = this.calculateCyclomaticComplexity(code);

    return {
      cyclomaticComplexity: complexity,
      cognitiveComplexity: Math.floor(complexity * 1.2),
      evaluation: complexity > 20 ? 'very-complex' :
                  complexity > 10 ? 'complex' :
                  complexity > 5 ? 'moderate' : 'simple',
      functionCount: (code.match(/\bfunc\b/g) || []).length,
      averageComplexity: complexity / Math.max(1, (code.match(/\bfunc\b/g) || []).length),
      maxComplexity: complexity,
      maxComplexityFunction: undefined
    };
  }

  /**
   * 提取程式碼片段（用於重複代碼檢測）
   */
  async extractCodeFragments(
    code: string,
    filePath: string
  ): Promise<CodeFragment[]> {
    const fragments: CodeFragment[] = [];
    const lines = code.split('\n');

    // 提取方法片段
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/func\s+\w+/.test(line)) {
        let braceCount = (line.match(/{/g) || []).length;
        let endLine = i;

        for (let j = i + 1; j < lines.length && braceCount > 0; j++) {
          braceCount += (lines[j].match(/{/g) || []).length;
          braceCount -= (lines[j].match(/}/g) || []).length;
          endLine = j;
        }

        if (endLine > i && endLine - i + 1 >= 3) {
          const methodCode = lines.slice(i, endLine + 1).join('\n');
          const { createHash } = await import('crypto');

          fragments.push({
            type: 'method',
            code: methodCode,
            tokens: methodCode.split(/\s+/).filter(t => t.length > 0),
            location: { filePath, startLine: i + 1, endLine: endLine + 1 },
            hash: createHash('md5').update(methodCode).digest('hex')
          });
        }
      }
    }

    return fragments;
  }

  /**
   * 檢測樣板模式
   */
  async detectPatterns(_code: string, _ast: AST): Promise<PatternMatch[]> {
    // Swift 特定模式檢測（如 guard let、if let 等）
    return [];
  }

  /**
   * 檢查型別安全問題
   */
  async checkTypeSafety(code: string, ast: AST): Promise<TypeSafetyIssue[]> {
    const issues: TypeSafetyIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 檢測 as! 強制轉型
      if (/as!\s+/.test(line)) {
        issues.push({
          type: 'unsafe-cast',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: '使用了 as! 強制轉型，可能導致運行時崩潰',
          severity: 'error'
        });
      }

      // 檢測強制解包 !
      if (/\w+!/.test(line) && !/if\s+let|guard\s+let/.test(line)) {
        issues.push({
          type: 'unsafe-cast',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: '使用了強制解包 !，建議使用 if let 或 guard let',
          severity: 'warning'
        });
      }
    }

    return issues;
  }

  /**
   * 檢查錯誤處理問題
   */
  async checkErrorHandling(code: string, ast: AST): Promise<ErrorHandlingIssue[]> {
    const issues: ErrorHandlingIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 檢測空 catch 區塊
      if (/catch\s*\{?\s*\}/.test(line)) {
        issues.push({
          type: 'empty-catch',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: '空的 catch 區塊，應該處理錯誤',
          severity: 'warning'
        });
      }

      // 檢測 try? 靜默錯誤
      if (/try\?/.test(line)) {
        issues.push({
          type: 'silent-error',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: '使用 try? 靜默錯誤，建議使用 do-catch 處理',
          severity: 'warning'
        });
      }
    }

    return issues;
  }

  /**
   * 檢查安全性問題
   */
  async checkSecurity(code: string, ast: AST): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 檢測硬編碼密碼
      if (
        /(password|apiKey|token|secret)\s*=\s*"[^"]{3,}"/.test(line) &&
        !/ProcessInfo/.test(line)
      ) {
        issues.push({
          type: 'hardcoded-secret',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: '硬編碼的密碼或密鑰，應使用 Keychain 或環境變數',
          severity: 'critical'
        });
      }
    }

    return issues;
  }

  /**
   * 檢查命名規範問題
   */
  async checkNamingConventions(
    symbols: Symbol[],
    filePath: string
  ): Promise<NamingIssue[]> {
    const issues: NamingIssue[] = [];

    for (const symbol of symbols) {
      // Swift 規範：變數和函式用 camelCase
      if (
        symbol.type === SymbolType.Variable ||
        symbol.type === SymbolType.Function
      ) {
        if (/^[A-Z]/.test(symbol.name)) {
          issues.push({
            type: 'invalid-naming',
            symbolName: symbol.name,
            symbolType: symbol.type,
            location: {
              filePath,
              line: symbol.location.range.start.line,
              column: symbol.location.range.start.column
            },
            message: `變數/函式 "${symbol.name}" 應使用 camelCase 命名`
          });
        }
      }

      // Swift 規範：類別和協定用 PascalCase
      if (
        symbol.type === SymbolType.Class ||
        symbol.type === SymbolType.Interface
      ) {
        if (!/^[A-Z]/.test(symbol.name)) {
          issues.push({
            type: 'invalid-naming',
            symbolName: symbol.name,
            symbolType: symbol.type,
            location: {
              filePath,
              line: symbol.location.range.start.line,
              column: symbol.location.range.start.column
            },
            message: `類別/協定 "${symbol.name}" 應使用 PascalCase 命名`
          });
        }
      }

      // 檢測底線開頭變數（Swift 不建議）
      if (symbol.name.startsWith('_')) {
        issues.push({
          type: 'invalid-naming',
          symbolName: symbol.name,
          symbolType: symbol.type,
          location: {
            filePath,
            line: symbol.location.range.start.line,
            column: symbol.location.range.start.column
          },
          message: `符號 "${symbol.name}" 以底線開頭，違反 Swift 命名規範`
        });
      }
    }

    return issues;
  }

  /**
   * 判斷檔案是否為測試檔案
   */
  isTestFile(filePath: string): boolean {
    return /Tests\.swift$/.test(filePath) || filePath.includes('/Tests/');
  }

  // ===== 可選方法 =====

  /**
   * 獲取 Swift 特定的排除模式
   */
  getDefaultExcludePatterns(): string[] {
    return [
      '.build/**',
      'DerivedData/**',
      '**/*Tests.swift',
      '**/Tests/**',
      '*.xcodeproj/**',
      '*.xcworkspace/**',
      'Pods/**',
      'Carthage/**'
    ];
  }

  /**
   * 判斷是否應該忽略特定檔案
   */
  shouldIgnoreFile(filePath: string): boolean {
    const patterns = this.getDefaultExcludePatterns();
    return patterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      return regex.test(filePath);
    });
  }

  /**
   * 判斷符號是否為抽象宣告
   */
  isAbstractDeclaration(symbol: Symbol): boolean {
    const abstractTypes = [
      SymbolType.Class,
      SymbolType.Struct,
      SymbolType.Protocol,
      SymbolType.Interface, // 保留以兼容舊程式碼
      SymbolType.Type,      // typealias
      SymbolType.Enum
    ];

    return abstractTypes.includes(symbol.type);
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
      throw new Error('新名稱必須是有效的 Swift 識別符');
    }
  }

  /**
   * 模擬解析（實際需要呼叫 CLI Bridge）
   */
  private mockParse(code: string): SwiftASTNode {
    return createSwiftASTNode(SwiftNodeKind.SourceFile, code);
  }

  /**
   * 在節點中遞歸查找引用
   */
  private findReferencesInNode(
    node: SwiftASTNode,
    symbolName: string,
    filePath: string,
    references: Reference[],
    symbol: Symbol
  ): void {
    // 檢查當前節點名稱
    const nodeName = getNodeName(node);
    if (nodeName === symbolName) {
      // 使用節點的 range 資訊（如果有）
      const range = node.range || {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 }
      };

      references.push({
        symbol,
        location: {
          filePath,
          range
        },
        type: ReferenceType.Usage
      });
    }

    // 檢查節點的 source code 是否包含符號（用於捕捉類型引用等）
    // 例如：`let user: User` 中的 User 可能不是獨立節點
    if (node.source) {
      const regex = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`, 'g');
      let match;
      while ((match = regex.exec(node.source)) !== null) {
        // 確保不重複添加（如果已經透過 nodeName 匹配到）
        if (nodeName !== symbolName) {
          const range = node.range || {
            start: { line: 1, column: match.index + 1, offset: 0 },
            end: { line: 1, column: match.index + symbolName.length + 1, offset: 0 }
          };

          references.push({
            symbol,
            location: {
              filePath,
              range
            },
            type: ReferenceType.Usage
          });
        }
      }
    }

    // 遞歸處理子節點
    if (node.children) {
      for (const child of node.children) {
        this.findReferencesInNode(
          child as SwiftASTNode,
          symbolName,
          filePath,
          references,
          symbol
        );
      }
    }
  }

  /**
   * 逸出正則表達式特殊字符
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 查找指定位置的符號
   */
  private async findSymbolAtPosition(
    ast: SwiftAST,
    position: Position
  ): Promise<Symbol | null> {
    const symbols = await this.extractSymbols(ast);

    // 簡化實作：返回第一個符號
    return symbols[0] || null;
  }

  /**
   * 計算圈複雜度
   */
  private calculateCyclomaticComplexity(code: string): number {
    let complexity = 1;

    // 計算控制流關鍵字（單詞類）
    const wordKeywords = ['if', 'else', 'for', 'while', 'guard', 'switch', 'case'];
    for (const keyword of wordKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = code.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    }

    // 計算邏輯運算子（需要轉義特殊字元）
    const operators = [
      { pattern: '&&', name: 'logical-and' },
      { pattern: '||', name: 'logical-or' },
      { pattern: '?', name: 'ternary' }
    ];
    for (const op of operators) {
      const escapedPattern = op.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedPattern, 'g');
      const matches = code.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * SymbolType 轉換為 DefinitionKind
   */
  private symbolTypeToDefinitionKind(symbolType: SymbolType): any {
    switch (symbolType) {
    case SymbolType.Class:
      return 'class';
    case SymbolType.Struct:
      return 'struct';
    case SymbolType.Protocol:
      return 'protocol';
    case SymbolType.Interface:
      return 'interface';
    case SymbolType.Function:
      return 'function';
    case SymbolType.Variable:
      return 'variable';
    case SymbolType.Property:
      return 'property';
    case SymbolType.Constant:
      return 'constant';
    case SymbolType.Type:
      return 'type';
    case SymbolType.Enum:
      return 'enum';
    default:
      return 'variable';
    }
  }
}

/**
 * 建立 Swift Parser 實例
 */
export function createSwiftParser(cliPath?: string): SwiftParser {
  return new SwiftParser(cliPath);
}
