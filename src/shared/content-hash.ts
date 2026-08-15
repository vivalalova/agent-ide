/**
 * 內容雜湊共用工具
 * 全域共用（非 TS/JS Parser 專屬）：任何需要「內容是否變更」判斷的模組皆可引用，
 * 避免各處各自 inline createHash 造成同一 pattern 重複
 */

import { createHash } from 'node:crypto';

/**
 * 計算內容的雜湊值（SHA256，全內容）
 * 用於 AST/符號索引快取驗證與快取 key；全內容雜湊避免「同長度+同前綴」
 * 的弱雜湊（如僅取長度+前 N 字元）造成不同內容碰撞、靜默拿到錯誤快取結果
 *
 * @param content 原始內容
 * @returns SHA256 十六進位雜湊字串
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
