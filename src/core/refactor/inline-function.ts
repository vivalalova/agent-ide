/**
 * 內聯函式重構器
 * 將函式呼叫替換為函式內容
 */

// 重用來自 extract-function 的介面
export interface Range {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface CodeEdit {
  range: Range;
  newText: string;
  type: 'replace' | 'insert' | 'delete';
}

// 函式定義資訊
export interface FunctionDefinition {
  name: string;
  parameters: string[];
  body: string;
  returnType?: string;
  location: Range;
  isArrow: boolean;
  isAsync: boolean;
}

// 函式呼叫資訊
export interface FunctionCall {
  name: string;
  arguments: string[];
  location: Range;
  assignTo?: string;
  isAwait: boolean;
}

// 內聯結果介面
export interface InlineResult {
  success: boolean;
  functionName: string;
  edits: CodeEdit[];
  inlinedCallsCount: number;
  removedFunction: boolean;
  errors: string[];
  warnings: string[];
}

// 內聯配置
export interface InlineConfig {
  removeFunction: boolean;
  preserveComments: boolean;
  validateInlining: boolean;
  inlineAllCalls: boolean;
  maxComplexity?: number;
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
  body?: ASTNode;
  params?: ASTNode[];
  arguments?: ASTNode[];
}

/**
 * 內聯分析器
 * 分析函式是否適合內聯
 */
export class InlineAnalyzer {
  /**
   * 分析函式的可內聯性
   */
  analyze(functionDef: FunctionDefinition, calls: FunctionCall[]): {
    canInline: boolean;
    issues: string[];
    complexity: number;
    callsCount: number;
    estimatedSizeIncrease: number;
  } {
    const issues: string[] = [];
    let complexity = 0;

    // 基本驗證
    if (!functionDef || !functionDef.body) {
      issues.push('函式定義無效');
      return { canInline: false, issues, complexity: 0, callsCount: 0, estimatedSizeIncrease: 0 };
    }

    if (calls.length === 0) {
      issues.push('沒有找到函式呼叫');
      return { canInline: false, issues, complexity: 0, callsCount: 0, estimatedSizeIncrease: 0 };
    }

    // 計算函式複雜度
    complexity = this.calculateComplexity(functionDef.body);

    // 檢查內聯限制
    this.checkInlineConstraints(functionDef, issues);

    // 檢查呼叫相容性
    this.checkCallCompatibility(functionDef, calls, issues);

    // 估算大小增長
    const bodySize = functionDef.body.length;
    const estimatedSizeIncrease = bodySize * (calls.length - 1); // -1 因為原函式會被移除

    return {
      canInline: issues.length === 0,
      issues,
      complexity,
      callsCount: calls.length,
      estimatedSizeIncrease
    };
  }

  /**
   * 計算函式複雜度（簡化版）
   */
  private calculateComplexity(code: string): number {
    let complexity = 1; // 基礎複雜度

    // 計算控制結構
    const patterns = [
      /\bif\b/g,           // if 語句
      /\belse\b/g,         // else 語句
      /\bfor\b/g,          // for 迴圈
      /\bwhile\b/g,        // while 迴圈
      /\bswitch\b/g,       // switch 語句
      /\bcatch\b/g,        // catch 語句
      /\b&&\b/g,           // 邏輯 AND
      /\b\|\|\b/g,         // 邏輯 OR
      /\?\s*.*?\s*:/g      // 三元運算子
    ];

    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * 檢查內聯限制
   */
  private checkInlineConstraints(functionDef: FunctionDefinition, issues: string[]): void {
    // 檢查遞迴調用
    if (this.isRecursive(functionDef)) {
      issues.push('函式包含遞迴調用，無法內聯');
    }

    // 檢查函式大小
    if (functionDef.body.length > 200) {
      issues.push('函式過大，內聯可能降低可讀性');
    }

    // 異步函式可以內聯，但會包裝為 IIFE
    // 這裡不再阻止異步函式內聯

    // 檢查 arguments 使用
    if (this.usesArguments(functionDef.body)) {
      issues.push('函式使用 arguments 對象，內聯可能有問題');
    }

    // 檢查 this 使用
    if (this.usesThis(functionDef.body)) {
      issues.push('函式使用 this，內聯可能改變上下文');
    }
  }

  /**
   * 檢查呼叫相容性
   */
  private checkCallCompatibility(functionDef: FunctionDefinition, calls: FunctionCall[], issues: string[]): void {
    for (const call of calls) {
      // 檢查參數數量
      if (call.arguments.length !== functionDef.parameters.length) {
        issues.push(`函式呼叫參數數量不匹配: ${call.arguments.length} vs ${functionDef.parameters.length}`);
      }

      // 檢查異步匹配
      if (functionDef.isAsync && !call.isAwait) {
        issues.push('異步函式呼叫缺少 await');
      }

      // 檢查變數名稱衝突
      const conflicts = this.findNameConflicts(functionDef, call);
      if (conflicts.length > 0) {
        issues.push(`變數名稱衝突: ${conflicts.join(', ')}`);
      }
    }
  }

  /**
   * 檢查是否為遞迴函式
   */
  private isRecursive(functionDef: FunctionDefinition): boolean {
    return functionDef.body.includes(functionDef.name);
  }

  /**
   * 檢查是否使用 arguments
   */
  private usesArguments(code: string): boolean {
    return /\barguments\b/.test(code);
  }

  /**
   * 檢查是否使用 this
   */
  private usesThis(code: string): boolean {
    return /\bthis\b/.test(code);
  }

  /**
   * 找出名稱衝突
   */
  private findNameConflicts(functionDef: FunctionDefinition, call: FunctionCall): string[] {
    const conflicts: string[] = [];
    // 簡化實作：實際需要進行詳細的作用域分析
    return conflicts;
  }
}

/**
 * 函式內聯器主類
 */
export class FunctionInliner {
  private analyzer = new InlineAnalyzer();

  /**
   * 內聯函式
   */
  async inline(
    code: string,
    functionName: string,
    config: InlineConfig = {
      removeFunction: true,
      preserveComments: false,
      validateInlining: true,
      inlineAllCalls: true
    }
  ): Promise<InlineResult> {
    // 輸入驗證
    if (typeof code !== 'string' || code.trim().length === 0) {
      throw new Error('程式碼不能為空');
    }

    if (!functionName || typeof functionName !== 'string') {
      throw new Error('函式名稱無效');
    }

    // 找出函式定義
    const functionDef = this.findFunctionDefinition(code, functionName);
    if (!functionDef) {
      return {
        success: false,
        functionName,
        edits: [],
        inlinedCallsCount: 0,
        removedFunction: false,
        errors: [`找不到函式定義: ${functionName}`],
        warnings: []
      };
    }

    // 找出所有函式呼叫
    const calls = this.findFunctionCalls(code, functionName);

    // 分析可內聯性
    const analysis = this.analyzer.analyze(functionDef, calls);
    if (!analysis.canInline) {
      return {
        success: false,
        functionName,
        edits: [],
        inlinedCallsCount: 0,
        removedFunction: false,
        errors: analysis.issues,
        warnings: []
      };
    }

    // 生成編輯操作
    const edits = this.generateInlineEdits(functionDef, calls, config);

    return {
      success: true,
      functionName,
      edits,
      inlinedCallsCount: calls.length,
      removedFunction: config.removeFunction,
      errors: [],
      warnings: analysis.estimatedSizeIncrease > 1000 ? ['內聯可能顯著增加程式碼大小'] : []
    };
  }

  /**
   * 找出函式定義
   */
  private findFunctionDefinition(code: string, functionName: string): FunctionDefinition | null {
    // 簡化實作：使用正則表達式找函式定義
    const patterns = [
      // 函式宣告: function name() {...}
      new RegExp(`function\\s+${functionName}\\s*\\(([^)]*)\\)\\s*\\{([^}]*)\\}`, 'g'),
      // 箭頭函式: const name = (...) => {...}
      new RegExp(`const\\s+${functionName}\\s*=\\s*\\(([^)]*)\\)\\s*=>\\s*\\{([^}]*)\\}`, 'g'),
      // 方法定義: name(...) {...}
      new RegExp(`${functionName}\\s*\\(([^)]*)\\)\\s*\\{([^}]*)\\}`, 'g')
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(code);
      if (match) {
        const parameters = match[1] ? match[1].split(',').map(p => p.trim()) : [];
        const body = match[2];

        return {
          name: functionName,
          parameters,
          body: body.trim(),
          location: this.getMatchLocation(code, match),
          isArrow: match[0].includes('=>'),
          isAsync: match[0].includes('async')
        };
      }
    }

    return null;
  }

  /**
   * 找出函式呼叫
   */
  private findFunctionCalls(code: string, functionName: string): FunctionCall[] {
    const calls: FunctionCall[] = [];

    // 簡化實作：使用正則表達式找函式呼叫
    const patterns = [
      // 一般呼叫: functionName(...)
      new RegExp(`${functionName}\\s*\\(([^)]*)\\)`, 'g'),
      // 賦值呼叫: var = functionName(...)
      new RegExp(`(\\w+)\\s*=\\s*${functionName}\\s*\\(([^)]*)\\)`, 'g'),
      // await 呼叫: await functionName(...)
      new RegExp(`await\\s+${functionName}\\s*\\(([^)]*)\\)`, 'g')
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const args = match[match.length - 1] ?
          match[match.length - 1].split(',').map(arg => arg.trim()) : [];

        calls.push({
          name: functionName,
          arguments: args,
          location: this.getMatchLocation(code, match),
          assignTo: match.length > 2 && !match[0].includes('await') ? match[1] : undefined,
          isAwait: match[0].includes('await')
        });
      }
    }

    return calls;
  }

  /**
   * 獲取匹配的位置資訊
   */
  private getMatchLocation(code: string, match: RegExpExecArray): Range {
    const start = match.index || 0;
    const end = start + match[0].length;

    const startPos = this.offsetToPosition(code, start);
    const endPos = this.offsetToPosition(code, end);

    return { start: startPos, end: endPos };
  }

  /**
   * 將偏移量轉換為行列位置
   */
  private offsetToPosition(code: string, offset: number): { line: number; column: number } {
    const lines = code.substring(0, offset).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length
    };
  }

  /**
   * 生成內聯編輯操作
   */
  private generateInlineEdits(
    functionDef: FunctionDefinition,
    calls: FunctionCall[],
    config: InlineConfig
  ): CodeEdit[] {
    const edits: CodeEdit[] = [];

    // 1. 替換所有函式呼叫
    for (const call of calls) {
      const inlinedCode = this.generateInlinedCode(functionDef, call);
      edits.push({
        range: call.location,
        newText: inlinedCode,
        type: 'replace'
      });
    }

    // 2. 移除函式定義（如果配置允許）
    if (config.removeFunction) {
      edits.push({
        range: functionDef.location,
        newText: '',
        type: 'delete'
      });
    }

    // 按位置排序（從後往前，避免位置偏移）
    edits.sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return b.range.start.line - a.range.start.line;
      }
      return b.range.start.column - a.range.start.column;
    });

    return edits;
  }

  /**
   * 生成內聯程式碼
   */
  private generateInlinedCode(functionDef: FunctionDefinition, call: FunctionCall): string {
    let inlinedBody = functionDef.body;

    // 替換參數
    for (let i = 0; i < functionDef.parameters.length; i++) {
      const param = functionDef.parameters[i];
      const arg = call.arguments[i] || 'undefined';

      // 簡化實作：全文替換參數名稱
      const paramRegex = new RegExp(`\\b${param}\\b`, 'g');
      inlinedBody = inlinedBody.replace(paramRegex, arg);
    }

    // 處理異步函式
    if (functionDef.isAsync) {
      // 異步函式需要包裝成立即執行的異步函式表達式
      if (call.assignTo) {
        // 如果有賦值，需要用 await
        return `${call.assignTo} = await (async () => {\n  ${inlinedBody}\n})()`;
      } else {
        // 否則直接包裝
        return `(async () => {\n  ${inlinedBody}\n})()`;
      }
    }

    // 處理同步函式的 return 語句
    if (call.assignTo) {
      // 如果有賦值，將 return 替換為賦值
      inlinedBody = inlinedBody.replace(/return\s+([^;]+);?/g, `${call.assignTo} = $1;`);
    } else {
      // 否則移除 return 語句
      inlinedBody = inlinedBody.replace(/return\s+([^;]+);?/g, '$1');
    }

    // 處理函式體格式
    if (inlinedBody.includes('\n')) {
      // 多行函式體，使用區塊包裝
      return `{\n${inlinedBody}\n}`;
    } else {
      // 單行函式體，直接內聯
      return inlinedBody.endsWith(';') ? inlinedBody : `${inlinedBody};`;
    }
  }

  /**
   * 預覽內聯結果
   */
  async preview(code: string, functionName: string, config?: InlineConfig): Promise<{
    originalCode: string;
    modifiedCode: string;
    removedFunction: string;
    changesCount: number;
  }> {
    const result = await this.inline(code, functionName, config);

    if (!result.success) {
      throw new Error(`內聯預覽失敗: ${result.errors.join(', ')}`);
    }

    // 應用編輯操作
    let modifiedCode = code;
    for (const edit of result.edits) {
      modifiedCode = this.applyEdit(modifiedCode, edit);
    }

    // 找出被移除的函式程式碼
    const functionDef = this.findFunctionDefinition(code, functionName);
    const removedFunction = functionDef ?
      code.substring(
        this.positionToOffset(code, functionDef.location.start),
        this.positionToOffset(code, functionDef.location.end)
      ) : '';

    return {
      originalCode: code,
      modifiedCode,
      removedFunction,
      changesCount: result.inlinedCallsCount + (result.removedFunction ? 1 : 0)
    };
  }

  /**
   * 批次內聯多個函式
   */
  async inlineMultiple(
    code: string,
    functionNames: string[],
    config?: InlineConfig
  ): Promise<{ code: string; results: InlineResult[] }> {
    let workingCode = code;
    const results: InlineResult[] = [];

    for (const functionName of functionNames) {
      const result = await this.inline(workingCode, functionName, config);
      results.push(result);

      if (result.success) {
        // 應用變更到工作程式碼
        for (const edit of result.edits) {
          workingCode = this.applyEdit(workingCode, edit);
        }
      }
    }

    return { code: workingCode, results };
  }

  /**
   * 應用編輯操作
   */
  private applyEdit(code: string, edit: CodeEdit): string {
    const startOffset = this.positionToOffset(code, edit.range.start);
    const endOffset = this.positionToOffset(code, edit.range.end);

    switch (edit.type) {
      case 'replace':
        return code.substring(0, startOffset) + edit.newText + code.substring(endOffset);

      case 'insert':
        return code.substring(0, startOffset) + edit.newText + code.substring(startOffset);

      case 'delete':
        return code.substring(0, startOffset) + code.substring(endOffset);

      default:
        return code;
    }
  }

  /**
   * 將位置轉換為偏移量
   */
  private positionToOffset(code: string, position: { line: number; column: number }): number {
    const lines = code.split('\n');
    let offset = 0;

    for (let i = 0; i < position.line - 1 && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }

    offset += position.column;
    return Math.min(offset, code.length);
  }
}