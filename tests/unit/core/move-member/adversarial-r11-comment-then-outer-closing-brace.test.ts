/**
 * findTypeAliasEnd（range-finder.ts:251 附近）在型別別名本行已完整終結後，若下一行是
 * 「註解 + 外層結構的 `}`」（如包住整個型別別名的 function body 收尾），
 * firstCodeTokenOnLine 剝除註解後取得的第一個 code token 是 `}`——該字元恰好也在
 * CONTINUATION_LEADING_TOKENS 清單中（用來辨識 object type body 的多行收尾），
 * 因而被誤判為本別名的 continuation，把外層函式的收尾大括號誤併入別名範圍。
 */
import { describe, expect, it } from 'vitest';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';

describe('findTypeAliasEnd - comment-then-outer-closing-brace falsely read as continuation (adversarial R11)', () => {
  it('does not extend into an enclosing function body closing brace', () => {
    const lines = [
      'function f() {',
      '  type User = string',
      '  /* close */ }'
    ];

    const end = findTypeAliasEnd(lines, 1);

    expect(end).toBe(1);
  });
});
