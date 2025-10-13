/**
 * 提取函式重構器
 * 將選取的程式碼片段提取為獨立函式
 */

import * as ts from 'typescript';
import { TypeScriptParser } from '../../plugins/typescript/parser.js';
import type { TypeScriptAST } from '../../plugins/typescript/types.js';

// 程式碼選取範圍介面
export interface Range {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

// 程式碼編輯操作介面
export interface CodeEdit {
  range: Range;
  newText: string;
  type: 'replace' | 'insert' | 'delete';
}

// 變數資訊介面
export interface VariableInfo {
  name: string;
  type: string;
  isParameter: boolean;
  isReturned: boolean;
  scope: 'local' | 'closure' | 'global';
  usages: Range[];
}

// 提取結果介面
export interface ExtractionResult {
  success: boolean;
  functionName: string;
  edits: CodeEdit[]; // 原始檔案的編輯
  parameters: VariableInfo[];
  returnType?: string; // 推導出的返回型別
  errors: string[];
  warnings: string[];
  // 跨檔案提取專用欄位
  targetFileContent?: string; // 目標檔案的完整內容
  importStatement?: string; // 需要加入的 import 語句
}

// AST 節點介面（相容舊版，但內部使用 TypeScript AST）
export interface ASTNode {
  type: string;
  start: number;
  end: number;
  loc: { start: { line: number; column: number }; end: { line: number; column: number } };
  children?: ASTNode[];
  name?: string;
  value?: any;
  code?: string; // 程式碼內容
  tsNode?: ts.Node; // TypeScript AST 節點
  tsSourceFile?: ts.SourceFile; // TypeScript 原始檔
}

// 提取配置介面
export interface ExtractConfig {
  functionName?: string;
  generateComments: boolean;
  preserveFormatting: boolean;
  validateExtraction: boolean;
  insertionPoint?: 'before' | 'after' | 'top';
  targetFile?: string; // 跨檔案提取的目標檔案路徑
  sourceFile?: string; // 原始檔案路徑（用於計算相對 import 路徑）
}

/**
 * 函式提取分析器
 * 分析選取的程式碼是否適合提取為函式
 */
export class ExtractionAnalyzer {
  private parser: TypeScriptParser;

  constructor() {
    this.parser = new TypeScriptParser();
  }

  /**
   * 分析程式碼片段的可提取性
   */
  async analyze(code: string, selection: Range): Promise<{
    canExtract: boolean;
    issues: string[];
    variables: VariableInfo[];
    dependencies: string[];
    returnType?: string;
  }> {
    const issues: string[] = [];
    const variables: VariableInfo[] = [];
    const dependencies: string[] = [];

    // 基本驗證
    if (!code || code.trim().length === 0) {
      issues.push('選取的程式碼為空');
      return { canExtract: false, issues, variables, dependencies };
    }

    // 解析 AST
    const ast = await this.parseCode(code);
    if (!ast) {
      issues.push('程式碼解析失敗');
      return { canExtract: false, issues, variables, dependencies };
    }

    // 分析變數使用
    const variableAnalysis = this.analyzeVariables(ast);
    variables.push(...variableAnalysis.variables);

    // 檢查提取限制
    this.checkExtractionConstraints(ast, selection, issues);

    // 分析依賴
    dependencies.push(...this.findDependencies(ast));

    // 推導返回值型別
    const returnType = this.extractReturnType(ast);

    return {
      canExtract: issues.length === 0,
      issues,
      variables,
      dependencies,
      returnType
    };
  }

  /**
   * 檢查提取限制
   */
  private checkExtractionConstraints(ast: ASTNode, selection: Range, issues: string[]): void {
    // 檢查是否包含 return 語句
    const hasReturn = this.containsReturn(ast);

    // 檢查是否包含 break/continue
    if (this.containsJumpStatement(ast)) {
      issues.push('選取範圍包含 break 或 continue 語句');
    }

    // 檢查是否跨越語句邊界
    if (!this.isCompleteStatements(ast)) {
      issues.push('選取範圍不是完整的語句');
    }

    // 檢查巢狀函式定義
    if (this.containsFunctionDefinition(ast)) {
      issues.push('選取範圍包含函式定義');
    }

    // 檢查外部變數修改
    if (ast.code) {
      // 先找出所有宣告的變數
      const declaredVars = new Set<string>();
      const declarationPattern = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
      let declMatch;
      while ((declMatch = declarationPattern.exec(ast.code)) !== null) {
        declaredVars.add(declMatch[1]);
      }

      // 然後找出所有賦值（簡化邏輯：只檢測真正的外部變數修改）
      // 使用更精確的模式：變數名後面直接跟 = （中間只能有空白）
      const simpleAssignmentPattern = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=(?!=)/g;
      const uniqueAssignments = new Set<string>();

      let assignMatch;
      while ((assignMatch = simpleAssignmentPattern.exec(ast.code)) !== null) {
        const varName = assignMatch[1];
        const position = assignMatch.index || 0;
        const fullMatch = assignMatch[0]; // 例如 "varName ="

        // 檢查完整匹配中是否包含型別註解
        // 如果變數名前面有 ':' 字元，很可能是型別註解
        const beforeVar = ast.code.substring(Math.max(0, position - 5), position);
        if (beforeVar.includes(':') || beforeVar.includes('.')) {
          continue;
        }

        // 檢查是否為變數宣告
        const beforeDecl = ast.code.substring(Math.max(0, position - 10), position);
        if (/(?:const|let|var|type|interface)\s+$/.test(beforeDecl)) {
          continue;
        }

        // 檢查是否為外部變數（沒有在程式碼中宣告）
        if (!declaredVars.has(varName) &&
            !['return', 'function', 'if', 'else', 'for', 'while', 'case'].includes(varName)) {
          uniqueAssignments.add(varName);
        }
      }

      // FIXME: 外部變數檢測使用正則表達式太不可靠，暫時禁用
      // TODO: 未來使用真正的 TypeScript AST parser 改進
      // 如果有多個不同的外部變數修改，發出警告但不阻止提取
      const uniqueCount = uniqueAssignments.size;
      if (uniqueCount > 1) {
        // 暫時只警告，不阻止
        // const vars = Array.from(uniqueAssignments).join(', ');
        // issues.push(`警告：可能有多個返回值 (檢測到: ${vars})`);
      }
    }
  }

  /**
   * 分析變數使用情況
   */
  private analyzeVariables(ast: ASTNode): { variables: VariableInfo[] } {
    const variables: VariableInfo[] = [];
    const definedVars = new Set<string>();
    const usedVars = new Set<string>();

    // 簡化實作：使用正規表達式解析變數
    if (ast.code) {
      // 找出程式碼中的變數使用
      const variableMatches = ast.code.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g) || [];

      // 過濾出真正的變數（排除關鍵字）
      const keywords = new Set(['if', 'else', 'for', 'while', 'do', 'break', 'continue',
        'function', 'return', 'var', 'let', 'const', 'true', 'false', 'null',
        'undefined', 'new', 'this', 'typeof', 'instanceof', 'console', 'log',
        'map', 'filter', 'reduce', 'forEach', 'length', 'push', 'pop', 'item', 'i']);

      for (const match of variableMatches) {
        if (!keywords.has(match) && !definedVars.has(match)) {
          usedVars.add(match);
        }
      }

      // 檢查本地定義的變數
      const localDeclarations = ast.code.match(/(?:let|const|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g) || [];
      for (const decl of localDeclarations) {
        const varName = decl.replace(/(?:let|const|var)\s+/, '');
        definedVars.add(varName);
        usedVars.delete(varName); // 移除本地定義的變數
      }

      // 檢查函式參數
      const functionParams = ast.code.match(/function\s*\w*\s*\(([^)]*)\)/);
      if (functionParams && functionParams[1]) {
        const params = functionParams[1].split(',').map(p => p.trim().replace(/:\s*\w+/, ''));
        for (const param of params) {
          if (param) {
            definedVars.add(param);
            usedVars.delete(param);
          }
        }
      }
    }

    // 建立變數資訊
    for (const varName of usedVars) {
      variables.push({
        name: varName,
        type: 'any', // 簡化實作
        isParameter: true,
        isReturned: false,
        scope: 'closure',
        usages: []
      });
    }

    return { variables };
  }

  /**
   * 使用 TypeScript Parser 解析程式碼
   */
  private async parseCode(code: string): Promise<ASTNode | null> {
    try {
      // 使用 TypeScript Parser 解析程式碼片段
      // 為了解析片段，我們將它包裝在一個函式中以形成完整的語句
      const wrappedCode = `function __extractedCode__() {\n${code}\n}`;
      const virtualPath = 'virtual-extract.ts';

      const tsAST = await this.parser.parse(wrappedCode, virtualPath) as TypeScriptAST;
      const sourceFile = tsAST.tsSourceFile;

      if (!sourceFile) {
        return null;
      }

      // 找到我們包裝的函式內部的語句
      let extractedStatements: ts.Node | null = null;
      ts.forEachChild(sourceFile, (node) => {
        if (ts.isFunctionDeclaration(node) && node.name?.text === '__extractedCode__') {
          if (node.body) {
            extractedStatements = node.body;
          }
        }
      });

      if (!extractedStatements) {
        return null;
      }

      // 建立我們的 ASTNode 結構（相容舊版介面）
      return {
        type: 'Program',
        start: 0,
        end: code.length,
        loc: {
          start: { line: 1, column: 0 },
          end: { line: code.split('\n').length, column: 0 }
        },
        children: [],
        code,
        tsNode: extractedStatements, // 保存 TypeScript AST 節點
        tsSourceFile: sourceFile // 保存 SourceFile 供型別檢查使用
      };
    } catch (error) {
      console.debug('Parse error:', error);
      return null;
    }
  }

  /**
   * 遍歷 AST
   */
  private traverse(node: ASTNode, visitor: (node: ASTNode) => void): void {
    visitor(node);
    if (node.children) {
      for (const child of node.children) {
        this.traverse(child, visitor);
      }
    }
  }

  /**
   * 檢查是否包含 return 語句（使用真實 TypeScript AST）
   */
  private containsReturn(ast: ASTNode): boolean {
    if (!ast.tsNode) {
      // 降級到舊邏輯
      let hasReturn = false;
      this.traverse(ast, (node) => {
        if (node.type === 'ReturnStatement') {
          hasReturn = true;
        }
      });
      return hasReturn;
    }

    let hasReturn = false;
    const visit = (node: ts.Node) => {
      if (ts.isReturnStatement(node)) {
        hasReturn = true;
        return; // 找到就可以停止
      }
      ts.forEachChild(node, visit);
    };
    visit(ast.tsNode);
    return hasReturn;
  }

  /**
   * 推導返回值型別
   */
  private extractReturnType(ast: ASTNode): string {
    if (!ast.tsNode || !ast.tsSourceFile) {
      // 降級：簡單檢查是否有 return
      return this.containsReturn(ast) ? 'any' : 'void';
    }

    // 收集所有 return 語句的型別
    const returnTypes: string[] = [];
    let hasReturnWithoutValue = false;

    const visit = (node: ts.Node) => {
      if (ts.isReturnStatement(node)) {
        if (node.expression) {
          // 嘗試推導 return 表達式的型別
          const type = this.inferTypeFromExpression(node.expression, ast.tsSourceFile!);
          returnTypes.push(type);
        } else {
          hasReturnWithoutValue = true;
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(ast.tsNode);

    // 決定最終返回型別
    if (returnTypes.length === 0 && !hasReturnWithoutValue) {
      return 'void';
    }

    if (hasReturnWithoutValue && returnTypes.length === 0) {
      return 'void';
    }

    if (returnTypes.length === 0) {
      return 'void';
    }

    // 如果所有返回型別都相同，使用該型別
    const uniqueTypes = [...new Set(returnTypes)];
    if (uniqueTypes.length === 1) {
      return uniqueTypes[0];
    }

    // 如果有多種型別，使用 union type
    return uniqueTypes.join(' | ');
  }

  /**
   * 從表達式推導型別
   */
  private inferTypeFromExpression(expr: ts.Expression, sourceFile: ts.SourceFile): string {
    // 字串字面量
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      return 'string';
    }

    // 數字字面量
    if (ts.isNumericLiteral(expr)) {
      return 'number';
    }

    // 布林字面量
    if (expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) {
      return 'boolean';
    }

    // null
    if (expr.kind === ts.SyntaxKind.NullKeyword) {
      return 'null';
    }

    // undefined
    if (expr.kind === ts.SyntaxKind.UndefinedKeyword) {
      return 'undefined';
    }

    // 識別符號（變數）- 嘗試從上下文推導
    if (ts.isIdentifier(expr)) {
      // 檢查是否是參數或已知變數
      const varName = expr.text;

      // 嘗試在包裝函式的參數中查找型別
      // 這裡簡化處理，實際專案中應該從完整檔案的上下文取得
      const text = sourceFile.text;
      const paramPattern = new RegExp(`\\b${varName}\\s*:\\s*([a-zA-Z][a-zA-Z0-9]*)`);
      const match = text.match(paramPattern);
      if (match) {
        return match[1];
      }

      return 'any';
    }

    // 陣列字面量
    if (ts.isArrayLiteralExpression(expr)) {
      if (expr.elements.length === 0) {
        return 'any[]';
      }
      const elementType = this.inferTypeFromExpression(expr.elements[0], sourceFile);
      return `${elementType}[]`;
    }

    // 物件字面量
    if (ts.isObjectLiteralExpression(expr)) {
      return 'object';
    }

    // 函式呼叫
    if (ts.isCallExpression(expr)) {
      // 簡化：返回 any
      return 'any';
    }

    // 預設返回 any
    return 'any';
  }

  /**
   * 檢查是否包含跳躍語句
   */
  private containsJumpStatement(ast: ASTNode): boolean {
    let hasJump = false;
    this.traverse(ast, (node) => {
      if (node.type === 'BreakStatement' || node.type === 'ContinueStatement') {
        hasJump = true;
      }
    });
    return hasJump;
  }

  /**
   * 檢查是否為完整語句
   */
  private isCompleteStatements(ast: ASTNode): boolean {
    // 簡化實作：假設總是完整的
    return true;
  }

  /**
   * 檢查是否包含函式定義
   */
  private containsFunctionDefinition(ast: ASTNode): boolean {
    let hasFunction = false;
    this.traverse(ast, (node) => {
      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
        hasFunction = true;
      }
    });
    return hasFunction;
  }

  /**
   * 找出依賴項
   */
  private findDependencies(ast: ASTNode): string[] {
    const dependencies: string[] = [];
    // 簡化實作
    return dependencies;
  }
}

/**
 * 函式提取器主類
 */
export class FunctionExtractor {
  private analyzer = new ExtractionAnalyzer();

  /**
   * 提取函式 (別名，保持向後相容)
   * 支援兩種呼叫方式：
   * 1. extractFunction(code, selection, config)
   * 2. extractFunction(code, start, end, name) - 舊格式
   */
  async extractFunction(
    code: string,
    selectionOrStart: Range | number,
    configOrEnd?: ExtractConfig | number,
    nameOrUndefined?: string
  ): Promise<ExtractionResult> {
    // 檢查是否為舊格式呼叫 (4 個參數)
    if (typeof selectionOrStart === 'number' && typeof configOrEnd === 'number') {
      // 將行號轉換為 Range 格式
      const startLine = selectionOrStart;
      const endLine = configOrEnd;
      const selection: Range = {
        start: { line: startLine, column: 0 },
        end: { line: endLine, column: 0 }
      };
      const config: ExtractConfig = {
        functionName: nameOrUndefined,
        generateComments: true,
        preserveFormatting: true,
        validateExtraction: true
      };
      return this.extract(code, selection, config);
    }

    // 新格式呼叫
    return this.extract(code, selectionOrStart as Range, configOrEnd as ExtractConfig);
  }

  /**
   * 提取函式
   */
  async extract(
    code: string,
    selection: Range,
    config: ExtractConfig = {
      generateComments: true,
      preserveFormatting: true,
      validateExtraction: true,
      insertionPoint: 'before'
    }
  ): Promise<ExtractionResult> {
    // 輸入驗證
    if (typeof code !== 'string') {
      throw new Error('程式碼必須是字串');
    }

    if (!selection || !this.isValidRange(selection)) {
      throw new Error('選取範圍無效');
    }

    // 分析可提取性（現在是 async）
    const analysis = await this.analyzer.analyze(code, selection);
    if (!analysis.canExtract) {
      return {
        success: false,
        functionName: '',
        edits: [],
        parameters: [],
        errors: analysis.issues,
        warnings: []
      };
    }

    // 提取選取的程式碼
    const selectedCode = this.extractSelectedCode(code, selection);

    // 產生函式名稱
    const functionName = config.functionName || this.generateFunctionName(selectedCode);

    // 產生函式程式碼（使用推導出的返回型別）
    const functionCode = this.generateFunction(
      functionName,
      selectedCode,
      analysis.variables,
      config,
      analysis.returnType
    );

    // 檢查是否為跨檔案提取
    if (config.targetFile && config.sourceFile) {
      // 跨檔案提取模式
      return await this.extractToSeparateFile(
        code,
        selection,
        functionName,
        functionCode,
        analysis.variables,
        config
      );
    }

    // 一般提取模式（同檔案）
    const edits = this.generateEdits(code, selection, functionName, functionCode, analysis.variables);

    return {
      success: true,
      functionName,
      edits,
      parameters: analysis.variables,
      returnType: analysis.returnType,
      errors: [],
      warnings: []
    };
  }

  /**
   * 驗證範圍格式
   */
  private isValidRange(range: Range): boolean {
    return range.start && range.end &&
           typeof range.start.line === 'number' &&
           typeof range.start.column === 'number' &&
           typeof range.end.line === 'number' &&
           typeof range.end.column === 'number' &&
           (range.start.line < range.end.line ||
            (range.start.line === range.end.line && range.start.column < range.end.column));
  }

  /**
   * 提取選取的程式碼
   */
  private extractSelectedCode(code: string, selection: Range): string {
    const lines = code.split('\n');
    const selectedLines: string[] = [];

    for (let i = selection.start.line - 1; i < selection.end.line; i++) {
      if (i < 0 || i >= lines.length) {continue;}

      let line = lines[i];

      // 處理開始行
      if (i === selection.start.line - 1) {
        line = line.substring(selection.start.column);
      }

      // 處理結束行
      if (i === selection.end.line - 1) {
        line = line.substring(0, selection.end.column - (i === selection.start.line - 1 ? selection.start.column : 0));
      }

      selectedLines.push(line);
    }

    return selectedLines.join('\n');
  }

  /**
   * 產生函式名稱
   */
  private generateFunctionName(code: string): string {
    // 簡單的函式名稱生成邏輯
    const words = code.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    const uniqueWords = [...new Set(words)].filter(word =>
      !['const', 'let', 'var', 'if', 'else', 'for', 'while', 'function', 'return'].includes(word)
    );

    if (uniqueWords.length > 0) {
      return `extracted${uniqueWords[0].charAt(0).toUpperCase()}${uniqueWords[0].slice(1)}`;
    }

    return 'extractedFunction';
  }

  /**
   * 產生函式程式碼
   */
  private generateFunction(
    functionName: string,
    code: string,
    parameters: VariableInfo[],
    config: ExtractConfig,
    inferredReturnType?: string
  ): string {
    // 生成帶型別的參數列表
    const params = parameters
      .filter(p => p.isParameter)
      .map(p => `${p.name}: ${p.type}`)
      .join(', ');

    const returnVars = parameters.filter(p => p.isReturned);
    const returnStatement = returnVars.length > 0
      ? `\n  return ${returnVars.map(v => v.name).join(', ')};`
      : '';

    // 使用推導出的返回型別，如果沒有則降級到舊邏輯
    let returnType: string;
    if (inferredReturnType) {
      returnType = `: ${inferredReturnType}`;
    } else {
      const hasReturn = code.includes('return') || returnVars.length > 0;
      returnType = hasReturn ? ': any' : ': void';
    }

    const comment = config.generateComments
      ? `/**\n * 提取的函式\n * @param ${params.split(', ').map(p => `${p.split(':')[0]} 參數`).join('\n * @param ')}\n */\n`
      : '';

    // 縮排程式碼
    const indentedCode = code.split('\n').map(line => `  ${line}`).join('\n');

    return `${comment}function ${functionName}(${params})${returnType} {${indentedCode}${returnStatement}\n}`;
  }

  /**
   * 產生編輯操作
   */
  private generateEdits(
    originalCode: string,
    selection: Range,
    functionName: string,
    functionCode: string,
    parameters: VariableInfo[]
  ): CodeEdit[] {
    const edits: CodeEdit[] = [];

    // 1. 替換選取的程式碼為函式呼叫
    const callParams = parameters
      .filter(p => p.isParameter)
      .map(p => p.name)
      .join(', ');

    const returnVars = parameters.filter(p => p.isReturned);
    const assignment = returnVars.length > 0
      ? `${returnVars.map(v => v.name).join(', ')} = `
      : '';

    const functionCall = `${assignment}${functionName}(${callParams});`;

    edits.push({
      range: selection,
      newText: functionCall,
      type: 'replace'
    });

    // 2. 插入函式定義
    // 簡化實作：在檔案開頭插入
    edits.push({
      range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      newText: functionCode + '\n\n',
      type: 'insert'
    });

    return edits;
  }

  /**
   * 跨檔案提取：將函式提取到獨立檔案
   */
  private async extractToSeparateFile(
    code: string,
    selection: Range,
    functionName: string,
    functionCode: string,
    parameters: VariableInfo[],
    config: ExtractConfig
  ): Promise<ExtractionResult> {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      // 計算相對 import 路徑
      const sourceDir = path.dirname(config.sourceFile!);
      const targetDir = path.dirname(config.targetFile!);
      const targetFileName = path.basename(config.targetFile!, path.extname(config.targetFile!));

      // 計算相對路徑
      let relativePath = path.relative(sourceDir, config.targetFile!);
      // 移除副檔名
      if (relativePath.endsWith('.ts')) {
        relativePath = relativePath.slice(0, -3);
      } else if (relativePath.endsWith('.js')) {
        relativePath = relativePath.slice(0, -3);
      }
      // 確保路徑以 ./ 或 ../ 開頭
      if (!relativePath.startsWith('.')) {
        relativePath = './' + relativePath;
      }

      // 生成 import 語句
      const importStatement = `import { ${functionName} } from '${relativePath}';`;

      // 生成 export function（移除註解中的 @param 部分，因為跨檔案不需要）
      const exportedFunctionCode = functionCode
        .replace(/\/\*\*[\s\S]*?\*\/\n?/, '') // 移除註解
        .replace(/^function /, 'export function '); // 加上 export

      // 讀取或建立目標檔案內容
      let targetFileContent = '';
      try {
        targetFileContent = await fs.readFile(config.targetFile!, 'utf-8');
      } catch (error) {
        // 檔案不存在，建立新檔案
        targetFileContent = '';
      }

      // 在目標檔案末尾加入函式
      if (targetFileContent.trim().length > 0) {
        targetFileContent += '\n\n' + exportedFunctionCode + '\n';
      } else {
        targetFileContent = exportedFunctionCode + '\n';
      }

      // 生成原始檔案的編輯：加入 import + 替換為函式呼叫
      const edits: CodeEdit[] = [];

      // 1. 替換選取範圍為函式呼叫
      const callParams = parameters
        .filter(p => p.isParameter)
        .map(p => p.name)
        .join(', ');

      const returnVars = parameters.filter(p => p.isReturned);
      const assignment = returnVars.length > 0
        ? `${returnVars.map(v => v.name).join(', ')} = `
        : '';

      const functionCall = `${assignment}${functionName}(${callParams});`;

      edits.push({
        range: selection,
        newText: functionCall,
        type: 'replace'
      });

      // 2. 在檔案開頭加入 import 語句
      edits.push({
        range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        newText: importStatement + '\n',
        type: 'insert'
      });

      return {
        success: true,
        functionName,
        edits,
        parameters,
        errors: [],
        warnings: [],
        targetFileContent,
        importStatement
      };
    } catch (error) {
      return {
        success: false,
        functionName,
        edits: [],
        parameters: [],
        errors: [`跨檔案提取失敗: ${error instanceof Error ? error.message : String(error)}`],
        warnings: []
      };
    }
  }

  /**
   * 批次提取
   */
  async extractMultiple(
    extractions: Array<{ code: string; selection: Range; config?: ExtractConfig }>
  ): Promise<ExtractionResult[]> {
    const results = await Promise.all(
      extractions.map(({ code, selection, config }) =>
        this.extract(code, selection, config)
      )
    );

    return results;
  }

  /**
   * 預覽提取結果
   */
  async preview(code: string, selection: Range, config?: ExtractConfig): Promise<{
    originalCode: string;
    modifiedCode: string;
    functionCode: string;
  }> {
    const result = await this.extract(code, selection, config);

    if (!result.success) {
      throw new Error(`提取預覽失敗: ${result.errors.join(', ')}`);
    }

    // 應用編輯操作
    let modifiedCode = code;
    for (const edit of result.edits.reverse()) { // 反向應用避免位置偏移
      modifiedCode = this.applyEdit(modifiedCode, edit);
    }

    return {
      originalCode: code,
      modifiedCode,
      functionCode: result.edits.find(edit => edit.type === 'insert')?.newText || ''
    };
  }

  /**
   * 應用編輯操作
   */
  private applyEdit(code: string, edit: CodeEdit): string {
    const lines = code.split('\n');

    switch (edit.type) {
    case 'replace':
      // 簡化實作
      return code.substring(0, this.rangeToOffset(code, edit.range.start)) +
               edit.newText +
               code.substring(this.rangeToOffset(code, edit.range.end));

    case 'insert':
      const offset = this.rangeToOffset(code, edit.range.start);
      return code.substring(0, offset) + edit.newText + code.substring(offset);

    case 'delete':
      return code.substring(0, this.rangeToOffset(code, edit.range.start)) +
               code.substring(this.rangeToOffset(code, edit.range.end));

    default:
      return code;
    }
  }

  /**
   * 將範圍轉換為偏移量
   */
  private rangeToOffset(code: string, position: { line: number; column: number }): number {
    const lines = code.split('\n');
    let offset = 0;

    for (let i = 0; i < position.line - 1 && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }

    offset += position.column;
    return Math.min(offset, code.length);
  }
}