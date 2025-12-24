/**
 * 範圍擴展器
 * 負責將符號範圍擴展至完整宣告（含前導註解）
 */

import type { Range } from '@shared/types/core.js';
import type { SymbolType } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import { FileUtils } from '@core/foundations/index.js';

/**
 * 範圍擴展器
 */
export class RangeExpander {
  constructor(private readonly parserRegistry: ParserRegistry) {}

  /**
   * 擴展範圍至完整宣告（包含前導註解和空行）
   * 優先使用 Parser 的 getFullDeclarationRange 方法（AST 精確解析）
   * 若 Parser 不支援或回傳 null，fallback 到字串匹配邏輯
   */
  expandRangeToFullDeclaration(
    content: string,
    range: Range,
    symbolType: SymbolType,
    symbolName: string,
    filePath: string
  ): Range {
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
        // Parser 成功解析，處理後續空行
        const lines = content.split('\n');
        let endLine = parserRange.end.line - 1; // 轉為 0-based
        if (endLine < lines.length - 1 && lines[endLine + 1]?.trim() === '') {
          endLine++;
        }
        return {
          start: parserRange.start,
          end: {
            line: endLine + 1,
            column: (lines[endLine]?.length ?? 0) + 1,
            offset: parserRange.end.offset
          }
        };
      }
    }

    // 2. Fallback：使用原有的字串匹配邏輯
    return this.expandRangeByStringMatching(content, range, symbolType);
  }

  /**
   * 使用字串匹配邏輯擴展範圍（fallback 方法）
   * 使用清理後的內容進行括號匹配，避免字串/註解中的括號干擾
   */
  private expandRangeByStringMatching(
    content: string,
    range: Range,
    symbolType: SymbolType
  ): Range {
    const lines = content.split('\n');

    // 防禦性檢查：確保行號在有效範圍內
    if (lines.length === 0 || range.start.line < 1 || range.end.line < 1) {
      return range; // 返回原始範圍，避免錯誤
    }

    let startLine = range.start.line - 1; // 轉為 0-based

    // 確保 startLine 在有效範圍內
    startLine = Math.max(0, Math.min(startLine, lines.length - 1));

    // 向上擴展：包含 JSDoc 註解和裝飾器
    while (startLine > 0) {
      const prevLine = lines[startLine - 1].trim();

      // Bug #32 修復：如果遇到 JSDoc 結尾 */，繼續向上找到開始 /**
      if (prevLine.endsWith('*/')) {
        startLine--;
        // 繼續向上找到 JSDoc 開始 /**（使用 >= 0 確保第 0 行也能檢查）
        while (startLine > 0) {
          const jsdocLine = lines[startLine - 1].trim();
          if (jsdocLine.startsWith('/**')) {
            startLine--;
            break;
          }
          startLine--;
        }
        // 額外檢查第 0 行是否為 JSDoc 開始
        if (startLine === 0 && lines[0].trim().startsWith('/**')) {
          // 已經到達第 0 行，不需要再減
        }
        continue;
      }

      // 處理單行註解、裝飾器、空行、JSDoc 中間行
      if (
        prevLine.startsWith('*') ||
        prevLine.startsWith('//') ||
        prevLine.startsWith('@') ||
        prevLine === ''
      ) {
        startLine--;
      } else {
        break;
      }
    }

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
    if (endLine < lines.length - 1 && lines[endLine + 1]?.trim() === '') {
      endLine++;
    }

    // 確保最終 endLine 仍在有效範圍內
    endLine = Math.max(0, Math.min(endLine, lines.length - 1));

    return {
      start: { line: startLine + 1, column: 1 },
      end: { line: endLine + 1, column: (lines[endLine]?.length ?? 0) + 1 }
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
}

/**
 * 建立 RangeExpander 實例
 */
export function createRangeExpander(parserRegistry: ParserRegistry): RangeExpander {
  return new RangeExpander(parserRegistry);
}
