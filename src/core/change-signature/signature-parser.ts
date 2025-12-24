/**
 * 簽名解析器
 * 從程式碼中提取函式簽名
 *
 * 此模組使用 Parser AST 精確解析函數簽章，正確處理：
 * - 字串中的逗號/括號（如 `fn(a = "(", b)`）
 * - 模板字面值中的特殊字元
 * - 複雜泛型巢狀（如 `Map<K, Fn<V>>`）
 */

import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { FunctionSignature, ParameterDefinition } from './types.js';
import { FileUtils, createFileUtils } from '@core/foundations/index.js';

/**
 * 簽名解析器
 */
export class SignatureParser {
  private readonly fileUtils: FileUtils;

  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem
  ) {
    this.fileUtils = createFileUtils(fileSystem, parserRegistry);
  }

  /**
   * 解析函式簽名
   */
  async parseSignature(filePath: string, functionName: string): Promise<FunctionSignature | null> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return null;
    }

    const extension = FileUtils.getFileExtension(filePath);

    switch (extension) {
      case '.ts':
      case '.tsx':
        return this.parseTypeScriptSignature(content, filePath, functionName);
      case '.js':
      case '.jsx':
        return this.parseJavaScriptSignature(content, filePath, functionName);
      default:
        return null;
    }
  }

  /**
   * 解析 TypeScript 函式簽名
   * 優先使用 Parser AST 精確解析，fallback 到正則表達式
   */
  private parseTypeScriptSignature(content: string, filePath: string, functionName: string): FunctionSignature | null {
    // 優先嘗試 AST 解析
    const astResult = this.parseWithAST(content, filePath, functionName);
    if (astResult) {
      return astResult;
    }

    // Fallback 到正則表達式解析
    return this.parseWithRegex(content, filePath, functionName);
  }

  /**
   * 使用 Parser AST 精確解析函數簽章
   * 正確處理字串中的逗號/括號、複雜泛型巢狀
   *
   * 效能優化：直接使用 AST 查找函數，不再先用正則找行號
   */
  private parseWithAST(content: string, filePath: string, functionName: string): FunctionSignature | null {
    const extension = FileUtils.getFileExtension(filePath);
    const parser = this.parserRegistry.getParser(extension);

    if (!parser?.formatSignature) {
      return null;
    }

    // 直接用 AST 解析，不需要先用正則找行號（效能優化）
    const signature = parser.formatSignature(content, functionName);
    if (!signature || signature.startLine === undefined) {
      return null;
    }

    const lineNumber = signature.startLine;
    const lines = content.split('\n');

    // 從 AST 簽章轉換為 ParameterDefinition
    const parameters: ParameterDefinition[] = signature.parameters.map((param, index) => ({
      name: param.name,
      type: param.type !== 'any' ? param.type : undefined,
      defaultValue: param.defaultValue,
      optional: param.optional,
      rest: param.name.startsWith('...'),
      range: {
        start: { line: lineNumber, column: index * 10 },
        end: { line: lineNumber, column: index * 10 + param.name.length }
      }
    }));

    // 計算結束位置
    const endLine = this.findFunctionEndLineWithAST(content, filePath, functionName, lineNumber)
      ?? this.findFunctionEndLine(lines, lineNumber - 1);

    // 解析函數元資訊（修飾符、是否方法）
    const { modifiers, isMethod, matchIndex, column } = this.extractFunctionMetadata(content, functionName);

    return {
      name: functionName,
      parameters,
      returnType: signature.returnType !== 'void' ? signature.returnType : undefined,
      location: {
        filePath,
        range: {
          start: { line: lineNumber, column: column + 1, offset: matchIndex },
          end: { line: endLine + 1, column: 1 }
        }
      },
      isMethod,
      className: isMethod ? this.findEnclosingClass(content, matchIndex) : undefined,
      modifiers
    };
  }

  /**
   * 使用 Parser AST 找到函數結束行
   */
  private findFunctionEndLineWithAST(
    content: string,
    filePath: string,
    functionName: string,
    _startLine: number
  ): number | null {
    const extension = FileUtils.getFileExtension(filePath);
    const parser = this.parserRegistry.getParser(extension);

    if (!parser?.getFullDeclarationRange) {
      return null;
    }

    const range = parser.getFullDeclarationRange(content, functionName, 'function', _startLine);
    return range ? range.end.line : null;
  }

  /**
   * 找到函數的行號（用於 AST 解析）
   */
  private findFunctionLineNumber(content: string, functionName: string): number | null {
    const patterns = [
      // function 宣告
      new RegExp(`^(\\s*)(export\\s+)?(async\\s+)?function\\s+${this.escapeRegex(functionName)}\\s*`, 'm'),
      // 箭頭函式
      new RegExp(`^(\\s*)(export\\s+)?(const|let|var)\\s+${this.escapeRegex(functionName)}\\s*`, 'm'),
      // class 方法
      new RegExp(`^(\\s*)(public|private|protected)?\\s*(static)?\\s*(async)?\\s*${this.escapeRegex(functionName)}\\s*[(<]`, 'm'),
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const matchIndex = content.indexOf(match[0]);
        const newlinesInMatch = (match[1] || '').split('\n').length - 1;
        return content.substring(0, matchIndex).split('\n').length + newlinesInMatch;
      }
    }

    return null;
  }

  /**
   * 提取函數元資訊（修飾符、是否方法等）
   */
  private extractFunctionMetadata(content: string, functionName: string): {
    modifiers: string[];
    isMethod: boolean;
    matchIndex: number;
    column: number;
  } {
    const patterns = [
      // function 宣告
      { pattern: new RegExp(`^(\\s*)(export\\s+)?(async\\s+)?function\\s+${this.escapeRegex(functionName)}`, 'm'), type: 'function' },
      // 箭頭函式
      { pattern: new RegExp(`^(\\s*)(export\\s+)?(const|let|var)\\s+${this.escapeRegex(functionName)}\\s*(?::\\s*[^=]+)?\\s*=\\s*(async\\s+)?`, 'm'), type: 'arrow' },
      // class 方法
      { pattern: new RegExp(`^(\\s*)(public|private|protected)?\\s*(static)?\\s*(async)?\\s*${this.escapeRegex(functionName)}`, 'm'), type: 'method' },
    ];

    for (const { pattern, type } of patterns) {
      const match = content.match(pattern);
      if (match) {
        const matchIndex = content.indexOf(match[0]);
        const column = (match[1] || '').replace(/^[\s\S]*\n/, '').length;
        const modifiers: string[] = [];
        let isMethod = false;

        switch (type) {
          case 'function':
            if (match[2]) { modifiers.push('export'); }
            if (match[3]) { modifiers.push('async'); }
            break;
          case 'arrow':
            if (match[2]) { modifiers.push('export'); }
            if (match[4]) { modifiers.push('async'); }
            break;
          case 'method':
            isMethod = true;
            if (match[2]) { modifiers.push(match[2]); }
            if (match[3]) { modifiers.push('static'); }
            if (match[4]) { modifiers.push('async'); }
            break;
        }

        return { modifiers, isMethod, matchIndex, column };
      }
    }

    return { modifiers: [], isMethod: false, matchIndex: 0, column: 0 };
  }

  /**
   * 使用正則表達式解析函數簽章（Fallback）
   * 當 AST 解析不可用時使用
   */
  private parseWithRegex(content: string, filePath: string, functionName: string): FunctionSignature | null {
    const lines = content.split('\n');

    // 匹配各種函式定義模式
    const patterns = [
      // function name(params): returnType
      new RegExp(`^(\\s*)(export\\s+)?(async\\s+)?function\\s+${this.escapeRegex(functionName)}\\s*(<[^>]*>)?\\s*\\(([^)]*)\\)\\s*(?::\\s*([^{]+))?\\s*\\{?`, 'm'),
      // const name = (params): returnType =>
      new RegExp(`^(\\s*)(export\\s+)?(const|let|var)\\s+${this.escapeRegex(functionName)}\\s*(?::\\s*[^=]+)?\\s*=\\s*(async\\s+)?\\(([^)]*)\\)\\s*(?::\\s*([^=]+))?\\s*=>`, 'm'),
      // class method: name(params): returnType
      new RegExp(`^(\\s*)(public|private|protected)?\\s*(static)?\\s*(async)?\\s*${this.escapeRegex(functionName)}\\s*(<[^>]*>)?\\s*\\(([^)]*)\\)\\s*(?::\\s*([^{]+))?\\s*\\{?`, 'm'),
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const matchIndex = content.indexOf(match[0]);

        /**
         * 行號計算邏輯說明：
         *
         * 問題背景：
         * 正則表達式使用 'm' 多行模式，^ 會匹配每行開頭而非僅字串開頭。
         * 當 match[1]（前導空白群組）跨越多行時，matchIndex 指向的是
         * 匹配「開始」的位置，但實際的函式定義可能在後面幾行。
         *
         * 範例：
         * ```
         * // Line 1: 空行
         * // Line 2: 空行
         *    function foo() {}  // Line 3: 函式定義
         * ```
         * 若 match[1] = "\n\n   "（包含2個換行），matchIndex 可能指向 Line 1，
         * 但函式實際在 Line 3。
         *
         * 計算公式：
         * 1. content.substring(0, matchIndex).split('\n').length
         *    → 取得匹配「起始位置」的行號
         * 2. newlinesInMatch = match[1] 中的換行數
         *    → 補償前導空白中包含的行數偏移
         * 3. 最終行號 = 起始行號 + 換行偏移量
         */
        const newlinesInMatch = (match[1] || '').split('\n').length - 1;
        const lineNumber = content.substring(0, matchIndex).split('\n').length + newlinesInMatch;

        // 計算欄位：取 match[1] 最後一行的長度（即最後一個換行後的空白數）
        const column = (match[1] || '').replace(/^[\s\S]*\n/, '').length;

        // 根據不同模式提取參數和修飾符
        let paramsString: string;
        let returnType: string | undefined;
        const modifiers: string[] = [];
        let isMethod = false;

        if (match[0].includes('function')) {
          // function 宣告
          if (match[2]) {modifiers.push('export');}
          if (match[3]) {modifiers.push('async');}
          paramsString = match[5] || '';
          returnType = match[6]?.trim();
        } else if (match[0].includes('=>')) {
          // 箭頭函式
          if (match[2]) {modifiers.push('export');}
          if (match[4]) {modifiers.push('async');}
          paramsString = match[5] || '';
          returnType = match[6]?.trim();
        } else {
          // 類別方法
          isMethod = true;
          if (match[2]) {modifiers.push(match[2]);}
          if (match[3]) {modifiers.push('static');}
          if (match[4]) {modifiers.push('async');}
          paramsString = match[6] || '';
          returnType = match[7]?.trim();
        }

        // 解析參數（使用 fallback 方法）
        const parameters = this.parseParametersWithRegex(paramsString, lineNumber, column + match[0].indexOf('(') + 1);

        // 計算結束位置
        const endLine = this.findFunctionEndLine(lines, lineNumber - 1);

        return {
          name: functionName,
          parameters,
          returnType: returnType?.replace(/\s*\{?\s*$/, ''),
          location: {
            filePath,
            range: {
              start: { line: lineNumber, column: column + 1, offset: matchIndex },
              end: { line: endLine + 1, column: 1 }
            }
          },
          isMethod,
          className: isMethod ? this.findEnclosingClass(content, matchIndex) : undefined,
          modifiers
        };
      }
    }

    return null;
  }

  /**
   * 解析 JavaScript 函式簽名（簡化版，不含類型）
   */
  private parseJavaScriptSignature(content: string, filePath: string, functionName: string): FunctionSignature | null {
    // JavaScript 版本基本上與 TypeScript 相同，但不解析類型
    const signature = this.parseTypeScriptSignature(content, filePath, functionName);

    if (signature) {
      // 移除類型資訊
      return {
        ...signature,
        returnType: undefined,
        parameters: signature.parameters.map(p => ({
          ...p,
          type: undefined
        }))
      };
    }

    return null;
  }

  /**
   * 使用正則表達式解析參數列表（Fallback）
   * 注意：此方法無法正確處理字串中的逗號/括號
   * 如：`fn(a = "(", b)` 會被錯誤分割
   */
  private parseParametersWithRegex(paramsString: string, baseLine: number, baseColumn: number): ParameterDefinition[] {
    if (!paramsString.trim()) {
      return [];
    }

    const parameters: ParameterDefinition[] = [];
    const params = this.splitParameters(paramsString);

    let currentColumn = baseColumn;

    for (const param of params) {
      const trimmed = param.trim();
      if (!trimmed) {continue;}

      // 解析參數：rest?, name, optional?, type?, defaultValue?
      const restMatch = trimmed.startsWith('...');
      const paramContent = restMatch ? trimmed.substring(3) : trimmed;

      // name?: type = default
      const paramPattern = /^(\w+)(\?)?\s*(?::\s*([^=]+))?\s*(?:=\s*(.+))?$/;
      const match = paramContent.match(paramPattern);

      if (match) {
        const name = match[1];
        const optional = !!match[2] || !!match[4]; // ? 或有預設值都是可選
        const type = match[3]?.trim();
        const defaultValue = match[4]?.trim();

        parameters.push({
          name,
          type,
          defaultValue,
          optional,
          rest: restMatch,
          range: {
            start: { line: baseLine, column: currentColumn },
            end: { line: baseLine, column: currentColumn + param.length }
          }
        });
      }

      currentColumn += param.length + 2; // +2 for ", "
    }

    return parameters;
  }

  /**
   * 分割參數字串（Fallback 方法）
   * 使用括號計數分割，僅考慮泛型和巢狀
   *
   * 警告：此方法無法正確處理：
   * - 字串中的逗號/括號（如 `fn(a = "(", b)`）
   * - 模板字面值中的特殊字元
   *
   * 優先使用 AST 解析（parseWithAST）
   */
  private splitParameters(paramsString: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;

    for (const char of paramsString) {
      if (char === '<' || char === '(' || char === '[' || char === '{') {
        depth++;
        current += char;
      } else if (char === '>' || char === ')' || char === ']' || char === '}') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      result.push(current);
    }

    return result;
  }

  /**
   * 找到函式結束行（Fallback 方法）
   * 使用大括號計數法，無法處理字串/註解中的括號
   *
   * 優先使用 findFunctionEndLineWithAST
   */
  private findFunctionEndLine(lines: string[], startLine: number): number {
    let depth = 0;
    let foundStart = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === '{') {
          depth++;
          foundStart = true;
        } else if (char === '}') {
          depth--;
          if (foundStart && depth === 0) {
            return i;
          }
        }
      }
    }

    return startLine;
  }

  /**
   * 找到包含的類別名稱
   */
  private findEnclosingClass(content: string, position: number): string | undefined {
    const beforePosition = content.substring(0, position);
    const classMatch = beforePosition.match(/class\s+(\w+)/g);

    if (classMatch && classMatch.length > 0) {
      const lastClass = classMatch[classMatch.length - 1];
      const nameMatch = lastClass.match(/class\s+(\w+)/);
      return nameMatch?.[1];
    }

    return undefined;
  }

  /**
   * 跳脫正則表達式特殊字元
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * 建立 SignatureParser 實例
 */
export function createSignatureParser(parserRegistry: ParserRegistry, fileSystem: IFileSystem): SignatureParser {
  return new SignatureParser(parserRegistry, fileSystem);
}
