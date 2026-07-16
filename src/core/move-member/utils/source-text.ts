/**
 * 判斷 source offset 是否位於字串或註解中（含樣板文字、regex 字面值）。
 * move-member 的文字掃描器共用此 predicate，避免把字串/註解中的 import 文字
 * 當成真正的語句。
 *
 * SSOT：委派 foundations/code-state-mask，正確處理 regex 字面值
 * （見 F11：`/'/` 後的真 import 不被誤判為字串內）。
 */

import { computeCodeStateMask } from '@core/foundations/code-state-mask.js';

export function isInsideStringOrComment(code: string, offset: number): boolean {
  if (offset < 0 || offset >= code.length) {
    return false;
  }
  const mask = computeCodeStateMask(code);
  return !mask[offset];
}
