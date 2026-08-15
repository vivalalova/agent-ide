/**
 * hasMaskedLiteralBeforeToken（range-finder.ts:148 附近）從整段文字（`text`，
 * 即 `lines.slice(startLine).join('\n')`）index 0 開始全域掃描到目前 token 位置，
 * 只要「更早的任何一行」出現過字串/template/regex 字面值就回傳 true——並非只檢查
 * 「目前行」是否有未閉合的字面值遮蔽。
 *
 * isContinuationLeadingToken 依此結果判斷行首 `|`/`&` 是否為續行符號：若
 * hasMaskedLiteralBefore 為 true 就直接判定「非續行」（見同檔 207 行附近註解：
 * 該邏輯原意是避免行首 `|` 其實是被字面值遮蔽掉的位元運算子，而非 union type
 * 延續符號）。但因為掃描範圍是「從檔案開頭到目前 token」而非「目前行開頭到
 * 目前 token」，只要別名內任一更早的行（如 union 的某個字串字面值成員
 * `| "a"`）用過字串字面值，之後所有行的行首 `|` 都會被永久誤判為非續行，
 * 導致多行 union type 在該字串成員之後就被提前截斷。
 *
 * 對照組（無字串字面值成員的同構 union）目前能正確回傳 3，證明誤殺確實由
 * 字面值觸發，而非本測試案例的其他結構因素。
 */
import { describe, expect, it } from 'vitest';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';

describe('findTypeAliasEnd - masked literal falsely poisons later lines\' continuation check (adversarial R12)', () => {
  it('does not truncate a multiline union after an earlier string-literal member', () => {
    const lines = [
      'type Value =',
      '  | "a"',
      '  | Bar',
      '  | Baz;'
    ];

    const end = findTypeAliasEnd(lines, 0);

    expect(end).toBe(3);
  });

  it('control: an isomorphic union with no string-literal member is not truncated', () => {
    const lines = [
      'type Value =',
      '  | Foo',
      '  | Bar',
      '  | Baz;'
    ];

    const end = findTypeAliasEnd(lines, 0);

    expect(end).toBe(3);
  });
});
