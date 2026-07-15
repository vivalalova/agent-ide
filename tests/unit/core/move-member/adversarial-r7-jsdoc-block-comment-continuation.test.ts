/**
 * R7 (缺陷): findTypeAliasEnd 對型別別名中段的 JSDoc 區塊註解「續行」誤判為
 * 非註解行，導致 continuation 掃描提早中斷、型別別名範圍被截斷。
 *
 * range-finder.ts 的 isCommentOnlyLine（129-139）只認行首為 `//` 或 `/*` 的行是
 * 「純註解行」；JSDoc 區塊註解的內部續行（如 ` * doc`）與收尾行（星號＋斜線）並不以
 * `//`/`/*` 開頭，因此被判定為「非純註解行」。findTypeAliasEnd 在掃描
 * `| string` 後面是否接著純註解行序列以判斷 continuation 時，第一行 `/**` 判定
 * 為註解行，但第二行 ` * doc` 判定為非註解行而中止該序列，導致把 JSDoc 尚未結束
 * 的中段就當成型別別名的終點，過早在 `| string`（index 1）回傳，漏掉後面真正的
 * `| number;`（index 5）。
 *
 * 正確契約（期望行為）：`findTypeAliasEnd(lines, 0)` 應回傳型別別名真正結尾行
 * （`| number;` 所在行，index 5），而非在 `| string`（index 1）提早截斷。
 */
import { describe, expect, it } from 'vitest';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';

describe('findTypeAliasEnd - JSDoc 區塊註解續行截斷（adversarial R7）', () => {
  it('不應在型別別名中段的 JSDoc 區塊註解續行提早截斷', () => {
    const lines = [
      'type Foo =',
      '  | string',
      '  /**',
      '   * doc',
      '   */',
      '  | number;'
    ];

    const result = findTypeAliasEnd(lines, 0);

    // 現行為：在 index 1（`| string`）就提早 return，漏掉 index 5 的 `| number;`
    expect(result).toBe(5);
  });
});
