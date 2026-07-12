/**
 * Atomic write 共用輔助函數
 * 產生唯一的暫存檔路徑，避免併發寫入同一目標檔案時共用同一個 tmp 檔（torn write / rename ENOENT）
 */

import { randomBytes } from 'node:crypto';

/**
 * 建立唯一的暫存檔路徑
 * 帶 pid + 隨機字串，確保同一目標檔案的並發寫入不會共用同一個 tmp 檔
 *
 * @param targetPath 最終目標檔案路徑
 * @param suffix 暫存檔後綴（預設 '.tmp'）
 * @returns 唯一的暫存檔路徑，格式：`${targetPath}.${pid}.${random}${suffix}`
 */
export function createUniqueTempPath(targetPath: string, suffix: string = '.tmp'): string {
  return `${targetPath}.${process.pid}.${randomBytes(6).toString('hex')}${suffix}`;
}
