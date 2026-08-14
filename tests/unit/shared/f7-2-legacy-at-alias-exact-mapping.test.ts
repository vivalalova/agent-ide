/**
 * F7-2 P3 — legacy record 的 `'@'` 映射被無條件強制成 wildcard，吃掉精確 `'@'`
 * 映射（先紅後綠）。`getPathAliasEntries` 必須同時保留 exact 與 wildcard 兩種
 * entry：`@` 本身可解析，`@/sub` 的既有 prefix 慣例也不能退化。
 */

import { describe, expect, it } from 'vitest';
import { findPathAliasMatch } from '@shared/path-alias-resolver.js';

describe('F7-2：legacy `@` alias 同時支援精確與 prefix 匹配', () => {
  it('精確的 `@` specifier 可解析', () => {
    const match = findPathAliasMatch('@', { '@': '/proj/src' });

    expect(match).not.toBeNull();
    expect(match?.entry.wildcard).toBe(false);
    expect(match?.candidates).toEqual(['/proj/src']);
  });

  it('`@/sub` 仍走 prefix 匹配（保留 legacy 慣例）', () => {
    const match = findPathAliasMatch('@/utils/a', { '@': '/proj/src' });

    expect(match).not.toBeNull();
    expect(match?.entry.wildcard).toBe(true);
    expect(match?.remainder).toBe('utils/a');
  });

  it('其他非 `@` 的 legacy alias 維持只精確匹配', () => {
    expect(findPathAliasMatch('@pkg/sub', { '@pkg': '/proj/src/pkg' })).toBeNull();
    expect(findPathAliasMatch('@pkg', { '@pkg': '/proj/src/pkg' })).not.toBeNull();
  });
});
