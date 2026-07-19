/**
 * F17 P3 — Impact cache 缺 content hash（reproduction，先紅後綠）
 *
 * analyzeFile 快取命中只比 mtime + size。同 mtime 且同 size、但內容不同
 * （例如原地改寫等長字串、粗粒度 FS 保留 mtime）會誤判命中、回傳舊依賴。
 * 正確：應納入 content hash（或至少在 mtime+size 相同時重讀比對內容）。
 */

import { describe, it, expect, vi } from 'vitest';
import { ImpactAnalyzer } from '@core/impact/impact-analyzer.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createMockFileStats } from '../_helpers/mock-factories.js';

describe('F17：ImpactAnalyzer 同 mtime+size 換內容應失效 cache', () => {
  it('Given 同 mtime 同 size 但內容不同, when 第二次 analyzeFile, then 必須重新分析非回舊 cache', async () => {
    // 兩份內容等長，確保 size 相同；import 目標不同
    const contentA = 'import { a } from \'./mod-aaa\';\nexport const x = a;\n';
    const contentB = 'import { b } from \'./mod-bbb\';\nexport const x = b;\n';
    expect(contentA.length).toBe(contentB.length);

    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/src/foo-f17.ts': contentA,
      '/src/mod-aaa.ts': 'export const a = 1;\n',
      '/src/mod-bbb.ts': 'export const b = 2;\n'
    });

    const fixedStat = createMockFileStats({
      modifiedTime: new Date('2024-01-01T00:00:00Z'),
      size: contentA.length
    });
    // 強制 mtime+size 永遠相同（模擬內容變了但 stat 沒變）
    const originalGetStats = fileSystem.getStats.bind(fileSystem);
    vi.spyOn(fileSystem, 'getStats').mockImplementation(async (p: string) => {
      if (String(p).includes('foo-f17')) {
        return fixedStat;
      }
      return originalGetStats(p);
    });

    const analyzer = new ImpactAnalyzer(fileSystem);

    const first = await analyzer.analyzeFile('/src/foo-f17.ts');
    const firstPaths = first.dependencies.map(d => d.path).join(' ');
    expect(firstPaths).toMatch(/mod-aaa/);

    // 內容換成 contentB，mtime+size 仍被 mock 為相同
    await fileSystem.writeFile('/src/foo-f17.ts', contentB);
    const second = await analyzer.analyzeFile('/src/foo-f17.ts');

    // Bug：mtime+size 相同 → 命中 cache → 仍回 contentA 的依賴
    const secondPaths = second.dependencies.map(d => d.path).join(' ');
    expect(secondPaths).toMatch(/mod-bbb/);
    expect(secondPaths).not.toMatch(/mod-aaa/);
  });
});
