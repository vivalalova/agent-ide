/**
 * 呼叫點查找器
 * 處理函式呼叫點的檢測
 */

import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { CallSite } from './types.js';
import { TextMatcher } from './text-matcher.js';
import { ArgumentsParser } from './arguments-parser.js';

/**
 * 呼叫點查找器
 * 負責在檔案中找到函式的呼叫點
 */
export class CallSiteFinder {
  private readonly textMatcher: TextMatcher;
  private readonly argumentsParser: ArgumentsParser;

  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem
  ) {
    this.textMatcher = new TextMatcher();
    this.argumentsParser = new ArgumentsParser();
  }

  /**
   * 查找函式的所有呼叫點
   */
  async findCallSites(functionName: string, projectFiles: readonly string[]): Promise<CallSite[]> {
    const results: CallSite[] = [];

    for (const filePath of projectFiles) {
      const callSites = await this.findCallSitesInFile(filePath, functionName);
      results.push(...callSites);
    }

    return results;
  }

  /**
   * 查找檔案中的函式呼叫點
   * 排除註解和字串中的呼叫
   */
  async findCallSitesInFile(filePath: string, functionName: string): Promise<CallSite[]> {
    const content = await this.readFile(filePath);
    if (!content) {
      return [];
    }

    const parser = this.getParser(filePath);
    if (!parser) {
      return [];
    }

    try {
      // 驗證檔案可解析（確保語法正確）
      await parser.parse(content, filePath);

      // 查找所有函式呼叫
      const callSites: CallSite[] = [];
      const lines = content.split('\n');

      // 使用正則表達式查找呼叫點
      // 匹配 receiver.method() 形式，其中 receiver 可以是:
      // - 單一識別符：foo.get()
      // - this.property：this.sessions.get()
      // - 鏈式呼叫：obj.prop.method.get()
      const callPattern = new RegExp(
        `(?:((?:\\w+\\.)*\\w+)\\.)?${this.textMatcher.escapeRegex(functionName)}\\s*\\(`,
        'g'
      );

      // 函式定義的關鍵字模式（用於排除函式定義）
      const definitionKeywords = /(?:^|[\s{;])(async\s+)?(function\s+|static\s+|private\s+|public\s+|protected\s+|get\s+|set\s+)/;

      // 追蹤多行註解狀態（處理完前一行後的狀態）
      let inBlockCommentBeforeLine = false;

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];

        // 記錄這行開始時的狀態（用於 isInCommentWithState）
        const lineStartsInComment = inBlockCommentBeforeLine;

        // 計算這行結束後的 block comment 狀態
        // 正確處理同一行中多個區塊註解的情況
        const inBlockCommentAfterLine = this.textMatcher.computeBlockCommentStateAfterLine(
          line,
          inBlockCommentBeforeLine
        );

        // 如果整行都在註解中（開始時在 block comment 且沒有 */），跳過
        if (lineStartsInComment && !line.includes('*/')) {
          inBlockCommentBeforeLine = inBlockCommentAfterLine;
          continue;
        }

        let match;

        while ((match = callPattern.exec(line)) !== null) {
          const receiver = match[1];
          const startColumn = match.index + 1;
          const matchPosition = match.index;

          // 排除註解中的呼叫（傳入已計算的 block comment 狀態避免重複遍歷）
          if (this.textMatcher.isInCommentWithState(line, matchPosition, lineStartsInComment)) {
            continue;
          }

          // 排除字串中的呼叫
          if (this.textMatcher.isInString(line, matchPosition)) {
            continue;
          }

          // 排除函式定義：檢查前面是否有定義關鍵字
          const beforeMatch = line.substring(0, match.index);
          if (definitionKeywords.test(beforeMatch)) {
            continue;
          }

          // 排除方法定義：檢查是否在類別中定義方法（沒有 receiver 且後面有返回類型）
          if (!receiver) {
            // 找到對應的右括號（支援多行）
            const argsStart = match.index + match[0].length - 1;
            const multilineResult = this.argumentsParser.findMatchingCloseParenMultiline(
              lines,
              lineIndex,
              argsStart
            );
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
          const multilineArgs = this.argumentsParser.extractArgumentsStringMultiline(
            lines,
            lineIndex,
            argsStart
          );
          const args = this.argumentsParser.parseArgumentsMultiline(
            multilineArgs.content,
            lineIndex + 1,
            argsStart
          );

          callSites.push({
            functionName,
            location: {
              filePath,
              range: {
                start: { line: lineIndex + 1, column: startColumn, offset: undefined },
                end: {
                  line: multilineArgs.endLine + 1,
                  column: multilineArgs.endColumn + 1,
                  offset: undefined
                }
              }
            },
            arguments: args,
            isMethodCall: !!receiver,
            receiver
          });
        }

        // 更新狀態供下一行使用
        inBlockCommentBeforeLine = inBlockCommentAfterLine;
      }

      return callSites;
    } catch {
      return [];
    }
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
   * 取得對應的 Parser
   */
  private getParser(filePath: string) {
    const extension = this.getFileExtension(filePath);
    return this.parserRegistry.getParser(extension);
  }

  /**
   * 取得檔案副檔名
   */
  private getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot >= 0 ? filePath.substring(lastDot) : '';
  }
}
