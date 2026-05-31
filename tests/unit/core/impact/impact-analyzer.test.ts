/**
 * ImpactAnalyzer 單元測試
 */

import { describe, it, expect, vi } from 'vitest';
import { ImpactAnalyzer } from '@core/impact/impact-analyzer.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createMockFileSystem, createMockFileStats } from '../_helpers/mock-factories.js';

describe('ImpactAnalyzer', () => {
  describe('analyzeFile - 輸入驗證', () => {
    it('Given 空路徑, when analyzeFile, then 拋錯「檔案路徑不能為空」', async () => {
      const analyzer = new ImpactAnalyzer(createMockFileSystem());
      await expect(analyzer.analyzeFile('')).rejects.toThrow('檔案路徑不能為空');
    });

    it('Given 空白路徑, when analyzeFile, then 拋錯「檔案路徑不能為空」', async () => {
      const analyzer = new ImpactAnalyzer(createMockFileSystem());
      await expect(analyzer.analyzeFile('   ')).rejects.toThrow('檔案路徑不能為空');
    });

    it('Given 不存在的路徑, when analyzeFile, then 拋錯（File not found）', async () => {
      const analyzer = new ImpactAnalyzer(createMockFileSystem({}));
      await expect(analyzer.analyzeFile('/nonexistent/path.ts')).rejects.toThrow('File not found');
    });
  });

  describe('analyzeFile - 單檔案分析', () => {
    it('Given 無 import 的 .ts 檔案, when analyzeFile, then 回傳空依賴列表', async () => {
      const mockFs = createMockFileSystem({ '/src/foo.ts': 'const x = 1;' });
      vi.mocked(mockFs.getStats).mockResolvedValue(
        createMockFileStats({ isFile: true, isDirectory: false })
      );

      const analyzer = new ImpactAnalyzer(mockFs);
      const result = await analyzer.analyzeFile('/src/foo.ts');

      expect(result.filePath).toContain('foo.ts');
      expect(result.dependencies).toEqual([]);
    });

    it('Given .ts and .d.ts siblings, when resolving extensionless import, then prefers runtime source file', async () => {
      const fileSystem = new MemFileSystem();
      await fileSystem.fromJSON({
        '/src/entry.ts': 'import \'./foo\';\n',
        '/src/foo.ts': 'export const foo = 1;\n',
        '/src/foo.d.ts': 'export declare const foo: number;\n'
      });

      const analyzer = new ImpactAnalyzer(fileSystem);
      const result = await analyzer.analyzeFile('/src/entry.ts');

      expect(result.dependencies.map(dependency => dependency.path)).toEqual(['/src/foo.ts']);
    });
  });

  describe('空圖查詢', () => {
    it('Given 空依賴圖, when getDependencies, then 回傳空陣列', () => {
      const analyzer = new ImpactAnalyzer(createMockFileSystem());
      const deps = analyzer.getDependencies('/src/foo.ts');
      expect(deps).toEqual([]);
    });

    it('Given 空依賴圖, when getDependents, then 回傳空陣列', () => {
      const analyzer = new ImpactAnalyzer(createMockFileSystem());
      const deps = analyzer.getDependents('/src/foo.ts');
      expect(deps).toEqual([]);
    });

    it('Given 空依賴圖, when getImpactedFiles, then 回傳空陣列', () => {
      const analyzer = new ImpactAnalyzer(createMockFileSystem());
      const impacted = analyzer.getImpactedFiles('/src/foo.ts');
      expect(impacted).toEqual([]);
    });

    it('Given 空依賴圖, when getTransitiveDependencies, then 回傳空陣列', () => {
      const analyzer = new ImpactAnalyzer(createMockFileSystem());
      const deps = analyzer.getTransitiveDependencies('/src/foo.ts');
      expect(deps).toEqual([]);
    });
  });

  describe('統計資訊', () => {
    it('Given 空圖, when getStats, then 回傳零值統計', () => {
      const analyzer = new ImpactAnalyzer(createMockFileSystem());
      const stats = analyzer.getStats();
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalDependencies).toBe(0);
    });
  });
});
