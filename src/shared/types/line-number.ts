/**
 * 行號工具函數
 * 確保所有模組使用一致的行號表示（專案標準：1-based）
 */

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
