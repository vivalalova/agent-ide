/**
 * P2: calculateMovedFileInternalUpdates() 的 alias/baseUrl import 分支
 * （path-calculator.ts 的 else 分支，約 410-487 行）只在目錄移動時
 * （`movedDirectory && normalizedFilesInDir`）才會檢查同批被移動的檔案，
 * 完全沒有處理 `batchMoveInfo`（glob 批次移動）的情況——相對路徑分支
 * （298-409 行）明確有 `if (batchMoveInfo) { ... }` 的批次感知改寫邏輯，
 * alias 分支卻整個沒有對應的 else if (batchMoveInfo) 分支。
 *
 * 具體重現：tsconfig path alias `@` 對應 `/proj/src`，glob 批次移動
 * `src/a.ts` 與 `src/b.ts` 一起搬到 `src/moved/` 底下。a.ts 內
 * `import { b } from '@/b'` 指向的 b.ts 也在同一批次一起被搬移，
 * 別名路徑理應被改寫為 `@/moved/b`，但目前完全沒有產生任何更新，
 * 搬移後 `@/b` 仍指向舊位置（已不存在的檔案），import 靜默失效。
 */
import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';
import { PathCalculator } from '@core/move/path-calculator.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createStructuredPathAliasMap } from '@shared/path-alias-resolver.js';
import type { BatchMoveInfo } from '@core/move/types.js';

describe('批次移動（glob）內部 alias import 改寫（adversarial batch-alias）', () => {
  it('批次一起搬移的 alias import 目標應被改寫為新的 alias 路徑', async () => {
    const fs = new MemFileSystem();
    await fs.fromJSON({
      '/proj/src/a.ts': 'import { b } from \'@/b\';\nexport const useB = b;\n',
      '/proj/src/b.ts': 'export const b = 1;\n'
    });

    const pathAliases = createStructuredPathAliasMap([
      { alias: '@', wildcard: true, candidates: ['/proj/src'] }
    ]);
    const resolver = new ImportResolver({
      pathAliases,
      supportedExtensions: ['.ts', '.tsx', '.js', '.jsx']
    });
    const calc = new PathCalculator(fs, resolver);

    const batchMoveInfo: BatchMoveInfo = {
      allMovedFiles: new Map([
        ['/proj/src/a.ts', '/proj/src/moved/a.ts'],
        ['/proj/src/b.ts', '/proj/src/moved/b.ts']
      ])
    };

    const updates = await calc.calculateMovedFileInternalUpdates(
      '/proj/src/a.ts',
      '/proj/src/moved/a.ts',
      undefined,
      undefined,
      batchMoveInfo
    );

    const aliasUpdate = updates.find(u => u.oldImport.includes('@/b'));
    expect(aliasUpdate).toBeDefined();
    expect(aliasUpdate?.newImport).toContain('@/moved/b');
  });
});
