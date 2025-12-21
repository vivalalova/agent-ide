/**
 * 參數解析器
 * 處理函式呼叫的參數解析
 */

import type { CallSiteArgument } from './types.js';

/**
 * 參數解析器
 * 提供函式呼叫參數的解析功能
 */
export class ArgumentsParser {
  /**
   * 分割參數（考慮巢狀括號和字串字面值）
   * 正確處理字串內的逗號，避免誤分割
   */
  splitArguments(argsString: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplate = false;

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];
      const prevChar = i > 0 ? argsString[i - 1] : '';

      // 處理字串字面值狀態（跳過轉義字元）
      if (prevChar !== '\\') {
        if (char === '\'' && !inDoubleQuote && !inTemplate) {
          inSingleQuote = !inSingleQuote;
        } else if (char === '"' && !inSingleQuote && !inTemplate) {
          inDoubleQuote = !inDoubleQuote;
        } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
          inTemplate = !inTemplate;
        }
      }

      const inString = inSingleQuote || inDoubleQuote || inTemplate;

      if (!inString) {
        if (char === '(' || char === '[' || char === '{') {
          depth++;
          current += char;
        } else if (char === ')' || char === ']' || char === '}') {
          depth--;
          current += char;
        } else if (char === ',' && depth === 0) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
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
   * 解析參數（單行版本）
   */
  parseArguments(argsString: string, line: number, baseColumn: number): CallSiteArgument[] {
    if (!argsString.trim()) {
      return [];
    }

    const args: CallSiteArgument[] = [];
    const parts = this.splitArguments(argsString);

    let column = baseColumn + 1;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const trimmed = part.trim();

      // 檢查是否是具名參數
      const namedMatch = trimmed.match(/^(\w+)\s*[:=]\s*(.+)$/);

      args.push({
        index: i,
        name: namedMatch ? namedMatch[1] : undefined,
        value: namedMatch ? namedMatch[2] : trimmed,
        range: {
          start: { line, column, offset: undefined },
          end: { line, column: column + part.length, offset: undefined }
        }
      });

      column += part.length + 1; // +1 for comma
    }

    return args;
  }

  /**
   * 解析參數（支援多行）
   */
  parseArgumentsMultiline(
    argsString: string,
    baseLine: number,
    baseColumn: number
  ): CallSiteArgument[] {
    if (!argsString.trim()) {
      return [];
    }

    const args: CallSiteArgument[] = [];
    const parts = this.splitArguments(argsString);

    let currentLine = baseLine;
    let column = baseColumn + 1;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const trimmed = part.trim();

      // 計算參數中的換行數
      const newlines = (part.match(/\n/g) || []).length;

      // 檢查是否是具名參數
      const namedMatch = trimmed.match(/^(\w+)\s*[:=]\s*(.+)$/s);

      args.push({
        index: i,
        name: namedMatch ? namedMatch[1] : undefined,
        value: namedMatch ? namedMatch[2].trim() : trimmed,
        range: {
          start: { line: currentLine, column, offset: undefined },
          end: { line: currentLine + newlines, column: column + part.length, offset: undefined }
        }
      });

      // 更新行號和欄位
      if (newlines > 0) {
        currentLine += newlines;
        // 計算最後一行的欄位位置
        const lastNewlineIndex = part.lastIndexOf('\n');
        column = part.length - lastNewlineIndex;
      } else {
        column += part.length + 1; // +1 for comma
      }
    }

    return args;
  }

  /**
   * 提取參數字串（單行版本）
   */
  extractArgumentsString(line: string, startIndex: number): string {
    let depth = 1;
    let i = startIndex + 1;
    let result = '';

    while (i < line.length && depth > 0) {
      const char = line[i];

      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      }

      if (depth > 0) {
        result += char;
      }
      i++;
    }

    return result;
  }

  /**
   * 提取參數字串（支援多行）
   * @returns { content: 完整參數字串, endLine: 結束行索引, endColumn: 結束欄位 }
   */
  extractArgumentsStringMultiline(
    lines: readonly string[],
    startLine: number,
    startIndex: number
  ): { content: string; endLine: number; endColumn: number } {
    let depth = 1;
    let lineIndex = startLine;
    let charIndex = startIndex + 1;
    let result = '';

    while (lineIndex < lines.length && depth > 0) {
      const line = lines[lineIndex];

      while (charIndex < line.length && depth > 0) {
        const char = line[charIndex];

        if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
        }

        if (depth > 0) {
          result += char;
        }
        charIndex++;
      }

      if (depth > 0 && lineIndex < lines.length - 1) {
        // 保留換行符號
        result += '\n';
        lineIndex++;
        charIndex = 0;
      } else {
        break;
      }
    }

    return {
      content: result,
      endLine: lineIndex,
      endColumn: charIndex - 1
    };
  }

  /**
   * 找到匹配的右括號位置（單行版本）
   */
  findMatchingCloseParen(line: string, openParenIndex: number): number {
    let depth = 1;
    let i = openParenIndex + 1;

    while (i < line.length && depth > 0) {
      const char = line[i];
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
      i++;
    }

    return -1;
  }

  /**
   * 找到匹配的右括號位置（支援多行）
   * @returns { line: 行索引, index: 該行的字元索引 }
   */
  findMatchingCloseParenMultiline(
    lines: readonly string[],
    startLine: number,
    openParenIndex: number
  ): { line: number; index: number } {
    let depth = 1;
    let lineIndex = startLine;
    let charIndex = openParenIndex + 1;

    while (lineIndex < lines.length && depth > 0) {
      const line = lines[lineIndex];

      while (charIndex < line.length && depth > 0) {
        const char = line[charIndex];
        if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
          if (depth === 0) {
            return { line: lineIndex, index: charIndex };
          }
        }
        charIndex++;
      }

      lineIndex++;
      charIndex = 0;
    }

    return { line: -1, index: -1 };
  }
}
