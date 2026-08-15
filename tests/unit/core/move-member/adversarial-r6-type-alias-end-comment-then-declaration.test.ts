/**
 * findTypeAliasEnd（range-finder.ts:206 附近）在型別別名本行已無延續 token（如
 * `type User = string`，無分號結尾）之後緊接一個「純註解行」時，會把該註解行誤判成
 * continuation（isCommentOnlyLine 命中），因而略過本應在此處回傳的判定、繼續往下掃描；
 * 但掃到下一行真正的宣告時，該行 lastCodeTokenOnLine 為 undefined（純註解無 code
 * token），會直接 `lineIndex++` 跳過而不重新檢查 continuation 條件，導致再往下一路
 * 掃到下一條陳述句自己的 `;`，誤把它當成型別別名的終止符。
 */
import { describe, expect, it } from 'vitest';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';

describe('findTypeAliasEnd - comment-only line after a fully terminated alias (adversarial R6)', () => {
  it('does not extend into a following declaration when a comment-only line intervenes', () => {
    const lines = [
      'type User = string',
      '// note',
      'const live = 1;'
    ];

    const end = findTypeAliasEnd(lines, 0);

    expect(end).toBe(0);
  });
});
