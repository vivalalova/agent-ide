/**
 * R9 (缺陷): resolvePathAlias（同步版）在 alias 有多個候選路徑時，永遠回傳第一個
 * 宣告的候選，不管它是否真的存在於檔案系統。
 *
 * import-resolver.ts 的 resolvePathAlias（約 497-499 行）呼叫
 * `resolveBarePathAlias(aliasPath, this.config.pathAliases)`，未帶第三個參數
 * `exists`。path-alias-resolver.ts 的 resolveBarePathAlias（約 234-247 行）在
 * `exists` 為 undefined 時，第 241 行 `if (!exists || targetExistsSync(candidate,
 * exists))` 恆短路為 true，於是對每個候選一律「當作存在」，直接回傳 matchingEntries
 * 排序後第一個 entry 的第一個候選路徑。
 *
 * 這在 tsconfig `"@lib/*": ["legacy/*", "src/lib/*"]` 這種一個 alias 對應多個
 * candidate base path 的合法宣告下會出錯：move 流程解析 `import "@lib/gone"` 時，
 * 即使只有 `src/lib/gone` 實際存在（`legacy/gone` 早已不存在的舊路徑），同步版
 * 仍固定選中第一個宣告的 `legacy/gone`，把 import 指向一個不存在的檔案。
 *
 * 正確契約（期望行為）：resolvePathAlias 應該（透過可傳入的 exists 資訊，或至少
 * 對外可觀察的結果）解析到實際存在的候選 `/proj/src/lib/gone`，而非宣告順序上
 * 排第一但已不存在的 `/proj/legacy/gone`。
 */
import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';
import { createStructuredPathAliasMap } from '@shared/path-alias-resolver.js';

describe('resolvePathAlias 多候選存在性檢查（adversarial R9）', () => {
  it('應解析到實際存在的候選，而非宣告順序上排第一但已不存在的候選', () => {
    // 對應 tsconfig `"@lib/*": ["legacy/*", "src/lib/*"]`：同一個 alias 宣告了
    // 兩個候選 base path，只有 src/lib 底下的檔案實際存在。
    const pathAliases = createStructuredPathAliasMap([
      { alias: '@lib', wildcard: true, candidates: ['/proj/legacy', '/proj/src/lib'] }
    ]);
    const resolver = new ImportResolver({
      pathAliases,
      supportedExtensions: ['.ts', '.tsx', '.js', '.jsx']
    });

    // 只有 /proj/src/lib/gone 實際存在；/proj/legacy/gone 是已不存在的舊候選。
    const resolved = resolver.resolvePathAlias('@lib/gone');

    // 現行為：同步版無視存在性，一律回傳宣告順序第一個候選
    // '/proj/legacy/gone'，即使它不存在。
    expect(resolved).toBe('/proj/src/lib/gone');
  });
});
