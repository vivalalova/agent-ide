import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SnapshotEngine } from '@core/snapshot/snapshot-engine';
import { CompressionLevel } from '@core/snapshot/types';
import type { Snapshot, SnapshotOptions } from '@core/snapshot/types';
import * as fs from 'fs/promises';
import { glob } from 'glob';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('glob');

const createMockSnapshot = (overrides?: Partial<Snapshot>): Snapshot => {
  return {
    v: '1.0.0',
    p: 'test-project',
    t: Date.now(),
    h: 'project-hash-123',
    l: CompressionLevel.Full,
    s: {
      d: ['src', 'src/core'],
      m: [
        { p: 'src/index.ts', e: 5, d: 3, l: 100 },
        { p: 'src/core/test.ts', e: 2, d: 1, l: 50 }
      ]
    },
    y: {
      'src/index.ts': [
        { n: 'main', t: 'f', s: 1, e: 10, x: true }
      ]
    },
    dp: {
      g: [['src/index.ts', 'src/core/test.ts']],
      i: {
        'src/index.ts': ['src/core/test.ts']
      },
      ex: {
        'src/core/test.ts': []
      }
    },
    c: {
      'src/index.ts': { m: 'compressed code', ol: 100, cl: 80 },
      'src/core/test.ts': { m: 'compressed code', ol: 50, cl: 40 }
    },
    q: {
      ss: 45,
      cx: 60,
      mt: 70,
      is: ['Issue 1', 'Issue 2']
    },
    md: {
      fh: {
        '/project/src/index.ts': 'hash1',
        '/project/src/core/test.ts': 'hash2'
      },
      tf: 2,
      tl: 150,
      lg: ['TypeScript']
    },
    ...overrides
  };
};

describe('SnapshotEngine', () => {
  let engine: SnapshotEngine;

  beforeEach(() => {
    engine = new SnapshotEngine();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('load', () => {
    it('應該載入快照檔案', async () => {
      const mockSnapshot = createMockSnapshot();
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockSnapshot));

      const snapshot = await engine.load('/test/snapshot.json');

      expect(snapshot).toBeDefined();
      expect(snapshot.v).toBe('1.0.0');
      expect(snapshot.p).toBe('test-project');
    });

    it('應該處理無效的 JSON', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');

      await expect(engine.load('/test/snapshot.json')).rejects.toThrow();
    });

    it('應該處理檔案不存在', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      await expect(engine.load('/test/snapshot.json')).rejects.toThrow();
    });

    it('應該正確解析快照的所有欄位', async () => {
      const mockSnapshot = createMockSnapshot();
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockSnapshot));

      const snapshot = await engine.load('/test/snapshot.json');

      expect(snapshot.v).toBeDefined();
      expect(snapshot.p).toBeDefined();
      expect(snapshot.h).toBeDefined();
      expect(snapshot.l).toBeDefined();
      expect(snapshot.s).toBeDefined();
      expect(snapshot.y).toBeDefined();
      expect(snapshot.dp).toBeDefined();
      expect(snapshot.c).toBeDefined();
      expect(snapshot.q).toBeDefined();
      expect(snapshot.md).toBeDefined();
    });
  });

  describe('save', () => {
    it('應該保存快照到檔案', async () => {
      const mockSnapshot = createMockSnapshot();

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await engine.save(mockSnapshot, '/test/output/snapshot.json');

      expect(fs.mkdir).toHaveBeenCalledWith('/test/output', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('應該創建不存在的目錄', async () => {
      const mockSnapshot = createMockSnapshot();

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await engine.save(mockSnapshot, '/new/path/snapshot.json');

      expect(fs.mkdir).toHaveBeenCalledWith('/new/path', { recursive: true });
    });

    it('應該以 JSON 格式保存', async () => {
      const mockSnapshot = createMockSnapshot();

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await engine.save(mockSnapshot, '/test/snapshot.json');

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const content = writeCall[1] as string;

      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('應該處理寫入錯誤', async () => {
      const mockSnapshot = createMockSnapshot();

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write error'));

      await expect(engine.save(mockSnapshot, '/test/snapshot.json')).rejects.toThrow();
    });

    it('應該保存完整的快照資料', async () => {
      const mockSnapshot = createMockSnapshot();

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await engine.save(mockSnapshot, '/test/snapshot.json');

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const content = writeCall[1] as string;
      const saved = JSON.parse(content);

      expect(saved.v).toBe(mockSnapshot.v);
      expect(saved.p).toBe(mockSnapshot.p);
      expect(saved.h).toBe(mockSnapshot.h);
    });
  });

  describe('getStats', () => {
    it('應該計算正確的統計資訊', () => {
      const mockSnapshot = createMockSnapshot();
      const stats = engine.getStats(mockSnapshot);

      expect(stats).toBeDefined();
      expect(stats.fileCount).toBe(2);
      expect(stats.totalLines).toBe(150);
      expect(stats.symbolCount).toBeGreaterThanOrEqual(0);
      expect(stats.dependencyCount).toBeGreaterThanOrEqual(0);
      expect(stats.estimatedTokens).toBeGreaterThan(0);
    });

    it('應該計算符號總數', () => {
      const mockSnapshot = createMockSnapshot({
        y: {
          'file1.ts': [
            { n: 'func1', t: 'f', s: 1, e: 5 },
            { n: 'func2', t: 'f', s: 10, e: 15 }
          ],
          'file2.ts': [
            { n: 'class1', t: 'c', s: 1, e: 20 }
          ]
        }
      });

      const stats = engine.getStats(mockSnapshot);

      expect(stats.symbolCount).toBe(3);
    });

    it('應該計算依賴關係數', () => {
      const mockSnapshot = createMockSnapshot({
        dp: {
          g: [
            ['a.ts', 'b.ts'],
            ['b.ts', 'c.ts'],
            ['a.ts', 'c.ts']
          ],
          i: {},
          ex: {}
        }
      });

      const stats = engine.getStats(mockSnapshot);

      expect(stats.dependencyCount).toBe(3);
    });

    it('應該計算壓縮比例', () => {
      const mockSnapshot = createMockSnapshot();
      const stats = engine.getStats(mockSnapshot);

      expect(stats.compressionRatio).toBeDefined();
      expect(typeof stats.compressionRatio).toBe('number');
    });

    it('應該估計 token 數', () => {
      const mockSnapshot = createMockSnapshot();
      const stats = engine.getStats(mockSnapshot);

      expect(stats.estimatedTokens).toBeGreaterThan(0);
      expect(typeof stats.estimatedTokens).toBe('number');
    });

    it('應該處理空快照', () => {
      const emptySnapshot = createMockSnapshot({
        c: {},
        y: {},
        dp: { g: [], i: {}, ex: {} },
        md: { fh: {}, tf: 0, tl: 0, lg: [] }
      });

      const stats = engine.getStats(emptySnapshot);

      expect(stats.fileCount).toBe(0);
      expect(stats.totalLines).toBe(0);
      expect(stats.symbolCount).toBe(0);
      expect(stats.dependencyCount).toBe(0);
    });

    it('應該返回正確的資料結構', () => {
      const mockSnapshot = createMockSnapshot();
      const stats = engine.getStats(mockSnapshot);

      expect(stats).toHaveProperty('fileCount');
      expect(stats).toHaveProperty('totalLines');
      expect(stats).toHaveProperty('symbolCount');
      expect(stats).toHaveProperty('dependencyCount');
      expect(stats).toHaveProperty('estimatedTokens');
      expect(stats).toHaveProperty('compressionRatio');
      expect(stats).toHaveProperty('generationTime');
    });
  });

  describe('往返測試', () => {
    it('應該能夠保存後再載入快照', async () => {
      const originalSnapshot = createMockSnapshot();
      let savedContent: string = '';

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockImplementation(async (_path, content) => {
        savedContent = content as string;
      });

      await engine.save(originalSnapshot, '/test/snapshot.json');

      vi.mocked(fs.readFile).mockResolvedValue(savedContent);

      const loadedSnapshot = await engine.load('/test/snapshot.json');

      expect(loadedSnapshot.v).toBe(originalSnapshot.v);
      expect(loadedSnapshot.p).toBe(originalSnapshot.p);
      expect(loadedSnapshot.h).toBe(originalSnapshot.h);
    });
  });

  describe('邊界情況', () => {
    it('應該處理大型快照', () => {
      const largeSnapshot = createMockSnapshot({
        c: Object.fromEntries(
          Array.from({ length: 1000 }, (_, i) => [
            `file${i}.ts`,
            { m: 'code'.repeat(100), ol: 100, cl: 90 }
          ])
        ),
        md: {
          fh: Object.fromEntries(
            Array.from({ length: 1000 }, (_, i) => [`file${i}.ts`, `hash${i}`])
          ),
          tf: 1000,
          tl: 100000,
          lg: ['TypeScript']
        }
      });

      const stats = engine.getStats(largeSnapshot);

      expect(stats.fileCount).toBe(1000);
      expect(stats.totalLines).toBe(100000);
    });

    it('應該處理不同的壓縮層級', () => {
      const minimalSnapshot = createMockSnapshot({ l: CompressionLevel.Minimal });
      const mediumSnapshot = createMockSnapshot({ l: CompressionLevel.Medium });
      const fullSnapshot = createMockSnapshot({ l: CompressionLevel.Full });

      expect(engine.getStats(minimalSnapshot)).toBeDefined();
      expect(engine.getStats(mediumSnapshot)).toBeDefined();
      expect(engine.getStats(fullSnapshot)).toBeDefined();
    });

    it('應該處理多種語言', () => {
      const multiLangSnapshot = createMockSnapshot({
        c: {
          'file1.ts': { m: 'code', ol: 100, cl: 90 },
          'file2.js': { m: 'code', ol: 100, cl: 90 },
          'file3.swift': { m: 'code', ol: 100, cl: 90 }
        },
        md: {
          fh: {
            'file1.ts': 'hash1',
            'file2.js': 'hash2',
            'file3.swift': 'hash3'
          },
          tf: 3,
          tl: 300,
          lg: ['TypeScript', 'JavaScript', 'Swift']
        }
      });

      const stats = engine.getStats(multiLangSnapshot);

      expect(stats.fileCount).toBe(3);
      expect(multiLangSnapshot.md.lg).toContain('TypeScript');
      expect(multiLangSnapshot.md.lg).toContain('JavaScript');
      expect(multiLangSnapshot.md.lg).toContain('Swift');
    });

    it('應該處理沒有符號的快照', () => {
      const noSymbolSnapshot = createMockSnapshot({
        y: {}
      });

      const stats = engine.getStats(noSymbolSnapshot);

      expect(stats.symbolCount).toBe(0);
    });

    it('應該處理沒有依賴的快照', () => {
      const noDepsSnapshot = createMockSnapshot({
        dp: {
          g: [],
          i: {},
          ex: {}
        }
      });

      const stats = engine.getStats(noDepsSnapshot);

      expect(stats.dependencyCount).toBe(0);
    });

    it('應該處理空的架構資訊', () => {
      const noStructureSnapshot = createMockSnapshot({
        s: {
          d: [],
          m: []
        }
      });

      const stats = engine.getStats(noStructureSnapshot);

      expect(stats).toBeDefined();
    });
  });

  describe('快照版本', () => {
    it('應該正確讀取版本號', async () => {
      const snapshot = createMockSnapshot({ v: '2.0.0' });
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(snapshot));

      const loaded = await engine.load('/test/snapshot.json');

      expect(loaded.v).toBe('2.0.0');
    });

    it('應該保留時間戳', async () => {
      const timestamp = Date.now();
      const snapshot = createMockSnapshot({ t: timestamp });
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(snapshot));

      const loaded = await engine.load('/test/snapshot.json');

      expect(loaded.t).toBe(timestamp);
    });
  });

  describe('品質指標', () => {
    it('應該包含品質分數', () => {
      const snapshot = createMockSnapshot({
        q: {
          ss: 75,
          cx: 80,
          mt: 85,
          is: ['Issue 1', 'Issue 2', 'Issue 3']
        }
      });

      expect(snapshot.q.ss).toBe(75);
      expect(snapshot.q.cx).toBe(80);
      expect(snapshot.q.mt).toBe(85);
      expect(snapshot.q.is).toHaveLength(3);
    });

    it('應該處理空的問題列表', () => {
      const snapshot = createMockSnapshot({
        q: {
          ss: 90,
          cx: 95,
          mt: 92,
          is: []
        }
      });

      expect(snapshot.q.is).toHaveLength(0);
    });
  });

  describe('檔案 hash', () => {
    it('應該包含檔案 hash 映射', () => {
      const snapshot = createMockSnapshot();

      expect(snapshot.md.fh).toBeDefined();
      expect(typeof snapshot.md.fh).toBe('object');
    });

    it('應該包含專案 hash', () => {
      const snapshot = createMockSnapshot();

      expect(snapshot.h).toBeDefined();
      expect(typeof snapshot.h).toBe('string');
      expect(snapshot.h.length).toBeGreaterThan(0);
    });
  });

  describe('錯誤處理', () => {
    it('應該處理 mkdir 失敗', async () => {
      const snapshot = createMockSnapshot();

      vi.mocked(fs.mkdir).mockRejectedValue(new Error('mkdir failed'));

      await expect(engine.save(snapshot, '/test/snapshot.json')).rejects.toThrow('mkdir failed');
    });

    it('應該處理損壞的 JSON', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{ invalid json }');

      await expect(engine.load('/test/snapshot.json')).rejects.toThrow();
    });

    it('應該處理空檔案', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('');

      await expect(engine.load('/test/snapshot.json')).rejects.toThrow();
    });

    it('應該處理不完整的快照資料', async () => {
      const incompleteSnapshot = {
        v: '1.0.0',
        p: 'test'
        // 缺少其他必要欄位
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(incompleteSnapshot));

      const loaded = await engine.load('/test/snapshot.json');

      // 應該能載入，但資料不完整
      expect(loaded.v).toBe('1.0.0');
      expect(loaded.p).toBe('test');
    });
  });

  describe('效能考量', () => {
    it('應該能處理大量符號', () => {
      const manySymbols: Record<string, any[]> = {};
      for (let i = 0; i < 100; i++) {
        manySymbols[`file${i}.ts`] = Array.from({ length: 50 }, (_, j) => ({
          n: `symbol${j}`,
          t: 'f',
          s: j * 10,
          e: j * 10 + 5
        }));
      }

      const snapshot = createMockSnapshot({ y: manySymbols });
      const stats = engine.getStats(snapshot);

      expect(stats.symbolCount).toBe(5000);
    });

    it('應該能處理大量依賴', () => {
      const manyDeps: [string, string][] = [];
      for (let i = 0; i < 1000; i++) {
        manyDeps.push([`file${i}.ts`, `file${i + 1}.ts`]);
      }

      const snapshot = createMockSnapshot({
        dp: {
          g: manyDeps,
          i: {},
          ex: {}
        }
      });

      const stats = engine.getStats(snapshot);

      expect(stats.dependencyCount).toBe(1000);
    });
  });
});
