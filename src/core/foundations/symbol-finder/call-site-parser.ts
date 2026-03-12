/**
 * 呼叫點解析器
 * 負責解析函式呼叫點及其參數
 */

import * as ts from 'typescript';
import type { Range } from '@shared/types/core.js';
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
   * 使用 TypeScript AST 進行精確解析，正確處理字串、註解中的括號
   */
  findCallSitesInFile(
    filePath: string,
    content: string,
    functionName: string
  ): CallSite[] {
    const callSites: CallSite[] = [];

    try {
      // 使用 TypeScript 解析程式碼
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
          const callInfo = this.extractCallExpressionInfo(node, sourceFile, functionName);
          if (callInfo) {
            callSites.push({
              functionName,
              location: {
                filePath,
                range: callInfo.range
              },
              arguments: callInfo.arguments,
              isMethodCall: callInfo.isMethodCall,
              receiver: callInfo.receiver
            });
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    } catch (error) {
      // AST 解析失敗，fallback 到正則匹配（保留向後相容）
      console.warn(`[call-site-parser] AST parse failed for ${filePath}, using regex fallback:`, error);
      return this.findCallSitesInFileFallback(filePath, content, functionName);
    }

    return callSites;
  }

  /**
   * 從 CallExpression 節點提取呼叫資訊
   */
  private extractCallExpressionInfo(
    node: ts.CallExpression,
    sourceFile: ts.SourceFile,
    targetName: string
  ): {
    range: Range;
    arguments: CallSiteArgument[];
    isMethodCall: boolean;
    receiver?: string;
  } | null {
    const expr = node.expression;
    let calleeName: string;
    let isMethodCall = false;
    let receiver: string | undefined;

    if (ts.isIdentifier(expr)) {
      calleeName = expr.text;
    } else if (ts.isPropertyAccessExpression(expr)) {
      calleeName = expr.name.text;
      isMethodCall = true;
      receiver = expr.expression.getText(sourceFile);
    } else {
      // 不支援的呼叫類型
      return null;
    }

    // 檢查是否為目標函式
    if (calleeName !== targetName) {
      return null;
    }

    // 檢查是否為函式定義（排除）
    if (this.isPartOfFunctionDefinition(node, sourceFile)) {
      return null;
    }

    // 提取位置資訊
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    // 提取參數
    const args = this.extractArgumentsFromCallExpression(node, sourceFile);

    return {
      range: {
        start: { line: start.line + 1, column: start.character + 1 },
        end: { line: end.line + 1, column: end.character + 1 }
      },
      arguments: args,
      isMethodCall,
      receiver
    };
  }

  /**
   * 從 CallExpression 提取參數列表
   * 使用 AST 精確解析，正確處理字串中的括號和逗號
   */
  private extractArgumentsFromCallExpression(
    node: ts.CallExpression,
    sourceFile: ts.SourceFile
  ): CallSiteArgument[] {
    const args: CallSiteArgument[] = [];

    for (let i = 0; i < node.arguments.length; i++) {
      const arg = node.arguments[i];
      const start = sourceFile.getLineAndCharacterOfPosition(arg.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(arg.getEnd());

      // 檢查是否為具名參數（物件屬性簡寫或物件字面量）
      let name: string | undefined;
      let value = arg.getText(sourceFile);

      // 處理 { key: value } 或 key = value 形式的具名參數
      if (ts.isPropertyAssignment(arg) && ts.isIdentifier(arg.name)) {
        name = arg.name.text;
        value = arg.initializer.getText(sourceFile);
      } else if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (ts.isIdentifier(arg.left)) {
          name = arg.left.text;
          value = arg.right.getText(sourceFile);
        }
      }

      args.push({
        index: i,
        name,
        value: value.trim(),
        range: {
          start: { line: start.line + 1, column: start.character + 1 },
          end: { line: end.line + 1, column: end.character + 1 }
        }
      });
    }

    return args;
  }

  /**
   * 檢查呼叫是否為函式定義的一部分（需排除）
   */
  private isPartOfFunctionDefinition(node: ts.CallExpression, sourceFile: ts.SourceFile): boolean {
    // 向上遍歷父節點，檢查是否在函式宣告中
    let current: ts.Node = node;

    while (current.parent) {
      const parent = current.parent;

      // 如果父節點是函式宣告且呼叫不在函式體內，則是定義的一部分
      if (ts.isFunctionDeclaration(parent) && parent.name) {
        // 檢查呼叫是否在函式體內
        if (parent.body && this.nodeContains(parent.body, node, sourceFile)) {
          return false; // 在函式體內，是真正的呼叫
        }
        return true; // 不在函式體內，是定義的一部分
      }

      // 方法定義
      if (ts.isMethodDeclaration(parent)) {
        if (parent.body && this.nodeContains(parent.body, node, sourceFile)) {
          return false;
        }
        return true;
      }

      current = parent;
    }

    return false;
  }

  /**
   * 檢查容器節點是否包含目標節點
   */
  private nodeContains(container: ts.Node, target: ts.Node, sourceFile: ts.SourceFile): boolean {
    const containerStart = container.getStart(sourceFile);
    const containerEnd = container.getEnd();
    const targetStart = target.getStart(sourceFile);
    const targetEnd = target.getEnd();

    return targetStart >= containerStart && targetEnd <= containerEnd;
  }

  /**
   * Fallback：使用正則表達式查找呼叫點（當 AST 解析失敗時）
   * 保留原有邏輯以維持向後相容
   */
  private findCallSitesInFileFallback(
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
              start: { line: lineIndex + 1, column: startColumn },
              end: { line: multilineArgs.endLine + 1, column: multilineArgs.endColumn + 1 }
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
          start: { line: currentLine, column },
          end: { line: currentLine + newlines, column: column + part.length }
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
   * 注意：此方法無法正確處理字串中的括號，僅作為 fallback 使用
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
