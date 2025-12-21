/**
 * 文字匹配器
 * 處理註解、字串檢測與文字匹配
 */

import { SymbolReferenceType, type SymbolReference } from './types.js';

/**
 * 文字匹配器
 * 提供字串/註解檢測和文字匹配功能
 */
export class TextMatcher {
  /**
   * 跳脫正則表達式特殊字元
   */
  escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 檢查位置是否在字串字面值中
   */
  isInString(line: string, position: number): boolean {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplate = false;

    for (let i = 0; i < position; i++) {
      const char = line[i];
      const prevChar = i > 0 ? line[i - 1] : '';

      // 跳過轉義字元
      if (prevChar === '\\') {
        continue;
      }

      if (char === '\'' && !inDoubleQuote && !inTemplate) {
        inSingleQuote = !inSingleQuote;
      } else if (char === '"' && !inSingleQuote && !inTemplate) {
        inDoubleQuote = !inDoubleQuote;
      } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
        inTemplate = !inTemplate;
      }
    }

    return inSingleQuote || inDoubleQuote || inTemplate;
  }

  /**
   * 檢查位置是否在單行註解中
   */
  isInSingleLineComment(line: string, position: number): boolean {
    const beforePosition = line.substring(0, position);

    // TypeScript/JavaScript 單行註解
    if (beforePosition.includes('//')) {
      return true;
    }

    // Python/Shell 單行註解
    if (beforePosition.includes('#')) {
      // 排除 # 在字串中的情況
      const hashIndex = beforePosition.indexOf('#');
      if (!this.isInString(line, hashIndex)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 檢查位置是否在註解中（支援單行和跨行多行註解）
   * 此方法會自動計算跨行 block comment 狀態
   */
  isInComment(
    line: string,
    position: number,
    lines: readonly string[],
    lineIndex: number
  ): boolean {
    // 計算前面行的 block comment 狀態
    const inBlockCommentFromPreviousLines = this.computeBlockCommentStateBeforeLine(lines, lineIndex);
    return this.isInCommentWithState(line, position, inBlockCommentFromPreviousLines);
  }

  /**
   * 檢查位置是否在註解中（優化版：接受預計算的 block comment 狀態）
   * 避免重複遍歷前面的行
   */
  isInCommentWithState(
    line: string,
    position: number,
    lineStartsInBlockComment: boolean
  ): boolean {
    // 檢查單行註解（//）
    const singleLineCommentIndex = line.indexOf('//');
    if (singleLineCommentIndex >= 0 && singleLineCommentIndex < position) {
      // 確保 // 不在字串中且不在 block comment 中
      if (!this.isInString(line, singleLineCommentIndex)) {
        // 還需確認 // 不在 block comment 中
        if (!this.isPositionInBlockComment(line, singleLineCommentIndex, lineStartsInBlockComment)) {
          return true;
        }
      }
    }

    // 檢查 block comment 狀態
    return this.isPositionInBlockComment(line, position, lineStartsInBlockComment);
  }

  /**
   * 檢查位置是否在 block comment 中
   * 正確處理同一行中多個區塊註解開始與結束符號的情況
   */
  isPositionInBlockComment(
    line: string,
    position: number,
    lineStartsInBlockComment: boolean
  ): boolean {
    let inBlockComment = lineStartsInBlockComment;
    let searchStart = 0;

    while (searchStart < position) {
      if (inBlockComment) {
        // 在 block comment 中，找下一個 */
        const closeIndex = line.indexOf('*/', searchStart);
        if (closeIndex < 0 || closeIndex >= position) {
          // 位置在未關閉的多行註解中
          return true;
        }
        inBlockComment = false;
        searchStart = closeIndex + 2;
      } else {
        // 不在 block comment 中，找下一個 /*
        const openIndex = line.indexOf('/*', searchStart);
        if (openIndex < 0 || openIndex >= position) {
          break;
        }

        // 確保 /* 不在字串中
        if (this.isInString(line, openIndex)) {
          searchStart = openIndex + 2;
          continue;
        }

        inBlockComment = true;
        searchStart = openIndex + 2;
      }
    }

    return inBlockComment;
  }

  /**
   * 計算處理完一行後的 block comment 狀態
   * 正確處理同一行中多個區塊註解開始與結束符號的情況
   */
  computeBlockCommentStateAfterLine(line: string, initialState: boolean): boolean {
    let inBlockComment = initialState;
    let i = 0;

    while (i < line.length) {
      if (inBlockComment) {
        // 在 block comment 中，找 */
        const closeIndex = line.indexOf('*/', i);
        if (closeIndex < 0) {
          // 沒有找到 */，整行剩餘部分都在註解中
          return true;
        }
        inBlockComment = false;
        i = closeIndex + 2;
      } else {
        // 不在 block comment 中，找 /*
        const openIndex = line.indexOf('/*', i);
        if (openIndex < 0) {
          // 沒有找到 /*
          return false;
        }

        // 確保 /* 不在字串中
        if (this.isInString(line, openIndex)) {
          i = openIndex + 2;
          continue;
        }

        inBlockComment = true;
        i = openIndex + 2;
      }
    }

    return inBlockComment;
  }

  /**
   * 計算某行開始前的 block comment 狀態
   * 遍歷前面所有行來確定
   */
  computeBlockCommentStateBeforeLine(lines: readonly string[], lineIndex: number): boolean {
    let inBlockComment = false;

    for (let i = 0; i < lineIndex; i++) {
      inBlockComment = this.computeBlockCommentStateAfterLine(lines[i], inBlockComment);
    }

    return inBlockComment;
  }

  /**
   * 使用文字匹配查找引用（降級方法）
   */
  findReferencesByText(filePath: string, content: string, symbolName: string): SymbolReference[] {
    const references: SymbolReference[] = [];
    const lines = content.split('\n');
    const regex = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`, 'g');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      let match;

      while ((match = regex.exec(line)) !== null) {
        const startColumn = match.index + 1;

        references.push({
          symbolName,
          location: {
            filePath,
            range: {
              start: { line: lineIndex + 1, column: startColumn, offset: undefined },
              end: { line: lineIndex + 1, column: startColumn + symbolName.length, offset: undefined }
            }
          },
          type: SymbolReferenceType.Usage,
          // 保留原始行內容（不 trim），讓 diff 輸出保持正確的縮排
          context: line
        });
      }
    }

    return references;
  }

  /**
   * 使用文字匹配查找引用（過濾字串和註解版本）
   *
   * 此方法會過濾掉：
   * 1. 字串字面值中的符號（單引號、雙引號、模板字串）
   * 2. 單行註解中的符號（// 和 #）
   * 3. 多行註解中的符號
   */
  findReferencesByTextFiltered(filePath: string, content: string, symbolName: string): SymbolReference[] {
    const references: SymbolReference[] = [];
    const lines = content.split('\n');
    const regex = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`, 'g');
    let inBlockComment = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      let match;

      // 追蹤多行註解狀態
      if (inBlockComment) {
        const closeCommentIndex = line.indexOf('*/');
        if (closeCommentIndex >= 0) {
          inBlockComment = false;
        } else {
          continue; // 整行在多行註解中，跳過
        }
      }

      while ((match = regex.exec(line)) !== null) {
        const position = match.index;

        // 檢查是否在字串中
        if (this.isInString(line, position)) {
          continue;
        }

        // 檢查是否在單行註解中
        if (this.isInSingleLineComment(line, position)) {
          continue;
        }

        // 檢查是否在多行註解開始後
        const openCommentIndex = line.lastIndexOf('/*', position);
        if (openCommentIndex >= 0) {
          const closeCommentIndex = line.indexOf('*/', openCommentIndex);
          if (closeCommentIndex < 0 || closeCommentIndex > position) {
            // 在未關閉的多行註解中
            if (closeCommentIndex < 0) {
              inBlockComment = true;
            }
            continue;
          }
        }

        const startColumn = position + 1;

        references.push({
          symbolName,
          location: {
            filePath,
            range: {
              start: { line: lineIndex + 1, column: startColumn, offset: undefined },
              end: { line: lineIndex + 1, column: startColumn + symbolName.length, offset: undefined }
            }
          },
          type: SymbolReferenceType.Usage,
          // 保留原始行內容（不 trim），讓 diff 輸出保持正確的縮排
          context: line
        });
      }
    }

    return references;
  }

  /**
   * 批次文字匹配查找（降級方法）
   */
  findReferencesMultipleByText(
    filePath: string,
    content: string,
    symbolNames: ReadonlySet<string>,
    results: Map<string, SymbolReference[]>
  ): void {
    const lines = content.split('\n');

    for (const symbolName of symbolNames) {
      const regex = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`, 'g');
      const refs = results.get(symbolName);
      if (!refs) {
        continue;
      }

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        let match;

        while ((match = regex.exec(line)) !== null) {
          refs.push({
            symbolName,
            location: {
              filePath,
              range: {
                start: { line: lineIndex + 1, column: match.index + 1, offset: undefined },
                end: { line: lineIndex + 1, column: match.index + 1 + symbolName.length, offset: undefined }
              }
            },
            type: SymbolReferenceType.Usage,
            context: line.trim()
          });
        }
      }
    }
  }
}
