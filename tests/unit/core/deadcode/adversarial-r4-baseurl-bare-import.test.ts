/**
 * R4 (缺陷 C): tsconfig 只設 `baseUrl`（無 `paths`）時，bare specifier import 不會被清理。
 *
 * `importFromRemovalFile`（import-cleaner.ts）對非相對 specifier 只呼叫
 * `resolveBarePathAlias(moduleSpecifier, pathAliases)`，該函式只做 tsconfig `paths`
 * alias 前綴替換，不做 `baseUrl` fallback（見 shared/path-alias-resolver.ts 文件註解：
 * 「不做...baseUrl fallback」）。而 `loadPathAliases()`（tsconfig-loader.ts）在
 * `compilerOptions.paths` 不存在時，`pathAliases` 維持 `{}`，即使 `baseUrl` 有設定
 * 也不會被折入。兩者疊加的結果：專案只設 `baseUrl: "src"`（無 `paths`）時，consumer
 * 端 `import { dead } from 'utils/helpers'`（實際指向 `src/utils/helpers.ts`）永遠無法
 * 被 ImportCleaner 解析回被刪符號的定義檔，dead export 被刪後這句 import 應清掉卻被保留。
 *
 * 正確契約（期望行為）：baseUrl-only 專案的 bare specifier import，在其定義檔的 export
 * 被刪除後，consumer 的 import 應被清理。
 */
import { describe, expect, it } from 'vitest';
import { ImportCleaner } from '@core/deadcode/import-cleaner.js';
import { createDeadCodeCacheService } from '@core/deadcode/shared-cache.js';
import { ParserRegistry, initializeDefaultParsers } from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { loadPathAliases } from '@plugins/typescript/tsconfig-loader.js';
import { SymbolType } from '@shared/types/symbol.js';
import type { RemovalOperation } from '@core/deadcode/types.js';

describe('deadcode import cleanup baseUrl-only bare import（adversarial R4 / 缺陷 C）', () => {
  it('cleans consumer import from bare specifier resolved only via tsconfig baseUrl (no paths)', async () => {
    const fs = new MemFileSystem();
    await fs.fromJSON({
      '/proj/tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: 'src' } }),
      '/proj/src/utils/helpers.ts': 'export function dead() { return 1; }\nexport function live() { return 2; }\n',
      '/proj/src/consumer.ts': 'import { dead } from \'utils/helpers\';\n'
    });
    if (ParserRegistry.getInstance().isDisposed) {ParserRegistry.resetInstance();}
    const reg = ParserRegistry.getInstance();
    initializeDefaultParsers(reg);

    // 真實走 production 載入路徑：tsconfig 只設 baseUrl、無 paths，
    // loadPathAliases 目前回傳 {}（見 tsconfig-loader.ts 238-241 行只在
    // compilerOptions.paths 存在時才填入 pathAliases）。
    const pathAliases = await loadPathAliases('/proj', fs);

    const cleaner = new ImportCleaner(fs, reg, createDeadCodeCacheService(), pathAliases);
    const removals: RemovalOperation[] = [{
      filePath: '/proj/src/utils/helpers.ts',
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 40 } },
      originalCode: 'export function dead() { return 1; }',
      symbolName: 'dead',
      symbolType: SymbolType.Function
    }];

    const { cleanups } = await cleaner.analyzeImportCleanups(removals, [
      '/proj/src/utils/helpers.ts',
      '/proj/src/consumer.ts'
    ]);

    const consumer = cleanups.filter(c => c.filePath.includes('consumer'));
    expect(consumer.length).toBeGreaterThanOrEqual(1);
    expect(consumer.some(c => c.unusedSymbols.includes('dead'))).toBe(true);
  });
});
