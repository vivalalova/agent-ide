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

describe('search options', () => {
  it('應保留明確關閉 fuzzy 的設定', () => {
    const options = createSearchOptions({ fuzzy: false });

    expect(options.fuzzy).toBe(false);
  });

  it('應先套用符號類型過濾再限制搜尋結果數量', async () => {
    const index = new SymbolIndex();
    await index.addSymbol(createMockSymbol('TargetFunctionA', SymbolType.Function, '/src/a.ts'), createFileInfo('/src/a.ts'));
    await index.addSymbol(createMockSymbol('TargetFunctionB', SymbolType.Function, '/src/b.ts'), createFileInfo('/src/b.ts'));
    await index.addSymbol(createMockSymbol('TargetClass', SymbolType.Class, '/src/class.ts'), createFileInfo('/src/class.ts'));

    const results = await index.searchSymbols('Target', createSearchOptions({
      maxResults: 1,
      symbolTypes: [SymbolType.Class]
    }));

    expect(results.map(result => result.symbol.name)).toEqual(['TargetClass']);
  });

  it('searchSymbols 應尊重 createSearchOptions 傳入的 fuzzy=false', async () => {
    const index = new SymbolIndex();
    await index.addSymbol(
      createMockSymbol('formatTimestamp', SymbolType.Function, '/src/time.ts'),
      createFileInfo('/src/time.ts')
    );

    const results = await index.searchSymbols('ft', createSearchOptions({ fuzzy: false }));

    expect(results).toHaveLength(0);
  });

  it('相同符號重複加入索引時搜尋結果應去重', async () => {
    const index = new SymbolIndex();
    const symbol = createMockSymbol('uniqueSearchValue', SymbolType.Constant, '/src/value.ts');
    const fileInfo = createFileInfo('/src/value.ts');

    await index.addSymbol(symbol, fileInfo);
    await index.addSymbol(symbol, fileInfo);

    const results = await index.findSymbol('uniqueSearchValue');

    expect(results).toHaveLength(1);
  });
});
