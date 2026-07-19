/**
 * P3: import-cleaner.ts 的 isConsumerOnly `stmtHasKnownDeadBinding` 略過閘門是整句級，
 * 而非 specifier 級。
 *
 * 同一句 import 若含一個已確認的「檔內未使用 import binding」（unusedImportBindingItems，
 * 見 DeadCodeDetector 的 isImportBinding 候選）時，該句會整句繞過
 * importFromRemovalFileAsync 的模組來源驗證，改讓句內「其他」specifier 也只靠全域
 * removedSymbols 名稱集合比對——這與既有 R4 regression（adversarial-r4-import-cleaner-
 * unrelated-alias.test.ts）防的是同一類問題：`removedSymbols` 只是全域名稱集合，不保證
 * 這句 import 的模組真的指向被刪檔案；同名但來自完全不相關模組的 specifier 不該被誤判
 * 為候選並清掉。
 *
 * 正確契約：只有 key 命中 knownDeadImportBindingKeys 的那個 specifier 才能繞過模組驗證；
 * 同句內其他 specifier 的 removedSymbols 比對仍必須先確認這句 import 的模組真的解析到
 * 被刪檔案。
 */
import { describe, expect, it } from 'vitest';
import { ImportCleaner } from '@core/deadcode/import-cleaner.js';
import { createDeadCodeCacheService } from '@core/deadcode/shared-cache.js';
import { ParserRegistry, initializeDefaultParsers } from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { SymbolType } from '@shared/types/symbol.js';
import type { DeadCodeItem, RemovalOperation } from '@core/deadcode/types.js';

describe('deadcode import cleanup - knownDeadImportBinding 繞過須為 specifier 級（P3）', () => {
  it('同句另一個同名但來自不相關模組的 specifier 不得被誤判為候選並清除', async () => {
    const fs = new MemFileSystem();
    await fs.fromJSON({
      // 真正被刪除的來源：與 consumer.ts 的 '@other/utils' 完全無關（無 pathAlias 設定）
      '/proj/src/removed-source.ts': 'export function deadHelper() { return 1; }\n',
      // consumer.ts 同一句 import { deadHelper, orphanBinding } from '@other/utils'：
      // - deadHelper：與被刪符號同名但來自不相關模組（R4 型陷阱）
      // - orphanBinding：本測試手動標記為已確認的 dead import binding（模擬 detector
      //   已判定其來源符號在別處仍存活、僅本檔未使用）
      '/proj/src/consumer.ts': 'import { deadHelper, orphanBinding } from \'@other/utils\';\n'
    });
    if (ParserRegistry.getInstance().isDisposed) {ParserRegistry.resetInstance();}
    const reg = ParserRegistry.getInstance();
    initializeDefaultParsers(reg);

    const cleaner = new ImportCleaner(fs, reg, createDeadCodeCacheService());
    const removals: RemovalOperation[] = [{
      filePath: '/proj/src/removed-source.ts',
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 43 } },
      originalCode: 'export function deadHelper() { return 1; }',
      symbolName: 'deadHelper',
      symbolType: SymbolType.Function
    }];
    const unusedImportBindingItems: DeadCodeItem[] = [{
      name: 'orphanBinding',
      type: SymbolType.Variable,
      location: {
        filePath: '/proj/src/consumer.ts',
        range: { start: { line: 1, column: 23 }, end: { line: 1, column: 36 } }
      },
      reason: '已 import 的 \'orphanBinding\' 在檔案內未使用',
      isImportBinding: true
    }];

    const { cleanups } = await cleaner.analyzeImportCleanups(
      removals,
      ['/proj/src/removed-source.ts', '/proj/src/consumer.ts'],
      unusedImportBindingItems
    );

    const consumerCleanups = cleanups.filter(c => c.filePath.includes('consumer'));
    expect(consumerCleanups).toHaveLength(1);
    const [cleanup] = consumerCleanups;

    // orphanBinding 是真正確認的 dead binding，應被清掉
    expect(cleanup.unusedSymbols).toContain('orphanBinding');
    // deadHelper 與被刪符號同名但來自不相關模組，即使同句有 orphanBinding 這個已確認的
    // dead binding，也不得被誤判為候選並清除——必須是部分清理，保留 deadHelper
    expect(cleanup.unusedSymbols).not.toContain('deadHelper');
    expect(cleanup.cleanupType).toBe('partial');
    expect(cleanup.newImport).toContain('deadHelper');
    expect(cleanup.newImport).not.toContain('orphanBinding');
  });
});
