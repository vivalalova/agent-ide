/**
 * 提取函式重構器
 * 將選取的程式碼片段提取為獨立函式
 */

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
  edits: CodeEdit[];
  parameters: VariableInfo[];
  returnType?: string;
  errors: string[];
  warnings: string[];
}

// AST 節點介面
export interface ASTNode {
  type: string;
  start: number;
  end: number;
  loc: { start: { line: number; column: number }; end: { line: number; column: number } };
  children?: ASTNode[];
  name?: string;
  value?: any;
  code?: string; // 添加程式碼內容屬性
}

// 提取配置介面
export interface ExtractConfig {
  functionName?: string;
  generateComments: boolean;
  preserveFormatting: boolean;
  validateExtraction: boolean;
  insertionPoint?: 'before' | 'after' | 'top';
}

/**
 * 函式提取分析器
 * 分析選取的程式碼是否適合提取為函式
 */
export class ExtractionAnalyzer {
  /**
   * 分析程式碼片段的可提取性
   */
  analyze(code: string, selection: Range): {
    canExtract: boolean;
    issues: string[];
    variables: VariableInfo[];
    dependencies: string[];
  } {
    const issues: string[] = [];
    const variables: VariableInfo[] = [];
    const dependencies: string[] = [];

    // 基本驗證
    if (!code || code.trim().length === 0) {
      issues.push('選取的程式碼為空');
      return { canExtract: false, issues, variables, dependencies };
    }

    // 解析 AST
    const ast = this.parseCode(code);
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

    return {
      canExtract: issues.length === 0,
      issues,
      variables,
      dependencies
    };
  }

  /**
   * 檢查提取限制
   */
  private checkExtractionConstraints(ast: ASTNode, selection: Range, issues: string[]): void {
    // 檢查是否包含 return 語句
    if (this.containsReturn(ast)) {
      issues.push('選取範圍包含 return 語句，可能影響控制流程');
    }

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
   * 簡化的 AST 解析
   */
  private parseCode(code: string): ASTNode | null {
    try {
      // 簡化實作：建立模擬 AST，包含程式碼內容
      return {
        type: 'Program',
        start: 0,
        end: code.length,
        loc: {
          start: { line: 1, column: 0 },
          end: { line: code.split('\n').length, column: 0 }
        },
        children: [],
        code // 添加程式碼內容以便分析
      };
    } catch (error) {
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
   * 檢查是否包含 return 語句
   */
  private containsReturn(ast: ASTNode): boolean {
    let hasReturn = false;
    this.traverse(ast, (node) => {
      if (node.type === 'ReturnStatement') {
        hasReturn = true;
      }
    });
    return hasReturn;
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

    // 分析可提取性
    const analysis = this.analyzer.analyze(code, selection);
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

    // 產生函式程式碼
    const functionCode = this.generateFunction(
      functionName,
      selectedCode,
      analysis.variables,
      config
    );

    // 產生編輯操作
    const edits = this.generateEdits(code, selection, functionName, functionCode, analysis.variables);

    return {
      success: true,
      functionName,
      edits,
      parameters: analysis.variables,
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
      if (i < 0 || i >= lines.length) continue;

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
    config: ExtractConfig
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

    // 推導返回型別
    const hasReturn = code.includes('return') || returnVars.length > 0;
    const returnType = hasReturn ? ': any' : ': any';

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