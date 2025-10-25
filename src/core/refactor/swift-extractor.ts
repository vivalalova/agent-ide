/**
 * Swift 程式碼提取器
 * 支援 Swift 語言的函式和閉包提取
 */

export interface SwiftRange {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface SwiftExtractionResult {
  success: boolean;
  functionName: string;
  extractedFunction: {
    name: string;
    parameters: Array<{ name: string; type: string }>;
    returnType?: string;
    signature: string;
  };
  modifiedCode: string;
  errors: string[];
  warnings: string[];
}

export interface SwiftExtractConfig {
  functionName: string;
  generateComments?: boolean;
  preserveFormatting?: boolean;
}

/**
 * Swift 函式提取器
 * 簡化實作：基於行號的文字處理
 */
export class SwiftExtractor {
  /**
   * 提取函式
   */
  async extractFunction(
    code: string,
    range: SwiftRange,
    config: SwiftExtractConfig
  ): Promise<SwiftExtractionResult> {
    try {
      // 提取選定的程式碼行
      const selectedCode = this.extractLines(code, range);

      if (!selectedCode.trim()) {
        return this.createErrorResult('選取範圍為空', config.functionName);
      }

      // 分析程式碼（簡化版）
      const analysis = this.analyzeSwiftCode(selectedCode, code);

      // 生成函式簽名
      const functionSignature = this.generateSwiftFunctionSignature(
        config.functionName,
        analysis.parameters,
        analysis.returnType,
        analysis.isAsync,
        analysis.throws
      );

      // 生成完整的函式定義
      const functionBody = this.indentCode(selectedCode, '    ');
      const functionDefinition = `${functionSignature} {\n${functionBody}\n}`;

      // 生成函式呼叫
      const functionCall = this.generateSwiftFunctionCall(
        config.functionName,
        analysis.parameters,
        analysis.isAsync
      );

      // 替換程式碼
      const modifiedCode = this.replaceLines(code, range, functionCall, functionDefinition);

      return {
        success: true,
        functionName: config.functionName,
        extractedFunction: {
          name: config.functionName,
          parameters: analysis.parameters,
          returnType: analysis.returnType,
          signature: functionSignature
        },
        modifiedCode,
        errors: [],
        warnings: []
      };
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : String(error),
        config.functionName
      );
    }
  }

  /**
   * 提取閉包
   */
  async extractClosure(
    code: string,
    range: SwiftRange,
    config: SwiftExtractConfig
  ): Promise<SwiftExtractionResult> {
    // 閉包提取邏輯類似函式提取
    return this.extractFunction(code, range, config);
  }

  /**
   * 從程式碼中提取指定行
   */
  private extractLines(code: string, range: SwiftRange): string {
    const lines = code.split('\n');
    const startIdx = range.start.line - 1;
    const endIdx = range.end.line;

    if (startIdx < 0 || endIdx > lines.length) {
      throw new Error(`行號範圍無效: ${range.start.line}-${range.end.line}`);
    }

    const selectedLines = lines.slice(startIdx, endIdx);

    // 移除共同的前導空白
    const minIndent = this.getMinIndent(selectedLines);
    return selectedLines.map(line => line.slice(minIndent)).join('\n');
  }

  /**
   * 取得最小縮排
   */
  private getMinIndent(lines: string[]): number {
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    if (nonEmptyLines.length === 0) {return 0;}

    return Math.min(...nonEmptyLines.map(line => {
      const match = line.match(/^(\s*)/);
      return match ? match[1].length : 0;
    }));
  }

  /**
   * 分析 Swift 程式碼（簡化版）
   */
  private analyzeSwiftCode(selectedCode: string, fullCode: string): {
    parameters: Array<{ name: string; type: string }>;
    returnType?: string;
    isAsync: boolean;
    throws: boolean;
  } {
    const parameters: Array<{ name: string; type: string }> = [];
    let returnType: string | undefined;
    const isAsync = selectedCode.includes('await');
    const throws = selectedCode.includes('throw ');

    // 簡化的變數檢測：找出可能的外部變數
    const declaredVars = this.findDeclaredVariables(selectedCode);
    const usedVars = this.findUsedVariables(selectedCode);

    // 外部變數 = 使用但未在選取範圍內宣告的變數
    const externalVars = usedVars.filter(v => !declaredVars.has(v));

    // 將外部變數作為參數（簡化：使用 Any 型別）
    for (const varName of externalVars) {
      // 嘗試從上下文推斷型別
      const type = this.inferSwiftType(varName, fullCode);
      parameters.push({ name: varName, type });
    }

    // 檢測返回型別
    if (selectedCode.includes('return ')) {
      returnType = this.inferReturnType(selectedCode);
    }

    return { parameters, returnType, isAsync, throws };
  }

  /**
   * 找出宣告的變數
   */
  private findDeclaredVariables(code: string): Set<string> {
    const declared = new Set<string>();

    // let/var 宣告
    const declPattern = /\b(?:let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match;
    while ((match = declPattern.exec(code)) !== null) {
      declared.add(match[1]);
    }

    // 函式參數
    const funcPattern = /func\s+\w+\s*\(([^)]*)\)/g;
    while ((match = funcPattern.exec(code)) !== null) {
      const params = match[1].split(',');
      for (const param of params) {
        const paramMatch = param.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (paramMatch) {
          declared.add(paramMatch[1]);
        }
      }
    }

    // for-in 迴圈變數
    const forPattern = /for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in/g;
    while ((match = forPattern.exec(code)) !== null) {
      declared.add(match[1]);
    }

    return declared;
  }

  /**
   * 找出使用的變數
   */
  private findUsedVariables(code: string): string[] {
    const used: string[] = [];
    const keywords = new Set([
      'let', 'var', 'func', 'class', 'struct', 'enum', 'protocol', 'extension',
      'import', 'if', 'else', 'guard', 'for', 'while', 'do', 'try', 'catch',
      'return', 'throw', 'await', 'async', 'nil', 'self', 'Self', 'true', 'false',
      'in', 'is', 'as', 'switch', 'case', 'default', 'break', 'continue', 'fallthrough'
    ]);

    // 找出所有標識符
    const identPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    let match;
    while ((match = identPattern.exec(code)) !== null) {
      const ident = match[1];
      if (!keywords.has(ident) && !used.includes(ident)) {
        used.push(ident);
      }
    }

    return used;
  }

  /**
   * 推斷 Swift 型別（簡化版）
   */
  private inferSwiftType(varName: string, fullCode: string): string {
    // 嘗試從宣告中找型別註解
    const typeAnnotationPattern = new RegExp(
      `\\b${varName}\\s*:\\s*([a-zA-Z][a-zA-Z0-9<>, ]*)`,
      'g'
    );
    const match = typeAnnotationPattern.exec(fullCode);
    if (match) {
      return match[1].trim();
    }

    // 預設使用泛型型別
    return 'Any';
  }

  /**
   * 推斷返回型別
   */
  private inferReturnType(code: string): string {
    // 尋找 return 語句
    const returnPattern = /return\s+(.+?)(?:\n|$|;)/;
    const match = returnPattern.exec(code);

    if (!match) {return 'Void';}

    const returnExpr = match[1].trim();

    // 簡單的型別推斷
    if (returnExpr === 'true' || returnExpr === 'false') {return 'Bool';}
    if (returnExpr.match(/^\d+$/)) {return 'Int';}
    if (returnExpr.match(/^\d+\.\d+$/)) {return 'Double';}
    if (returnExpr.match(/^".*"$/)) {return 'String';}
    if (returnExpr === 'nil') {return 'Any?';}

    // 預設
    return 'Any';
  }

  /**
   * 生成 Swift 函式簽名
   */
  private generateSwiftFunctionSignature(
    name: string,
    parameters: Array<{ name: string; type: string }>,
    returnType: string | undefined,
    isAsync: boolean,
    throws: boolean
  ): string {
    const paramList = parameters
      .map(p => `${p.name}: ${p.type}`)
      .join(', ');

    let signature = `func ${name}(${paramList})`;

    if (isAsync) {signature += ' async';}
    if (throws) {signature += ' throws';}
    if (returnType && returnType !== 'Void') {
      signature += ` -> ${returnType}`;
    }

    return signature;
  }

  /**
   * 生成 Swift 函式呼叫
   */
  private generateSwiftFunctionCall(
    name: string,
    parameters: Array<{ name: string; type: string }>,
    isAsync: boolean
  ): string {
    const argList = parameters.map(p => p.name).join(', ');
    const awaitPrefix = isAsync ? 'await ' : '';
    return `${awaitPrefix}${name}(${argList})`;
  }

  /**
   * 縮排程式碼
   */
  private indentCode(code: string, indent: string): string {
    return code.split('\n').map(line => {
      if (line.trim().length === 0) {return line;}
      return indent + line;
    }).join('\n');
  }

  /**
   * 替換行並插入函式定義
   */
  private replaceLines(
    code: string,
    range: SwiftRange,
    functionCall: string,
    functionDefinition: string
  ): string {
    const lines = code.split('\n');
    const startIdx = range.start.line - 1;
    const endIdx = range.end.line;

    // 保留原始行的縮排
    const originalLine = lines[startIdx] || '';
    const indent = originalLine.match(/^(\s*)/)?.[1] || '';

    // 替換選取範圍為函式呼叫
    const before = lines.slice(0, startIdx);
    const after = lines.slice(endIdx);

    // 插入函式定義（在原始位置之前）
    const modifiedLines = [
      ...before,
      '', // 空行
      ...functionDefinition.split('\n').map(line =>
        line.length > 0 ? indent + line : line
      ),
      '', // 空行
      indent + functionCall,
      ...after
    ];

    return modifiedLines.join('\n');
  }

  /**
   * 建立錯誤結果
   */
  private createErrorResult(error: string, functionName: string): SwiftExtractionResult {
    return {
      success: false,
      functionName,
      extractedFunction: {
        name: functionName,
        parameters: [],
        signature: ''
      },
      modifiedCode: '',
      errors: [error],
      warnings: []
    };
  }
}
