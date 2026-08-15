/**
 * audit-fix M2 regression（先紅後綠）
 *
 * import-cleaner：`import { foo as bar }` 且檔內仍用 bar 時不可刪 import。
 * 根因：isImportStillUsed 只以 export 名（foo）查引用，看不到 local alias（bar）。
 *
 * 觸發：同檔有與 import 原始名同名的 dead local 被列入 removals，或 consumer
 * 端 import 的 export 名落在 removedSymbols，但使用點只有 alias。
 */

import { describe, expect, it } from 'vitest';
import { ImportCleaner } from '@core/deadcode/import-cleaner.js';
import { createDeadCodeCacheService } from '@core/deadcode/shared-cache.js';
import { ParserRegistry, initializeDefaultParsers } from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { SymbolType } from '@shared/types/symbol.js';
import type { RemovalOperation } from '@core/deadcode/types.js';

describe('audit-fix M2：import-cleaner 保留仍在用的 import alias', () => {
  it('M2：import { foo as bar } 且 bar() 仍被呼叫時不得刪掉該 import', async () => {
    const fs = new MemFileSystem();
    // 同檔：local dead function 名與 import 原始名 foo 撞名；live 只透過 alias bar 使用 import
    await fs.fromJSON({
      '/proj/src/utils.ts': 'export function foo() { return 1; }\n',
      '/proj/src/consumer.ts': [
        'import { foo as bar } from \'./utils.js\';',
        '',
        'function foo() {',
        '  return 99;',
        '}',
        '',
        'export function live() {',
        '  return bar();',
        '}',
        ''
      ].join('\n')
    });

    if (ParserRegistry.getInstance().isDisposed) {
      ParserRegistry.resetInstance();
    }
    const reg = ParserRegistry.getInstance();
    initializeDefaultParsers(reg);

    const cleaner = new ImportCleaner(fs, reg, createDeadCodeCacheService());

    // 刪除同檔 dead local `foo`（不是 import）—— removedSymbols 含 "foo"
    const removals: RemovalOperation[] = [
      {
        filePath: '/proj/src/consumer.ts',
        range: { start: { line: 3, column: 1 }, end: { line: 5, column: 2 } },
        originalCode: 'function foo() {\n  return 99;\n}',
        symbolName: 'foo',
        symbolType: SymbolType.Function
      }
    ];

    const { cleanups } = await cleaner.analyzeImportCleanups(removals, [
      '/proj/src/utils.ts',
      '/proj/src/consumer.ts'
    ]);

    const consumerImportCleanups = cleanups.filter(
      (c) => c.filePath.includes('consumer') && c.originalImport.includes('foo as bar')
    );

    // Bug：isImportStillUsed('foo') 看不到 bar()，誤把仍在用的 alias import 整句刪掉
    expect(consumerImportCleanups.some((c) => c.cleanupType === 'delete')).toBe(false);
    for (const c of consumerImportCleanups) {
      expect(c.unusedSymbols).not.toContain('foo');
    }
  });
});
