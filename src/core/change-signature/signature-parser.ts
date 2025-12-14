/**
 * 簽名解析器
 * 從程式碼中提取函式簽名
 */

import type { Range, Location } from '@shared/types/core.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { FunctionSignature, ParameterDefinition } from './types.js';

/**
 * 簽名解析器
 */
export class SignatureParser {
  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem
  ) {}

  /**
   * 解析函式簽名
   */
  async parseSignature(filePath: string, functionName: string): Promise<FunctionSignature | null> {
    const content = await this.readFile(filePath);
    if (!content) {
      return null;
    }

    const extension = this.getFileExtension(filePath);

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
   */
  private parseTypeScriptSignature(content: string, filePath: string, functionName: string): FunctionSignature | null {
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

        // 解析參數
        const parameters = this.parseTypeScriptParameters(paramsString, lineNumber, column + match[0].indexOf('(') + 1);

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
              end: { line: endLine + 1, column: 1, offset: undefined }
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
   * 解析 TypeScript 參數列表
   */
  private parseTypeScriptParameters(paramsString: string, baseLine: number, baseColumn: number): ParameterDefinition[] {
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
            start: { line: baseLine, column: currentColumn, offset: undefined },
            end: { line: baseLine, column: currentColumn + param.length, offset: undefined }
          }
        });
      }

      currentColumn += param.length + 2; // +2 for ", "
    }

    return parameters;
  }

  /**
   * 分割參數字串（考慮泛型和巢狀）
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
   * 找到函式結束行
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
   * 讀取檔案內容
   */
  private async readFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      return typeof content === 'string' ? content : content.toString('utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 取得檔案副檔名
   */
  private getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot >= 0 ? filePath.substring(lastDot) : '';
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
