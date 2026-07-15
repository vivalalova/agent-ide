/**
 * R4 (缺陷 E): findTypeAliasEnd 遇到型別別名中段「純註解行」會提早截斷。
 *
 * 輸入三行：
 *   type User =
 *   // identity
 *   string;
 *
 * 現行為：第二行整行是註解，codeMask 全遮蔽，lastCodeTokenOnLine 在該行找不到任何
 * code token（回傳 undefined），使 endsUnfinished 判為 false；下一行 `string;` 又不是
 * CONTINUATION_LEADING_TOKENS 開頭、也非註解，nextIsContinuation 同樣為 false。兩者
 * 皆 false 使得 `!endsUnfinished && !nextIsContinuation` 成立，在註解行（index 1）
 * 就直接 return，漏掉本體 `string;`（index 2）。
 *
 * 正確契約（期望行為）：第一行 `type User =` 結尾是未完成 token `=`，本應視為續行；
 * 中間純註解行不應被當成別名的終止點；`findTypeAliasEnd(lines, 0)` 應回傳 2
 * （`string;` 所在行），而非 1。
 */
import { describe, expect, it } from 'vitest';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';

describe('findTypeAliasEnd - 型別別名中段純註解行（adversarial R4 / 缺陷 E）', () => {
  it('不應在型別別名中段的純註解行提早截斷', () => {
    const lines = [
      'type User =',
      '// identity',
      'string;'
    ];

    const result = findTypeAliasEnd(lines, 0);

    // 現行為：在註解行（index 1）就 return，漏掉本體 string;（index 2）
    expect(result).toBe(2);
  });
});
