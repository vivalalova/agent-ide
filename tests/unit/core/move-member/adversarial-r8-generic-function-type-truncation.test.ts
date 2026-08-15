/**
 * findTypeAliasEnd（range-finder.ts）泛型箭頭 function type 續行截斷（adversarial R8）
 *
 * `type Handler = <T>` 換行後接 `(value: T) => T;`：第一行行尾的 `<T>` 使 angleDepth
 * 於行尾歸零（`<` 遞增再被 `>` 遞減），該行最後一個 code token 是 `>`，不在
 * UNFINISHED_TRAILING_PUNCTUATION 集合內；下一行以 `(` 開頭，`(` 不在
 * CONTINUATION_LEADING_TOKENS 清單中。兩個判斷都判定「非續行」，導致函式提早在
 * 第 0 行（泛型參數列表結尾）就回傳，把型別別名的參數列表與函式本體切斷。
 */
import { describe, expect, it } from 'vitest';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';

describe('findTypeAliasEnd generic arrow function type continuation (adversarial R8)', () => {
  it('does not truncate after the generic parameter list line', () => {
    const lines = [
      'type Handler = <T>',
      '(value: T) => T;'
    ];

    expect(findTypeAliasEnd(lines, 0)).toBe(1);
  });
});
