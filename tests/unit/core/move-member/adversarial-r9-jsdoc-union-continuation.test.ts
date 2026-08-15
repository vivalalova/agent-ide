/**
 * R9 (缺陷): findTypeAliasEnd 對「同一行內 JSDoc 註解 + union 續行」誤判為別名終點。
 *
 * range-finder.ts 的 CONTINUATION_LEADING_TOKENS（127）只檢查下一行是否以
 * `|`/`&`/`?`/`:`/`>`/`)`/`}`/`]` 開頭；`isCommentOnlyLine`（129-141）則要求整行皆
 * 為註解才算「純註解行」。當續行寫成「行首是 JSDoc 行內註解、同行接著真正程式碼」
 * 的形狀（例如 note 註解後緊接 `| number;`）時：
 *   - 該行不是純註解行（含實際的 `| number;` 程式碼），isCommentOnlyLine 判 false，
 *     故不會被上方「純註解行序列」邏輯（continuationAfterComments）處理；
 *   - 該行字面上以 `/` 開頭，不在 CONTINUATION_LEADING_TOKENS 清單內，
 *     nextLine.startsWith(token) 逐一比對全部落空；
 * 兩條路徑都沒接住，導致 `nextIsContinuation` 判為 false，在第 0 行
 * （`type User = string`）就提早 return，把後面同行帶著程式碼的 union 續行整個漏掉。
 *
 * 正確契約（期望行為）：`findTypeAliasEnd(lines, 0)` 應回傳型別別名真正結尾行
 * （index 1，該行含 union 續行 `| number;`），而非在 index 0 提早截斷。
 */
import { describe, expect, it } from 'vitest';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';

describe('findTypeAliasEnd - 同行 JSDoc 註解 + union 續行截斷（adversarial R9）', () => {
  it('不應在型別別名續行同時帶有行首 JSDoc 註解與真正 union 程式碼時提早截斷', () => {
    const lines = [
      'type User = string',
      '/** note */ | number;'
    ];

    const result = findTypeAliasEnd(lines, 0);

    // 現行為：在 index 0（`type User = string`）就提早 return，漏掉 index 1 的
    // `/** note */ | number;`（真正的別名終點）。
    expect(result).toBe(1);
  });
});
