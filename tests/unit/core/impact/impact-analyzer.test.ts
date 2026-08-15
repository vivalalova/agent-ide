/**
 * ImpactAnalyzer 單元測試
 */

import { describe, it, expect, vi } from 'vitest';
import { ImpactAnalyzer } from '@core/impact/impact-analyzer.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createMockFileSystem, createMockFileStats } from '../_helpers/mock-factories.js';

describe('ImpactAnalyzer', () => {
  describe('getStats - circularDependencies', () => {
    it('Given 僅 type-only 的循環 import, when getStats, then circularDependencies 不計入該循環', async () => {
      const fileSystem = new MemFileSystem();
      await fileSystem.fromJSON({
        '/project/a.ts': 'import type { B } from \'./b.js\';\nexport type A = { b?: B };\n',
        '/project/b.ts': 'import type { A } from \'./a.js\';\nexport type B = { a?: A };\n'
      });

      const analyzer = new ImpactAnalyzer(fileSystem);
      await analyzer.analyzeProject('/project');

      expect(analyzer.getStats().circularDependencies).toBe(0);
    });
  });

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

    it('Given import 目標檔案不存在於磁碟, when analyzeFile, then 不應把該路徑列為依賴', async () => {
      const fileSystem = new MemFileSystem();
      await fileSystem.fromJSON({
        '/src/entry.ts': 'import \'./missing.js\';\n'
      });

      const analyzer = new ImpactAnalyzer(fileSystem);
      const result = await analyzer.analyzeFile('/src/entry.ts');

      expect(result.dependencies.map(dependency => dependency.path)).not.toContain('/src/missing');
      expect(result.dependencies).toEqual([]);
    });
  });

  describe('analyzeProject - includePatterns 邊界', () => {
    it('Given basename 以 Xts 結尾但沒有 .ts 副檔名, when analyzeProject, then 不應納入掃描結果', async () => {
      const fileSystem = new MemFileSystem();
      await fileSystem.fromJSON({
        '/project/src/actual.ts': 'export const actual = 1;\n',
        '/project/src/not-a-typescript-fileXts': 'plain text\n'
      });

      const analyzer = new ImpactAnalyzer(fileSystem);
      const result = await analyzer.analyzeProject('/project');

      expect(result.fileDependencies.map(file => file.filePath)).toEqual([
        '/project/src/actual.ts'
      ]);
    });
  });

  // FileScanner.isExcluded 直接對絕對路徑套用 excludePatterns（預設含 'dist'），
  // 未先換算成相對於專案根目錄的路徑：若專案根目錄本身落在名為 dist/node_modules
  // 等的祖先目錄下，祖先 segment 會被誤判成專案內部的排除目錄，整包專案的原始檔案
  // 靜默消失於掃描結果。indexing 模組同款缺陷已修（見 shouldIndexFile 改用 workspace
  // 相對路徑），FileScanner 目前沒有存 projectPath/root 可供換算，尚未比照修復。
  describe('analyzeProject - 祖先目錄名撞排除樣式', () => {
    it('Given 專案根目錄的祖先路徑含 dist 完整 segment, when analyzeProject, then 不應誤排除專案內部檔案', async () => {
      const fileSystem = new MemFileSystem();
      await fileSystem.fromJSON({
        '/home/dist/myproj/src/a.ts': 'export const a = 1;\n',
        '/home/dist/myproj/dist/generated.ts': 'export const g = 1;\n'
      });

      const analyzer = new ImpactAnalyzer(fileSystem);
      const result = await analyzer.analyzeProject('/home/dist/myproj');

      const filePaths = result.fileDependencies.map(file => file.filePath);
      // 錯誤重現點：isExcluded 對絕對路徑 '/home/dist/myproj/src/a.ts' 直接比對排除樣式
      // 'dist'（matchesPathFragment 展開為 '**/dist' 或 '**/dist/**'），workspace 根目錄
      // 上層路徑 /home/dist 裡的 'dist' segment 與專案內部的 dist 目錄無法區分，
      // 整個專案被誤判為位於排除目錄之下，src/a.ts 從掃描結果中靜默消失
      expect(filePaths).toContain('/home/dist/myproj/src/a.ts');
      // 對照組：專案內部真正的 dist 目錄仍應被排除
      expect(filePaths).not.toContain('/home/dist/myproj/dist/generated.ts');
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

  describe('analyzeProject - 重複分析時清除已刪除檔案的殘留節點', () => {
    it('Given a.ts import b.ts 後刪除 b.ts, when 對同一 analyzer 實例重跑 analyzeProject, then 依賴圖不應保留 b.ts 的幽靈節點', async () => {
      const fileSystem = new MemFileSystem();
      await fileSystem.fromJSON({
        '/project/a.ts': 'import \'./b\';\n',
        '/project/b.ts': 'export const b = 1;\n'
      });

      const analyzer = new ImpactAnalyzer(fileSystem);
      await analyzer.analyzeProject('/project');

      expect(analyzer.getStats().totalFiles).toBe(2);

      await fileSystem.deleteFile('/project/b.ts');
      await analyzer.analyzeProject('/project');

      // b.ts 已從檔案系統刪除，重新分析後不應再被計入依賴圖節點
      expect(analyzer.getStats().totalFiles).toBe(1);
      // a.ts 的依賴列表也不應再包含已刪除的 b.ts
      expect(analyzer.getDependencies('/project/a.ts')).not.toContain('/project/b.ts');
    });
  });

  describe('getTransitiveDependencies - maxDepth 限制', () => {
    it('Given a→b→c→d 依賴鏈, when maxDepth 2, then 只回傳兩層內的依賴', async () => {
      const fileSystem = new MemFileSystem();
      await fileSystem.fromJSON({
        '/project/a.ts': 'import \'./b\';\n',
        '/project/b.ts': 'import \'./c\';\n',
        '/project/c.ts': 'import \'./d\';\n',
        '/project/d.ts': 'export const d = 1;\n'
      });

      const analyzer = new ImpactAnalyzer(fileSystem);
      await analyzer.analyzeProject('/project');

      const deps = analyzer.getTransitiveDependencies('/project/a.ts', {
        includeTransitive: true,
        maxDepth: 2,
        direction: 'dependencies'
      });

      expect(deps).toContain('/project/b.ts');
      expect(deps).toContain('/project/c.ts');
      expect(deps).not.toContain('/project/d.ts');
    });
  });
});
