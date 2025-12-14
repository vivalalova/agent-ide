/**
 * 測試 import 清理的檔案
 */

import { usedFunction } from './used.js';

/**
 * 未使用的輔助函式 - 應該被刪除
 */
function helperFunction(): void {
  // 這個函式使用了 usedFunction，但 helperFunction 本身未被使用
  console.log(usedFunction(10));
}

/**
 * 有使用的導出函式
 */
export function activeFunction(): number {
  return usedFunction(5);
}
