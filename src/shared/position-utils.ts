/**
 * Offset ↔ Position 換算工具
 */

/**
 * 將字元 offset（0-based）換算為 1-based 行號與 1-based 欄號。
 * 全域唯一來源：需要 offset→line/column 換算的呼叫端皆應引用此函式，
 * 禁另行複製一份同款逐字元/split('\n') 換算邏輯。
 *
 * @param content 完整文字內容
 * @param offset 0-based 字元偏移
 * @returns 1-based 行號與 1-based 欄號
 */
export function offsetToPosition(content: string, offset: number): { line: number; column: number } {
  const beforeOffset = content.slice(0, offset);
  const line = beforeOffset.split('\n').length;
  const lastNewline = beforeOffset.lastIndexOf('\n');
  const column = lastNewline < 0 ? offset + 1 : offset - lastNewline;

  return { line, column };
}
