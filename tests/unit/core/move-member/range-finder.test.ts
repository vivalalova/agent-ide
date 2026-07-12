/**
 * range-finder Unit 測試（回歸缺陷 R2-7）
 *
 * R2-7：findStatementEnd 逐字元掃描括號深度時未套用 computeCodeStateMask，
 *       字串內容中恰巧出現的 `(`/`)` 會誤導括號深度判定，導致陳述句結尾誤判。
 */

import { describe, it, expect } from 'vitest';
import { findStatementEnd } from '@core/move-member/utils/range-finder.js';

describe('findStatementEnd - 回歸缺陷 R2-7', () => {
  it('字串內容中不成對的括號不應誤導陳述句結尾判定', () => {
    // fn(...) 呼叫跨多行，第二行字串內容含有一個孤立的 `)`（非真實程式碼括號）。
    // 正確行為：陳述句應在真正的 `);` 那一行（index 3）結束。
    const lines = [
      'const sR27 = fn(',
      '  "text)",',
      '  2',
      ');'
    ];

    const result = findStatementEnd(lines, 0);

    // 目前的壞行為：逐字元掃描不分辨字串內容，字串內的 `)` 被當成真實括號使
    // parenDepth 提前歸零、又在真正的 `);` 處被算成負值，導致從未在
    // parenDepth === 0 時偵測到 `;`，最終 fallback 回傳 startLine（0）
    expect(result).toBe(3);
  });
});
