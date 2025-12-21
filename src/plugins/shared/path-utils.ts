/**
 * 路徑工具函數
 *
 * 提供路徑相關的通用工具函數。
 */

/**
 * 檢查路徑是否為相對路徑
 *
 * 相對路徑以 './' 或 '../' 開頭。
 *
 * @param path - 要檢查的路徑
 * @returns 是否為相對路徑
 *
 * @example
 * isRelativePath('./utils')     // true
 * isRelativePath('../shared')   // true
 * isRelativePath('lodash')      // false
 * isRelativePath('@core/utils') // false
 */
export function isRelativePath(path: string): boolean {
  return path.startsWith('./') || path.startsWith('../');
}
