/**
 * findTypeAliasEnd（range-finder.ts:251 附近）在型別別名本行已完整終結（無延續
 * token）之後，下一行若以「註解 + 被 codeMask 遮蔽的 template literal / regex」開頭、
 * 緊接著才是真正的續行符號（如 `|`），firstCodeTokenOnLine 會跳過註解與遮蔽字元，
 * 直接取到該續行符號，誤判下一行是本別名的 continuation（union type 延續），導致
 * 別名結尾往後多算一行——但該行其實是獨立的 expression statement
 * （``` `foo` | 1; ```），與上一行的型別別名無關。
 */
import { describe, expect, it } from 'vitest';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';

describe('findTypeAliasEnd - comment/mask-leading line falsely read as continuation (adversarial R11)', () => {
  it('does not extend into an independent statement starting with a masked template literal', () => {
    const lines = [
      'type T = string',
      '/* note */ `foo` | 1;'
    ];

    const end = findTypeAliasEnd(lines, 0);

    expect(end).toBe(0);
  });

  it('does not extend into an independent statement starting with a masked regex literal', () => {
    const lines = [
      'type T = string',
      '/* note */ /foo/ | 1;'
    ];

    const end = findTypeAliasEnd(lines, 0);

    expect(end).toBe(0);
  });
});
