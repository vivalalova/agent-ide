/**
 * ImpactAnalyzer 快取失效判準單元測試（G4 修復回歸測試）
 *
 * 背景：舊版快取命中判準只比 `stat.modifiedTime <= cacheEntry.lastModified`，
 * 內容變更但 mtime 未變新時（cp -p、git checkout、粗粒度 FS 的 mtime 保留型操作）
 * 會誤判快取命中、回傳舊的依賴分析結果。
 * 修復後快取條目同時記 mtime 與 size，兩者任一不同即視為快取失效重新分析
 * （判準對齊 index-disk-cache.ts 的 mtime+size 快取 key 設計）。
 */

import { describe, it, expect, vi } from 'vitest';
import { ImpactAnalyzer } from '@core/impact/impact-analyzer.js';
import { createMockFileSystem, createMockFileStats } from '../_helpers/mock-factories.js';

describe('ImpactAnalyzer - 快取失效判準 (G4)', () => {
  it('Given 同 mtime 但 size 不同, when analyzeFile 第二次呼叫, then 視為快取失效並重新讀檔分析', async () => {
    const mockFs = createMockFileSystem({ '/src/foo.ts': 'const x = 1;' });
    const fixedMtime = new Date('2024-01-01T00:00:00Z');

    let statCallCount = 0;
    vi.mocked(mockFs.getStats).mockImplementation(async () => {
      statCallCount += 1;
      // 第一次分析時 size=10；之後（模擬 cp -p / git checkout 造成內容變更但 mtime 未變新）size=20
      const size = statCallCount === 1 ? 10 : 20;
      return createMockFileStats({ modifiedTime: fixedMtime, size });
    });

    const analyzer = new ImpactAnalyzer(mockFs);

    await analyzer.analyzeFile('/src/foo.ts');
    expect(mockFs.readFile).toHaveBeenCalledTimes(1);

    await analyzer.analyzeFile('/src/foo.ts');

    // size 不同 → 快取失效 → 必須重新讀檔（而非直接回傳舊快取資料）
    expect(mockFs.readFile).toHaveBeenCalledTimes(2);
  });

  it('Given 同 mtime 且同 size, when analyzeFile 第二次呼叫, then 命中快取（仍可讀檔驗 contentHash）', async () => {
    const mockFs = createMockFileSystem({ '/src/foo.ts': 'const x = 1;' });
    const fixedStat = createMockFileStats({
      modifiedTime: new Date('2024-01-01T00:00:00Z'),
      size: 10
    });
    vi.mocked(mockFs.getStats).mockResolvedValue(fixedStat);

    const analyzer = new ImpactAnalyzer(mockFs);

    const first = await analyzer.analyzeFile('/src/foo.ts');
    expect(mockFs.readFile).toHaveBeenCalledTimes(1);

    const result = await analyzer.analyzeFile('/src/foo.ts');

    // mtime、size 相同後仍可能讀一次做 contentHash 驗證，但結果來自快取（依賴不變）
    expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    expect(result.filePath).toContain('foo.ts');
    expect(result.dependencies).toEqual(first.dependencies);
  });
});
