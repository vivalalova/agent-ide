/**
 * P1: importFromRemovalFile 對非相對 specifier 用「specifier 最後一段 basename」比對
 * 被刪檔案 basename 作為粗篩，未核對 tsconfig path-alias 是否真的指向被刪檔。
 *
 * `import { deadHelper } from '@other/utils'` 中 `@other` 是與被刪檔案 `src/utils.ts`
 * 完全無關的第三方套件（未在 tsconfig `paths` 設定任何 alias），只是 specifier 最後一段
 * 恰好同為 'utils'、且被刪符號同名 'deadHelper'。basename 粗篩會誤判此 import 指向
 * 被刪檔案，進而清掉一個來自完全不同套件、與此次刪除毫無關係的 import（誤刪會直接讓
 * consumer 編譯壞掉，比原本「漏刪」的後果更嚴重；即使該 import 恰好也未被使用，清理它
 * 依然是錯的——它從未指向被刪檔案）。
 *
 * 正確契約：非相對 specifier 必須先用真實 tsconfig pathAliases 解析出絕對路徑，
 * 確認真的指向被刪檔案才可清理；無 alias 設定可解析時一律不清（寧漏勿誤刪）。
 */
import { describe, expect, it } from 'vitest';
import { ImportCleaner } from '@core/deadcode/import-cleaner.js';
import { createDeadCodeCacheService } from '@core/deadcode/shared-cache.js';
import { ParserRegistry, initializeDefaultParsers } from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { SymbolType } from '@shared/types/symbol.js';
import type { RemovalOperation } from '@core/deadcode/types.js';

describe('deadcode import cleanup 不相關套件 basename 誤清（adversarial R4）', () => {
  it('不清理 @other/utils 的 import，即使被刪符號同名且 specifier 最後一段恰好同 basename', async () => {
    const fs = new MemFileSystem();
    await fs.fromJSON({
      '/proj/src/utils.ts': 'export function deadHelper() { return 1; }\nexport function live() { return 2; }\n',
      '/proj/src/consumer.ts': 'import { deadHelper } from \'@other/utils\';\n'
    });
    if (ParserRegistry.getInstance().isDisposed) {ParserRegistry.resetInstance();}
    const reg = ParserRegistry.getInstance();
    initializeDefaultParsers(reg);

    // 無任何 pathAliases 設定：'@other' 不是專案的 tsconfig path-alias，
    // ImportCleaner 無從得知它是否指向被刪檔案，必須保守不清理。
    const cleaner = new ImportCleaner(fs, reg, createDeadCodeCacheService());
    const removals: RemovalOperation[] = [{
      filePath: '/proj/src/utils.ts',
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 40 } },
      originalCode: 'export function deadHelper() { return 1; }',
      symbolName: 'deadHelper',
      symbolType: SymbolType.Function
    }];

    const { cleanups } = await cleaner.analyzeImportCleanups(removals, [
      '/proj/src/utils.ts',
      '/proj/src/consumer.ts'
    ]);

    const consumerCleanups = cleanups.filter(c => c.filePath.includes('consumer'));
    expect(consumerCleanups).toHaveLength(0);
  });
});
