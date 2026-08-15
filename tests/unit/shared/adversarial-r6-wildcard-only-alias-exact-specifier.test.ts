/**
 * resolveBarePathAlias（path-alias-resolver.ts:64 附近）比對 exact specifier 時只看
 * `specifier === alias`（path-alias-resolver.ts:72），沒有排除該 alias 其實只是
 * wildcard mapping（`@pkg/*`）、並無對應 exact mapping（`@pkg`）的情況。TypeScript
 * 的 `"@pkg/*": ["src/pkg/*"]` 只匹配 `@pkg/<sub>`，不匹配裸 specifier `@pkg` 本身；
 * 但此函式把 cleanAlias（去掉 `/*` 後的 `@pkg`）當成 exact key 直接命中，誤將
 * `@pkg` 解析成 `src/pkg`。
 */
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPathAliasMap, resolveBarePathAlias } from '@shared/path-alias-resolver.js';

describe('resolveBarePathAlias wildcard-only alias should not match the bare specifier (adversarial R6)', () => {
  it('returns null for the bare alias specifier when only a wildcard mapping exists', () => {
    const pathAliases = createPathAliasMap(
      { '@pkg': path.resolve('/proj/src/pkg') },
      new Set(['@pkg'])
    );

    const resolved = resolveBarePathAlias('@pkg', pathAliases);

    expect(resolved).toBeNull();
  });
});
