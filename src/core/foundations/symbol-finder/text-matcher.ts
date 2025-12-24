/**
 * 文字匹配工具類別
 * 負責基於文字的符號引用查找（降級方法）
 */

import { SymbolReferenceType, type SymbolReference } from './types.js';

/**
 * 文字匹配器
 * 提供基於正則表達式的符號查找能力
 */
export class TextMatcher {
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
              start: { line: lineIndex + 1, column: startColumn },
              end: { line: lineIndex + 1, column: startColumn + symbolName.length }
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
              start: { line: lineIndex + 1, column: startColumn },
              end: { line: lineIndex + 1, column: startColumn + symbolName.length }
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
                start: { line: lineIndex + 1, column: match.index + 1 },
                end: { line: lineIndex + 1, column: match.index + 1 + symbolName.length }
              }
            },
            type: SymbolReferenceType.Usage,
            context: line.trim()
          });
        }
      }
    }
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
   * 跳脫正則表達式特殊字元
   */
  escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * 建立 TextMatcher 實例
 */
export function createTextMatcher(): TextMatcher {
  return new TextMatcher();
}
