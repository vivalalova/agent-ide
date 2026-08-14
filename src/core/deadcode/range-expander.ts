/**
 * 範圍擴展器
 * 負責將符號範圍擴展至完整宣告（含前導註解）
 */

import type { Range } from '@shared/types/core.js';
import { SymbolType } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import { FileUtils } from '@core/foundations/index.js';
import { escapeRegex } from '@shared/regex-utils.js';
import { IDENTIFIER_CONTINUE_CLASS } from '@core/foundations/symbol-finder/identifier-matcher.js';

/**
 * 範圍擴展器
 */
export class RangeExpander {
  constructor(private readonly parserRegistry: ParserRegistry) {}

  /**
   * 擴展範圍至完整宣告（包含前導註解和空行）
   * 優先使用 Parser 的 getFullDeclarationRange 方法（AST 精確解析）
   * 若 Parser 不支援或回傳 null，fallback 到字串匹配邏輯
   *
   * @returns 可安全刪除的範圍；無法安全判定「整行刪除只會刪掉目標宣告」時回傳 null
   *   （呼叫端應跳過該項並警告，見 assertWholeLineRemovalIsSafe）
   */
  expandRangeToFullDeclaration(
    content: string,
    range: Range,
    symbolType: SymbolType,
    symbolName: string,
    filePath: string
  ): Range | null {
    // 1. 優先嘗試使用 Parser 的 getFullDeclarationRange 方法
    const parser = this.parserRegistry.getParser(FileUtils.getFileExtension(filePath));
    if (parser?.getFullDeclarationRange) {
      const parserRange = parser.getFullDeclarationRange(
        content,
        symbolName,
        symbolType,
        range.start.line
      );
      if (parserRange) {
        // 精確手術範圍（起點不在行首）不經行導向處理，無誤刪同行內容的風險
        if (parserRange.start.column > 1) {
          return parserRange;
        }
        if (!this.canSafelyRemoveWholeLines(content, range, symbolType, symbolName)) {
          return null;
        }
        return this.wrapParserRange(content, parserRange, range.start.line, symbolType, symbolName);
      }
    }

    // 2. Fallback：使用原有的字串匹配邏輯
    if (!this.canSafelyRemoveWholeLines(content, range, symbolType, symbolName)) {
      return null;
    }
    return this.expandRangeByStringMatching(content, range, symbolType, symbolName);
  }

  /**
   * 判斷「整行（含後續行）刪除」對此 variable/constant 是否安全
   *
   * 行導向的擴展（wrapParserRange 與 expandRangeByStringMatching）都假設目標宣告獨占
   * 整行，起點一律對齊行首、終點一律吃到行尾。這個假設在兩種形狀下不成立：
   * - 同一物理行塞了多條語句（`export const notDead = 1; const dead1 = 1;`）——整行刪除
   *   會把同行的存活宣告一起吃掉（N1，實測整檔被清空）
   * - 目標是解構綁定的成員（`const { dead, live } = obj;`）——Parser 無法給出精確成員
   *   範圍時 fallback 整行刪除，會毀掉仍在使用的 live 綁定與其消費行（F6-1）
   *
   * 兩者的共同可偵測特徵：找不到任何一行「以該符號自身的宣告開頭」。找不到時
   * 行導向擴展的前提已破，一律回報不安全，由呼叫端跳過該項（少刪 dead code 可接受，
   * 誤刪活碼不可接受）。
   *
   * 僅約束 variable/constant：其餘符號類型（function/class/interface…）維持既有行為。
   */
  private canSafelyRemoveWholeLines(
    content: string,
    range: Range,
    symbolType: SymbolType,
    symbolName: string
  ): boolean {
    if (symbolType !== SymbolType.Variable && symbolType !== SymbolType.Constant) {
      return true;
    }
    const lines = content.split('\n');
    return this.findDeclarationLine(lines, range.start.line - 1, symbolType, symbolName) !== null;
  }

  /**
   * 計算同一 VariableStatement 中多個已知 dead 的宣告子協調後的刪除範圍（D5：跨宣告子避免重疊）
   *
   * 逐宣告子各自呼叫 expandRangeToFullDeclaration 在同語句有多個 dead 宣告子時，各自算出的
   * 「首位吃尾逗號」「末位吃前逗號」範圍會互相重疊，--apply 後造成語法毀損。本方法一次把
   * 整組 dead 名稱交給 parser 統一協調（全部 dead 時整句刪除；部分 dead 時合併相鄰 dead
   * 宣告子為單一 run 各自做逗號手術），保證回傳的範圍彼此不重疊。
   *
   * @param content 原始程式碼
   * @param startLine anchorSymbolName 所在行號（1-based）
   * @param anchorSymbolName 群組中任一宣告子名稱，用來定位所屬語句
   * @param deadNames 同一語句中已知為 dead 的宣告子名稱集合（含 anchorSymbolName）
   * @param symbolType 符號類型（variable/constant）
   * @param filePath 檔案路徑，用來決定要使用哪個 Parser
   * @returns 每個 range 皆已完成前導/結尾包裝處理（等同 expandRangeToFullDeclaration 的效果）；
   *          Parser 不支援此能力或非多宣告子語句時回傳 null，呼叫端應 fallback 至對群組內
   *          每個項目各自呼叫 expandRangeToFullDeclaration
   */
  expandDeclaratorGroupRanges(
    content: string,
    startLine: number,
    anchorSymbolName: string,
    deadNames: ReadonlySet<string>,
    symbolType: SymbolType,
    filePath: string
  ): Range[] | null {
    const parser = this.parserRegistry.getParser(FileUtils.getFileExtension(filePath));
    if (!parser?.computeDeclaratorGroupRemovalRanges) {
      return null;
    }

    const parserRanges = parser.computeDeclaratorGroupRemovalRanges(content, anchorSymbolName, startLine, deadNames);
    if (!parserRanges) {
      return null;
    }

    return parserRanges.map(parserRange =>
      this.wrapParserRange(content, parserRange, startLine, symbolType, anchorSymbolName)
    );
  }

  /**
   * 包裝 parser 回傳的範圍：多宣告子語句的單一宣告子／run 手術範圍（起點不在行首）
   * 直接原樣回傳；整條語句的範圍（起點在行首）則補上前導註解與結尾空行處理
   *
   * 多宣告子語句（如 `let a, b;`）的精確手術範圍：起點不在行首，代表這是
   * 單一宣告子（或合併後的 run）的文字手術範圍（已含正確的逗號銜接），非整條語句/整行刪除。
   * 行導向的後續處理（前導註解、行首對齊、擴展至行尾）皆假設整行刪除，
   * 套用會誤吃掉本行其餘內容（如末位宣告子後的分號），故直接原樣回傳。
   */
  private wrapParserRange(
    content: string,
    parserRange: Range,
    originalStartLine: number,
    symbolType: SymbolType,
    symbolName: string
  ): Range {
    if (parserRange.start.column > 1) {
      return parserRange;
    }

    // Parser 成功解析，處理後續空行
    const lines = content.split('\n');
    const declarationStartLine = this.findDeclarationStartLine(lines, originalStartLine - 1, symbolType, symbolName);
    const startLine = this.findAttachedLeadingStartLine(lines, declarationStartLine);
    let endLine = parserRange.end.line - 1; // 轉為 0-based
    let includesTrailingBlankLine = false;
    if (endLine < lines.length - 1 && lines[endLine + 1]?.trim() === '') {
      endLine++;
      includesTrailingBlankLine = true;
    }
    return {
      start: startLine === parserRange.start.line - 1
        ? parserRange.start
        : this.createLineStartPosition(lines, startLine),
      end: this.createRangeEndPosition(lines, endLine, includesTrailingBlankLine)
    };
  }

  /**
   * 使用字串匹配邏輯擴展範圍（fallback 方法）
   * 使用清理後的內容進行括號匹配，避免字串/註解中的括號干擾
   */
  private expandRangeByStringMatching(
    content: string,
    range: Range,
    symbolType: SymbolType,
    symbolName: string
  ): Range {
    const lines = content.split('\n');

    // 防禦性檢查：確保行號在有效範圍內
    if (lines.length === 0 || range.start.line < 1 || range.end.line < 1) {
      return range; // 返回原始範圍，避免錯誤
    }

    let startLine = range.start.line - 1; // 轉為 0-based

    // 確保 startLine 在有效範圍內
    startLine = Math.max(0, Math.min(startLine, lines.length - 1));
    startLine = this.findDeclarationStartLine(lines, startLine, symbolType, symbolName);

    // 向上擴展：只包含緊貼宣告的 JSDoc、單行註解與裝飾器
    startLine = this.findAttachedLeadingStartLine(lines, startLine);

    // 向下擴展：確保包含完整的結尾
    let endLine = range.end.line - 1;

    // 確保 endLine 在有效範圍內
    endLine = Math.max(0, Math.min(endLine, lines.length - 1));

    // 對於 class/function，需要找到對應的結尾括號
    if (symbolType === 'class' || symbolType === 'function') {
      let braceCount = 0;
      let foundOpenBrace = false;

      for (let i = range.start.line - 1; i < lines.length; i++) {
        // 清理該行的註解和字串，避免括號誤判
        const cleanLine = this.removeCommentsAndStringsFromLine(lines[i]);
        for (const char of cleanLine) {
          if (char === '{') {
            braceCount++;
            foundOpenBrace = true;
          }
          if (char === '}') {
            braceCount--;
          }
        }

        if (foundOpenBrace && braceCount === 0) {
          endLine = i;
          break;
        }
      }
    }

    // 對於 variable（可能是 arrow function），只有當包含 { 時才做括號匹配
    if (symbolType === 'variable') {
      const startLineContent = lines[range.start.line - 1] || '';
      // 檢查是否包含 arrow function 的 block body
      if (startLineContent.includes('=>') && startLineContent.includes('{')) {
        let braceCount = 0;
        let foundOpenBrace = false;

        for (let i = range.start.line - 1; i < lines.length; i++) {
          const cleanLine = this.removeCommentsAndStringsFromLine(lines[i]);
          for (const char of cleanLine) {
            if (char === '{') {
              braceCount++;
              foundOpenBrace = true;
            }
            if (char === '}') {
              braceCount--;
            }
          }

          if (foundOpenBrace && braceCount === 0) {
            endLine = i;
            break;
          }
        }
      }
    }

    // 包含後續空行（最多一行）
    let includesTrailingBlankLine = false;
    if (endLine < lines.length - 1 && lines[endLine + 1]?.trim() === '') {
      endLine++;
      includesTrailingBlankLine = true;
    }

    // 確保最終 endLine 仍在有效範圍內
    endLine = Math.max(0, Math.min(endLine, lines.length - 1));

    return {
      start: { line: startLine + 1, column: 1 },
      end: this.createRangeEndPosition(lines, endLine, includesTrailingBlankLine)
    };
  }

  /**
   * 移除單行中的註解和字串（用於括號匹配）
   */
  private removeCommentsAndStringsFromLine(line: string): string {
    let result = line;

    // 移除單行註解 // ...
    const commentIndex = result.indexOf('//');
    if (commentIndex !== -1) {
      // 確保 // 不在字串中
      const beforeComment = result.substring(0, commentIndex);
      const quoteCount = (beforeComment.match(/['"]/g) || []).length;
      if (quoteCount % 2 === 0) {
        result = beforeComment;
      }
    }

    // 移除字串（簡化處理）
    result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    result = result.replace(/'(?:[^'\\]|\\.)*'/g, '\'\'');
    result = result.replace(/`(?:[^`\\]|\\.)*`/g, '""');

    return result;
  }

  private findAttachedLeadingStartLine(lines: string[], declarationStartLine: number): number {
    let startLine = declarationStartLine;
    let scanLine = declarationStartLine - 1;

    while (scanLine >= 0) {
      const line = lines[scanLine].trim();
      if (line === '') {
        break;
      }

      if (line.startsWith('@') || line.startsWith('//')) {
        startLine = scanLine;
        scanLine--;
        continue;
      }

      if (line.endsWith('*/')) {
        const blockStartLine = this.findBlockCommentStartLine(lines, scanLine);
        if (blockStartLine === -1) {
          break;
        }
        startLine = blockStartLine;
        scanLine = blockStartLine - 1;
        continue;
      }

      break;
    }

    return startLine;
  }

  private findDeclarationStartLine(
    lines: string[],
    approximateLine: number,
    symbolType: SymbolType,
    symbolName: string
  ): number {
    const safeApproximateLine = Math.max(0, Math.min(approximateLine, lines.length - 1));
    return this.findDeclarationLine(lines, approximateLine, symbolType, symbolName) ?? safeApproximateLine;
  }

  /**
   * 在 approximateLine 附近搜尋「該符號自身的宣告起始行」；找不到回傳 null
   * （findDeclarationStartLine 會退回近似行，canSafelyRemoveWholeLines 則據此判定不安全）
   */
  private findDeclarationLine(
    lines: string[],
    approximateLine: number,
    symbolType: SymbolType,
    symbolName: string
  ): number | null {
    const safeApproximateLine = Math.max(0, Math.min(approximateLine, lines.length - 1));
    const searchStart = Math.max(0, safeApproximateLine - 2);
    const searchEnd = Math.min(lines.length - 1, safeApproximateLine + 30);

    for (let i = searchStart; i <= searchEnd; i++) {
      if (this.isDeclarationLine(lines[i], symbolType, symbolName)) {
        return i;
      }
    }

    return null;
  }

  /**
   * 名稱結尾一律用識別符字元類的 negative lookahead 而非 `\b`：`\b` 只認 ASCII `\w`，
   * 對純 Unicode 識別符（如 `數量`）恆不成立（見 identifier-matcher 的 G6 註解）。
   * 邊界誤判會讓 canSafelyRemoveWholeLines 把正常的 Unicode 宣告誤判為不安全而跳過。
   */
  private isDeclarationLine(line: string, symbolType: SymbolType, symbolName: string): boolean {
    const escapedName = escapeRegex(symbolName);
    const nameEnd = `${escapedName}(?!${IDENTIFIER_CONTINUE_CLASS})`;
    const build = (pattern: string): RegExp => new RegExp(pattern, 'u');
    const trimmed = line.trim();

    switch (symbolType) {
      case SymbolType.Function:
        return build(`^(?:export\\s+)?(?:async\\s+)?function\\s+${nameEnd}`).test(trimmed)
          || build(`^(?:export\\s+)?(?:const|let|var)\\s+${nameEnd}.*=>`).test(trimmed);
      case SymbolType.Class:
        return build(`^(?:export\\s+)?(?:abstract\\s+)?class\\s+${nameEnd}`).test(trimmed);
      case SymbolType.Interface:
        return build(`^(?:export\\s+)?interface\\s+${nameEnd}`).test(trimmed);
      case SymbolType.Type:
        return build(`^(?:export\\s+)?type\\s+${nameEnd}`).test(trimmed);
      case SymbolType.Enum:
        return build(`^(?:export\\s+)?enum\\s+${nameEnd}`).test(trimmed);
      case SymbolType.Variable:
      case SymbolType.Constant:
        return build(`^(?:export\\s+)?(?:const|let|var)\\s+${nameEnd}`).test(trimmed);
      default:
        return build(`(?<!${IDENTIFIER_CONTINUE_CLASS})${nameEnd}`).test(trimmed);
    }
  }

  private findBlockCommentStartLine(lines: string[], endLine: number): number {
    for (let i = endLine; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('/**') || line.startsWith('/*')) {
        return i;
      }
      if (line === '') {
        return -1;
      }
    }
    return -1;
  }

  private createLineStartPosition(lines: string[], line: number): Range['start'] {
    let offset = 0;
    for (let i = 0; i < line; i++) {
      offset += lines[i].length + 1;
    }
    return { line: line + 1, column: 1, offset };
  }

  private createRangeEndPosition(lines: string[], endLine: number, includesTrailingBlankLine: boolean): Range['end'] {
    if (includesTrailingBlankLine && endLine < lines.length - 1) {
      return this.createLineStartPosition(lines, endLine + 1);
    }
    return {
      line: endLine + 1,
      column: (lines[endLine]?.length ?? 0) + 1,
      offset: this.calculateLineOffset(lines, endLine) + (lines[endLine]?.length ?? 0)
    };
  }

  private calculateLineOffset(lines: string[], line: number): number {
    let offset = 0;
    for (let i = 0; i < line; i++) {
      offset += lines[i].length + 1;
    }
    return offset;
  }
}

/**
 * 建立 RangeExpander 實例
 */
export function createRangeExpander(parserRegistry: ParserRegistry): RangeExpander {
  return new RangeExpander(parserRegistry);
}
