/**
 * Range Finder
 * 程式碼區塊範圍查找工具
 */

/**
 * 找到程式碼區塊結尾（大括號配對）
 *
 * @param lines 程式碼行陣列
 * @param startLine 起始行索引（0-based）
 * @returns 區塊結束行索引
 */
export function findBlockEnd(lines: string[], startLine: number): number {
  let depth = 0;
  let foundStart = false;

  for (let i = startLine; i < lines.length; i++) {
    for (const char of lines[i]) {
      if (char === '{') {
        depth++;
        foundStart = true;
      } else if (char === '}') {
        depth--;
        if (foundStart && depth === 0) {
          return i;
        }
      }
    }
  }

  return startLine;
}

/**
 * 在類別內找到程式碼區塊結尾
 * 與 findBlockEnd 邏輯相同，語義上用於類別內部成員
 *
 * @param lines 類別內部程式碼行陣列
 * @param startLine 起始行索引（0-based）
 * @returns 區塊結束行索引
 */
export function findBlockEndInClass(lines: string[], startLine: number): number {
  return findBlockEnd(lines, startLine);
}

/**
 * 找到類型別名結尾
 * 支援多行 union/intersection 型別
 *
 * @param lines 程式碼行陣列
 * @param startLine 起始行索引（0-based）
 * @returns 型別別名結束行索引
 */
export function findTypeAliasEnd(lines: string[], startLine: number): number {
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(';')) {
      return i;
    }
    // 非起始行且不是 union/intersection 續行
    if (i > startLine && !line.trim().startsWith('|') && !line.trim().startsWith('&')) {
      return i;
    }
  }
  return startLine;
}

/**
 * 找到陳述句結尾
 * 處理多行箭頭函式：追蹤括號深度，避免將參數預設值的 `=` 誤判為語句結束
 *
 * @param lines 程式碼行陣列
 * @param startLine 起始行索引（0-based）
 * @returns 陳述句結束行索引
 */
export function findStatementEnd(lines: string[], startLine: number): number {
  let parenDepth = 0;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];

    // 追蹤括號深度
    for (const char of line) {
      if (char === '(') {
        parenDepth++;
      } else if (char === ')') {
        parenDepth--;
      }
    }

    // 只有括號外的 `;` 或 `=` 才是語句結束
    if (parenDepth === 0) {
      if (line.includes(';')) {
        return i;
      }
      // 非箭頭函式的賦值（且不是起始行）
      if (line.includes('=') && !line.includes('=>') && i > startLine) {
        return i;
      }
    }

    // 檢查是否是多行箭頭函式或物件（括號必須已閉合）
    if (parenDepth === 0 && line.includes('{')) {
      return findBlockEnd(lines, i);
    }
  }

  return startLine;
}
