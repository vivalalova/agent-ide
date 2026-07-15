/**
 * 文字匹配工具類別
 * 負責基於文字的符號引用查找（降級方法）
 */

import { SymbolReferenceType, type SymbolReference } from './types.js';
import { createIdentifierBoundaryRegex } from './identifier-matcher.js';

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
    const regex = createIdentifierBoundaryRegex(symbolName, 'g');

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
    const regex = createIdentifierBoundaryRegex(symbolName, 'g');
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
      const regex = createIdentifierBoundaryRegex(symbolName, 'g');
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
   *
   * 單趟字元掃描同時追蹤字串狀態並尋找 `//`／`#`：舊版分別用
   * `beforePosition.includes('//')` 與 `isInString(line, hashIndex)` 各查一次，
   * `//` 分支完全沒排除字串內的情況，導致同行前面出現 URL 字串（如
   * `"http://example.com"`）時，字串內的 `//` 被誤判成註解起點，把後面
   * 真正的程式碼（如 `foo()`）當成註解內容濾掉（adversarial R2 regression）。
   */
  isInSingleLineComment(line: string, position: number): boolean {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplate = false;

    for (let i = 0; i < position; i++) {
      const char = line[i];
      const prevChar = i > 0 ? line[i - 1] : '';

      if (prevChar === '\\') {
        continue;
      }

      if (char === '\'' && !inDoubleQuote && !inTemplate) {
        inSingleQuote = !inSingleQuote;
        continue;
      }
      if (char === '"' && !inSingleQuote && !inTemplate) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }
      if (char === '`' && !inSingleQuote && !inDoubleQuote) {
        inTemplate = !inTemplate;
        continue;
      }

      if (inSingleQuote || inDoubleQuote || inTemplate) {
        continue;
      }

      // TypeScript/JavaScript 單行註解
      if (char === '/' && line[i + 1] === '/') {
        return true;
      }
      // Python/Shell 單行註解
      if (char === '#') {
        return true;
      }
    }

    return false;
  }

  /**
   * 跳脫正則表達式特殊字元（供 CallSiteParser 組合呼叫點樣式使用）
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
