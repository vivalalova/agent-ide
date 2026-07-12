import { describe, expect, it } from 'vitest';

import { SymbolIndex, type FileInfo } from '@core/foundations/indexing/index.js';
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

describe('SymbolIndex.removeFileSymbols', () => {
  it('應移除同一檔案內多個同名符號的所有 entry（不留 stale entry）', async () => {
    const index = new SymbolIndex();
    const filePath = '/src/multi-class.ts';
    const fileInfo = createFileInfo(filePath);

    // 模擬同一檔案中兩個 class 各自擁有一個同名 method
    const methodInClassA = createMockSymbol('run', SymbolType.Function, filePath);
    const methodInClassB = {
      ...createMockSymbol('run', SymbolType.Function, filePath),
      location: {
        filePath,
        range: {
          start: { line: 10, column: 3 },
          end: { line: 10, column: 6 }
        }
      }
    };

    await index.addSymbol(methodInClassA, fileInfo);
    await index.addSymbol(methodInClassB, fileInfo);

    // sanity check：兩筆同名符號皆已加入索引
    expect(await index.findSymbol('run')).toHaveLength(2);

    await index.removeFileSymbols(filePath);

    const results = await index.findSymbol('run');
    expect(results).toEqual([]);
  });
});
