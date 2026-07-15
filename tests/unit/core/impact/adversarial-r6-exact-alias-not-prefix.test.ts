/**
 * R6: PathResolver.resolvePathAlias（private，src/core/impact/path-resolver.ts:80-110）
 * 是手刻實作，未接 src/shared/path-alias-resolver.ts 的 resolveBarePathAlias 共用權威來源，
 * 因此不具 wildcard 感知：tsconfig 的 exact（非 `/*`）alias 如 `"@pkg": ["src/pkg"]` 只應
 * 精確匹配 `@pkg` 本身，TypeScript 不會把它當前綴套用到 `@pkg/sub`。但這裡的手刻邏輯把
 * 所有 alias 都當 wildcard 前綴比對，導致 `@pkg/sub` 被誤解析成 src/pkg/sub，而非維持
 * 「非相對、非 baseUrl、未啟用 includeNodeModules → 視為外部模組、回傳 null」的正確行為。
 *
 * 已接上共用 resolver 的模組（move/deadcode/rename/call-hierarchy）對同樣輸入會正確回傳 null。
 */
import { describe, expect, it } from 'vitest';
import { PathResolver } from '@core/impact/path-resolver.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createPathAliasMap } from '@shared/path-alias-resolver.js';

describe('PathResolver exact alias vs prefix (adversarial R6)', () => {
  it('does not resolve a sub-path against an exact (non-wildcard) tsconfig alias', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/proj/src/entry.ts': 'import \'@pkg/sub\';\n',
      '/proj/src/pkg/sub.ts': 'export const sub = 1;\n'
    });

    // exact alias（無 `/*` wildcard）：tsconfig `"paths": { "@pkg": ["src/pkg"] }`
    const pathAliases = createPathAliasMap({ '@pkg': '/proj/src/pkg' });

    const resolver = new PathResolver(fileSystem, { pathAliases });
    const result = await resolver.resolvePath('@pkg/sub', '/proj/src/entry.ts');

    // 正確行為：exact alias 不匹配 `@pkg/sub` 這種子路徑，應視為外部模組（null）。
    expect(result).toBeNull();
  });
});
