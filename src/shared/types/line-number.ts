/**
 * 行號工具函數
 * 確保所有模組使用一致的行號表示（專案標準：1-based）
 */

/**
 * 判斷兩個位置是否在同一行
 * 處理可能的 0/1-indexed 差異
 *
 * @param line1 第一個行號
 * @param line2 第二個行號
 * @param tolerance 允許的行號差異（預設 1，處理不同來源的行號差異）
 */
export function isSameLine(
  line1: number,
  line2: number,
  tolerance: 0 | 1 = 1
): boolean {
  return Math.abs(line1 - line2) <= tolerance;
}

/**
 * 將 0-based 行號轉換為 1-based
 */
export function toOneBased(zeroBasedLine: number): number {
  return zeroBasedLine + 1;
}

/**
 * 將 1-based 行號轉換為 0-based
 */
export function toZeroBased(oneBasedLine: number): number {
  return oneBasedLine - 1;
}
