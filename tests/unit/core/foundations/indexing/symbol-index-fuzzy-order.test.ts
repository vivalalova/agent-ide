/**
 * SymbolIndex 模糊搜尋排序 regression 測試
 *
 * H3：searchSymbols 在收集階段對 results.length >= maxResults 做提早跳出
 * （截斷），截斷後才對 results 依 score 排序。當 maxResults 小於候選符號數，
 * 排序前就已經把結果截斷到 maxResults 筆，導致分數最高（精確匹配）的符號
 * 若在 Map 插入順序中排在後面，會被截斷掉、永遠排不進最終結果——排序形同虛設。
 */

import { describe, expect, it } from 'vitest';

import { SymbolIndex, createSearchOptions, type FileInfo } from '@core/foundations/indexing/index.js';
import { createMockSymbol } from '../../_helpers/mock-factories.js';
import { SymbolType } from '@shared/types/index.js';

function createFileInfo(filePath: string): FileInfo {
  return {
    filePath,
    lastModified: new Date('2026-01-01T00:00:00.000Z'),
    size: 1,
    extension: '.ts',
    language: 'typescript',
    checksum: filePath
  };
}

describe('SymbolIndex.searchSymbols 先截斷後排序 regression（H3）', () => {
  it('maxResults 小於候選數時，精確匹配應優先於截斷排在最終結果第一筆', async () => {
    const index = new SymbolIndex();

    // 依插入順序加入：兩個較長的模糊匹配符號先加入，精確匹配 'ab' 最後加入
    await index.addSymbol(
      createMockSymbol('aLongBName', SymbolType.Function, '/src/a.ts'),
      createFileInfo('/src/a.ts')
    );
    await index.addSymbol(
      createMockSymbol('aLongerBName', SymbolType.Function, '/src/b.ts'),
      createFileInfo('/src/b.ts')
    );
    await index.addSymbol(
      createMockSymbol('ab', SymbolType.Function, '/src/c.ts'),
      createFileInfo('/src/c.ts')
    );

    const results = await index.searchSymbols('ab', createSearchOptions({ maxResults: 1 }));

    // 正確行為：maxResults=1 時應回傳分數最高者，即精確匹配 'ab'，
    // 而非依插入順序截斷到的第一個模糊匹配 'aLongBName'
    expect(results).toHaveLength(1);
    expect(results[0].symbol.name).toBe('ab');
  });
});
