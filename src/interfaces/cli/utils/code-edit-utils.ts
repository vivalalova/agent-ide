/**
 * 代碼編輯工具模組
 * 提供代碼編輯相關功能
 */

/**
 * 將行列位置轉換為字元偏移量
 */
export function positionToOffset(lines: string[], position: { line: number; column: number }): number {
  let offset = 0;

  for (let i = 0; i < position.line - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }

  offset += position.column;
  return Math.min(offset, lines.join('\n').length);
}

/**
 * 應用代碼編輯
 */
export function applyEditCorrectly(
  code: string,
  edit: {
    type: 'replace' | 'insert' | 'delete';
    range: { start: { line: number; column: number }; end: { line: number; column: number } };
    newText: string;
  }
): string {
  const lines = code.split('\n');

  switch (edit.type) {
  case 'replace': {
    // 計算起始和結束位置的偏移量
    const startOffset = positionToOffset(lines, edit.range.start);
    const endOffset = positionToOffset(lines, edit.range.end);

    return code.substring(0, startOffset) + edit.newText + code.substring(endOffset);
  }

  case 'insert': {
    const offset = positionToOffset(lines, edit.range.start);
    return code.substring(0, offset) + edit.newText + code.substring(offset);
  }

  case 'delete': {
    const startOffset = positionToOffset(lines, edit.range.start);
    const endOffset = positionToOffset(lines, edit.range.end);
    return code.substring(0, startOffset) + code.substring(endOffset);
  }

  default:
    return code;
  }
}

/**
 * @deprecated 使用 applyEditCorrectly 代替
 */
export function applyCodeEdit(
  code: string,
  edit: {
    range: { start: { line: number; column: number }; end: { line: number; column: number } };
    newText: string;
  }
): string {
  const lines = code.split('\n');
  const startLine = edit.range.start.line - 1; // 轉為 0-based
  const endLine = edit.range.end.line - 1;

  // 取得編輯範圍前後的內容
  const before = lines.slice(0, startLine);
  const after = lines.slice(endLine + 1);

  // 組合新的內容
  return [...before, edit.newText, ...after].join('\n');
}
