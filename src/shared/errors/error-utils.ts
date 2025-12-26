/**
 * 錯誤處理工具函式
 */

/**
 * 從未知錯誤中提取錯誤訊息
 *
 * @param error - 任意類型的錯誤
 * @returns 錯誤訊息字串
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
