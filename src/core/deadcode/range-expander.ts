/**
 * 範圍擴展器
 * 負責將符號範圍擴展至完整宣告（含前導註解）
 */

import type { Range } from '@shared/types/core.js';
import { SymbolType } from '@shared/types/symbol.js';
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
        const declarationStartLine = this.findDeclarationStartLine(lines, range.start.line - 1, symbolType, symbolName);
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
    }

    // 2. Fallback：使用原有的字串匹配邏輯
    return this.expandRangeByStringMatching(content, range, symbolType, symbolName);
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
    const searchStart = Math.max(0, safeApproximateLine - 2);
    const searchEnd = Math.min(lines.length - 1, safeApproximateLine + 30);

    for (let i = searchStart; i <= searchEnd; i++) {
      if (this.isDeclarationLine(lines[i], symbolType, symbolName)) {
        return i;
      }
    }

    return safeApproximateLine;
  }

  private isDeclarationLine(line: string, symbolType: SymbolType, symbolName: string): boolean {
    const escapedName = this.escapeRegExp(symbolName);
    const trimmed = line.trim();

    switch (symbolType) {
      case SymbolType.Function:
        return new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${escapedName}\\b`).test(trimmed)
          || new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+${escapedName}\\b.*=>`).test(trimmed);
      case SymbolType.Class:
        return new RegExp(`^(?:export\\s+)?(?:abstract\\s+)?class\\s+${escapedName}\\b`).test(trimmed);
      case SymbolType.Interface:
        return new RegExp(`^(?:export\\s+)?interface\\s+${escapedName}\\b`).test(trimmed);
      case SymbolType.Type:
        return new RegExp(`^(?:export\\s+)?type\\s+${escapedName}\\b`).test(trimmed);
      case SymbolType.Enum:
        return new RegExp(`^(?:export\\s+)?enum\\s+${escapedName}\\b`).test(trimmed);
      case SymbolType.Variable:
      case SymbolType.Constant:
        return new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+${escapedName}\\b`).test(trimmed);
      default:
        return new RegExp(`\\b${escapedName}\\b`).test(trimmed);
    }
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
