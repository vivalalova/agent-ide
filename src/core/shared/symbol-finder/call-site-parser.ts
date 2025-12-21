/**
 * 呼叫點解析器
 * 負責解析函式呼叫點及其參數
 */

import type { CallSite, CallSiteArgument } from './types.js';
import { TextMatcher } from './text-matcher.js';

/**
 * 呼叫點解析器
 * 提供函式呼叫點的解析和參數提取能力
 */
export class CallSiteParser {
  private readonly textMatcher: TextMatcher;

  constructor() {
    this.textMatcher = new TextMatcher();
  }

  /**
   * 查找檔案中的函式呼叫點
   */
  findCallSitesInFile(
    filePath: string,
    content: string,
    functionName: string
  ): CallSite[] {
    const callSites: CallSite[] = [];
    const lines = content.split('\n');

    // 使用正則表達式查找呼叫點
    const callPattern = new RegExp(
      `(?:(\\w+)\\.)?${this.textMatcher.escapeRegex(functionName)}\\s*\\(`,
      'g'
    );

    // 函式定義的關鍵字模式（用於排除函式定義）
    const definitionKeywords = /(?:^|[\s{;])(async\s+)?(function\s+|static\s+|private\s+|public\s+|protected\s+|get\s+|set\s+)/;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      let match;

      while ((match = callPattern.exec(line)) !== null) {
        const receiver = match[1];
        const startColumn = match.index + 1;

        // 排除函式定義：檢查前面是否有定義關鍵字
        const beforeMatch = line.substring(0, match.index);
        if (definitionKeywords.test(beforeMatch)) {
          continue;
        }

        // 排除方法定義：檢查是否在類別中定義方法（沒有 receiver 且後面有返回類型）
        if (!receiver) {
          // 找到對應的右括號（支援多行）
          const argsStart = match.index + match[0].length - 1;
          const multilineResult = this.findMatchingCloseParenMultiline(lines, lineIndex, argsStart);
          if (multilineResult.index >= 0) {
            // 檢查右括號後是否有冒號（表示返回類型，即方法定義）
            const closingLine = lines[multilineResult.line];
            const afterParen = closingLine.substring(multilineResult.index + 1).trim();
            if (afterParen.startsWith(':') || afterParen.startsWith('{')) {
              continue;
            }
          }
        }

        // 解析參數（支援多行）
        const argsStart = match.index + match[0].length - 1;
        const multilineArgs = this.extractArgumentsStringMultiline(lines, lineIndex, argsStart);
        const args = this.parseArgumentsMultiline(multilineArgs.content, lineIndex + 1, argsStart);

        callSites.push({
          functionName,
          location: {
            filePath,
            range: {
              start: { line: lineIndex + 1, column: startColumn, offset: undefined },
              end: { line: multilineArgs.endLine + 1, column: multilineArgs.endColumn + 1, offset: undefined }
            }
          },
          arguments: args,
          isMethodCall: !!receiver,
          receiver
        });
      }
    }

    return callSites;
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
   * 解析參數（支援多行）
   */
  parseArgumentsMultiline(argsString: string, baseLine: number, baseColumn: number): CallSiteArgument[] {
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

  /**
   * 分割參數（考慮巢狀括號）
   */
  splitArguments(argsString: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;

    for (const char of argsString) {
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
    }

    if (current.trim()) {
      result.push(current);
    }

    return result;
  }
}

/**
 * 建立 CallSiteParser 實例
 */
export function createCallSiteParser(): CallSiteParser {
  return new CallSiteParser();
}
