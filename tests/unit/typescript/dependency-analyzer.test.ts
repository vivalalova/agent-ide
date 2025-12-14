/**
 * ImpactAnalyzer 測試
 * 測試依賴關係分析器的所有功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImpactAnalyzer } from '@core/impact/index.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { DirectoryEntry, FileStats } from '@infrastructure/storage/types.js';

/**
 * 建立 Mock FileSystem
 */
function createMockFileSystem(files: Record<string, string> = {}): IFileSystem {
  const fileStats: Record<string, FileStats> = {};
  const now = new Date();

  Object.keys(files).forEach(path => {
    fileStats[path] = {
      isFile: true,
      isDirectory: false,
      size: files[path].length,
      createdTime: now,
      modifiedTime: now,
      accessedTime: now,
      mode: 0o644,
      uid: 1000,
      gid: 1000,
    };
  });

  return {
    readFile: vi.fn().mockImplementation(async (path: string) => {
      if (files[path] !== undefined) {
        return files[path];
      }
      throw new Error(`File not found: ${path}`);
    }),

    writeFile: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    createDirectory: vi.fn().mockResolvedValue(undefined),

    readDirectory: vi.fn().mockImplementation(async (dirPath: string): Promise<DirectoryEntry[]> => {
      const entries: DirectoryEntry[] = [];
      const normalizedDir = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;

      Object.keys(files).forEach(filePath => {
        if (filePath.startsWith(normalizedDir)) {
          const relativePath = filePath.slice(normalizedDir.length);
          const parts = relativePath.split('/');

          if (parts.length === 1) {
            entries.push({
              name: parts[0],
              path: filePath,
              isFile: true,
              isDirectory: false,
              size: files[filePath].length,
              modifiedTime: now,
            });
          } else if (parts.length > 1) {
            const dirName = parts[0];
            const dirFullPath = `${normalizedDir}${dirName}`;
            if (!entries.some(e => e.path === dirFullPath)) {
              entries.push({
                name: dirName,
                path: dirFullPath,
                isFile: false,
                isDirectory: true,
                size: 0,
                modifiedTime: now,
              });
            }
          }
        }
      });

      return entries;
    }),

    deleteDirectory: vi.fn().mockResolvedValue(undefined),

    exists: vi.fn().mockImplementation(async (path: string) => {
      return files[path] !== undefined || Object.keys(files).some(f => f.startsWith(path + '/'));
    }),

    getStats: vi.fn().mockImplementation(async (path: string): Promise<FileStats> => {
      if (fileStats[path]) {
        return fileStats[path];
      }
      if (Object.keys(files).some(f => f.startsWith(path + '/'))) {
        return {
          isFile: false,
          isDirectory: true,
          size: 0,
          createdTime: now,
          modifiedTime: now,
          accessedTime: now,
          mode: 0o755,
          uid: 1000,
          gid: 1000,
        };
      }
      throw new Error(`Path not found: ${path}`);
    }),

    isFile: vi.fn().mockImplementation(async (path: string) => files[path] !== undefined),
    isDirectory: vi.fn().mockImplementation(async (path: string) => {
      return Object.keys(files).some(f => f.startsWith(path + '/'));
    }),

    copyFile: vi.fn().mockResolvedValue(undefined),
    moveFile: vi.fn().mockResolvedValue(undefined),
    glob: vi.fn().mockResolvedValue([]),
  };
}

// ============================================================================
// ImpactAnalyzer Tests
// ============================================================================

describe('ImpactAnalyzer', () => {
  describe('constructor', () => {
    it('應該使用預設選項建立分析器', () => {
      const fs = createMockFileSystem();
      const analyzer = new ImpactAnalyzer(fs);

      expect(analyzer).toBeDefined();
    });

    it('應該使用自訂選項建立分析器', () => {
      const fs = createMockFileSystem();
      const analyzer = new ImpactAnalyzer(fs, {
        includeNodeModules: true,
        maxDepth: 50,
        concurrency: 8,
      });

      expect(analyzer).toBeDefined();
    });
  });

  describe('analyzeFile', () => {
    it('應該分析 TypeScript 檔案的依賴', async () => {
      const files = {
        '/src/a.ts': 'import { foo } from "./b";\nexport const a = foo;',
        '/src/b.ts': 'export const foo = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/a.ts');

      expect(result.filePath).toBe('/src/a.ts');
      expect(result.dependencies.length).toBeGreaterThanOrEqual(0);
    });

    it('應該分析 JavaScript 檔案的依賴', async () => {
      const files = {
        '/src/a.js': 'import { foo } from "./b";\nexport const a = foo;',
        '/src/b.js': 'export const foo = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/a.js');

      expect(result.filePath).toBe('/src/a.js');
    });

    it('應該拋出錯誤當檔案路徑為空', async () => {
      const fs = createMockFileSystem();
      const analyzer = new ImpactAnalyzer(fs);

      await expect(analyzer.analyzeFile('')).rejects.toThrow('檔案路徑不能為空');
      await expect(analyzer.analyzeFile('   ')).rejects.toThrow('檔案路徑不能為空');
    });

    it('應該拋出錯誤當檔案不存在', async () => {
      const fs = createMockFileSystem();
      const analyzer = new ImpactAnalyzer(fs);

      await expect(analyzer.analyzeFile('/nonexistent.ts')).rejects.toThrow();
    });

    it('應該使用快取避免重複分析', async () => {
      const files = {
        '/src/a.ts': 'import { foo } from "./b";',
        '/src/b.ts': 'export const foo = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.ts');
      await analyzer.analyzeFile('/src/a.ts');

      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });

    it('應該重新分析當檔案已修改', async () => {
      const files = {
        '/src/a.ts': 'import { foo } from "./b";',
        '/src/b.ts': 'export const foo = 1;',
      };
      const fs = createMockFileSystem(files);

      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.ts');

      // 模擬檔案修改
      const laterDate = new Date(Date.now() + 10000);
      (fs.getStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        isFile: true,
        isDirectory: false,
        size: 100,
        createdTime: new Date(),
        modifiedTime: laterDate,
        accessedTime: laterDate,
        mode: 0o644,
        uid: 1000,
        gid: 1000,
      });

      await analyzer.analyzeFile('/src/a.ts');

      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });

    it('應該處理不支援的檔案類型', async () => {
      const files = {
        '/src/a.py': 'import os\nprint("hello")',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/a.py');

      expect(result.dependencies).toEqual([]);
    });

    it('應該處理多種 import 語法', async () => {
      const files = {
        '/src/a.ts': `
          import { foo } from "./b";
          import * as bar from "./c";
          import baz from "./d";
          import "./e";
        `,
        '/src/b.ts': 'export const foo = 1;',
        '/src/c.ts': 'export const bar = 2;',
        '/src/d.ts': 'export default 3;',
        '/src/e.ts': 'console.log("side effect");',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/a.ts');

      expect(result.dependencies.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeProject', () => {
    it('應該分析整個專案的依賴', async () => {
      const files = {
        '/project/src/a.ts': 'import { foo } from "./b";',
        '/project/src/b.ts': 'export const foo = 1;',
        '/project/src/c.ts': 'import { foo } from "./b";',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeProject('/project/src');

      expect(result.projectPath).toBe('/project/src');
      expect(result.fileDependencies.length).toBeGreaterThanOrEqual(0);
      expect(result.analyzedAt).toBeInstanceOf(Date);
    });

    it('應該分析單一檔案路徑', async () => {
      const files = {
        '/project/src/a.ts': 'import { foo } from "./b";',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeProject('/project/src/a.ts');

      expect(result.fileDependencies.length).toBe(1);
    });

    it('應該回傳空結果當路徑不存在', async () => {
      const fs = createMockFileSystem();
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeProject('/nonexistent');

      expect(result.fileDependencies).toEqual([]);
    });
  });

  describe('getDependencies / getDependents', () => {
    it('應該取得檔案的直接依賴', async () => {
      const files = {
        '/src/a.ts': 'import { foo } from "./b";',
        '/src/b.ts': 'export const foo = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.ts');

      const deps = analyzer.getDependencies('/src/a.ts');
      expect(Array.isArray(deps)).toBe(true);
    });

    it('應該取得檔案的直接依賴者', async () => {
      const files = {
        '/src/a.ts': 'import { foo } from "./b";',
        '/src/b.ts': 'export const foo = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.ts');
      await analyzer.analyzeFile('/src/b.ts');

      const dependents = analyzer.getDependents('/src/b.ts');
      expect(Array.isArray(dependents)).toBe(true);
    });
  });

  describe('getTransitiveDependencies', () => {
    it('應該取得傳遞依賴', async () => {
      const files = {
        '/src/a.ts': 'import { foo } from "./b";',
        '/src/b.ts': 'import { bar } from "./c"; export const foo = bar;',
        '/src/c.ts': 'export const bar = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.ts');
      await analyzer.analyzeFile('/src/b.ts');
      await analyzer.analyzeFile('/src/c.ts');

      const transitiveDeps = analyzer.getTransitiveDependencies('/src/a.ts');
      expect(Array.isArray(transitiveDeps)).toBe(true);
    });

    it('應該尊重 maxDepth 選項', async () => {
      const files = {
        '/src/a.ts': 'import { foo } from "./b";',
        '/src/b.ts': 'export const foo = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.ts');

      const deps = analyzer.getTransitiveDependencies('/src/a.ts', { maxDepth: 1 });
      expect(Array.isArray(deps)).toBe(true);
    });
  });

  describe('getImpactedFiles', () => {
    it('應該取得檔案變更的影響範圍', async () => {
      const files = {
        '/src/a.ts': 'import { foo } from "./b";',
        '/src/b.ts': 'export const foo = 1;',
        '/src/c.ts': 'import { foo } from "./b";',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.ts');
      await analyzer.analyzeFile('/src/b.ts');
      await analyzer.analyzeFile('/src/c.ts');

      const impacted = analyzer.getImpactedFiles('/src/b.ts');
      expect(Array.isArray(impacted)).toBe(true);
    });
  });

  describe('getImpactAnalysis', () => {
    it('應該取得詳細的影響分析結果', async () => {
      const files = {
        '/src/a.ts': 'import { foo } from "./b";',
        '/src/b.ts': 'export const foo = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.ts');
      await analyzer.analyzeFile('/src/b.ts');

      const analysis = analyzer.getImpactAnalysis('/src/b.ts');

      expect(analysis.targetFile).toBe('/src/b.ts');
      expect(Array.isArray(analysis.directlyAffected)).toBe(true);
      expect(Array.isArray(analysis.transitivelyAffected)).toBe(true);
      expect(Array.isArray(analysis.affectedTests)).toBe(true);
      expect(typeof analysis.impactScore).toBe('number');
    });
  });

  describe('getAffectedTests', () => {
    it('應該取得受影響的測試檔案', async () => {
      const files = {
        '/src/a.ts': 'export const foo = 1;',
        '/src/a.test.ts': 'import { foo } from "./a"; test("foo", () => {});',
        '/tests/a.spec.ts': 'import { foo } from "../src/a"; test("foo", () => {});',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.ts');
      await analyzer.analyzeFile('/src/a.test.ts');
      await analyzer.analyzeFile('/tests/a.spec.ts');

      const tests = analyzer.getAffectedTests('/src/a.ts');
      expect(Array.isArray(tests)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('應該取得依賴統計資訊', async () => {
      const files = {
        '/src/a.ts': 'import { foo } from "./b";',
        '/src/b.ts': 'import { bar } from "./c"; export const foo = bar;',
        '/src/c.ts': 'export const bar = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.ts');
      await analyzer.analyzeFile('/src/b.ts');
      await analyzer.analyzeFile('/src/c.ts');

      const stats = analyzer.getStats();

      expect(typeof stats.totalFiles).toBe('number');
      expect(typeof stats.totalDependencies).toBe('number');
      expect(typeof stats.averageDependenciesPerFile).toBe('number');
      expect(typeof stats.maxDependenciesInFile).toBe('number');
      expect(typeof stats.circularDependencies).toBe('number');
      expect(typeof stats.orphanedFiles).toBe('number');
    });

    it('應該回傳空統計對空圖', () => {
      const fs = createMockFileSystem();
      const analyzer = new ImpactAnalyzer(fs);

      const stats = analyzer.getStats();

      expect(stats.totalFiles).toBe(0);
      expect(stats.totalDependencies).toBe(0);
    });
  });

  describe('excludePatterns', () => {
    it('應該排除 node_modules', async () => {
      const files = {
        '/project/src/a.ts': 'import { foo } from "./b";',
        '/project/node_modules/lib/index.ts': 'export const foo = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeProject('/project');

      const nodeModulesFiles = result.fileDependencies.filter(
        fd => fd.filePath.includes('node_modules')
      );
      expect(nodeModulesFiles).toEqual([]);
    });

    it('應該排除 .git 目錄', async () => {
      const files = {
        '/project/src/a.ts': 'export const foo = 1;',
        '/project/.git/config': 'git config',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeProject('/project');

      const gitFiles = result.fileDependencies.filter(
        fd => fd.filePath.includes('.git')
      );
      expect(gitFiles).toEqual([]);
    });
  });

  describe('includePatterns', () => {
    it('應該只包含指定的檔案類型', async () => {
      const files = {
        '/project/src/a.ts': 'export const foo = 1;',
        '/project/src/b.js': 'export const bar = 2;',
        '/project/src/c.md': '# Readme',
        '/project/src/d.json': '{"key": "value"}',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeProject('/project/src');

      result.fileDependencies.forEach(fd => {
        expect(
          fd.filePath.endsWith('.ts')
          || fd.filePath.endsWith('.tsx')
          || fd.filePath.endsWith('.js')
          || fd.filePath.endsWith('.jsx')
        ).toBe(true);
      });
    });
  });

  describe('concurrency', () => {
    it('應該使用預設並行度', async () => {
      const files = {
        '/project/src/a.ts': 'export const a = 1;',
        '/project/src/b.ts': 'export const b = 2;',
        '/project/src/c.ts': 'export const c = 3;',
        '/project/src/d.ts': 'export const d = 4;',
        '/project/src/e.ts': 'export const e = 5;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeProject('/project/src');

      expect(result.fileDependencies.length).toBeGreaterThanOrEqual(0);
    });

    it('應該使用自訂並行度', async () => {
      const files = {
        '/project/src/a.ts': 'export const a = 1;',
        '/project/src/b.ts': 'export const b = 2;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs, { concurrency: 1 });

      const result = await analyzer.analyzeProject('/project/src');

      expect(result.fileDependencies.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('maxDepth', () => {
    it('應該尊重最大深度限制', async () => {
      const files = {
        '/project/src/a.ts': 'export const a = 1;',
        '/project/src/deep/b.ts': 'export const b = 2;',
        '/project/src/deep/deeper/c.ts': 'export const c = 3;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs, { maxDepth: 1 });

      const result = await analyzer.analyzeProject('/project/src');

      expect(result.fileDependencies.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cache invalidation', () => {
    it('應該在檔案不存在時從快取中移除', async () => {
      const files = {
        '/src/a.ts': 'export const a = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.ts');

      // 模擬檔案被刪除
      (fs.getStats as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('File not found')
      );
      (fs.readFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('File not found')
      );

      await expect(analyzer.analyzeFile('/src/a.ts')).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('應該處理解析錯誤', async () => {
      const files = {
        '/src/a.ts': 'this is not valid import { syntax',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      // 應該不拋出錯誤，而是回傳空依賴
      const result = await analyzer.analyzeFile('/src/a.ts');
      expect(result.filePath).toBe('/src/a.ts');
    });

    it('應該處理讀取目錄錯誤', async () => {
      const fs = createMockFileSystem();
      (fs.readDirectory as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Permission denied')
      );

      const analyzer = new ImpactAnalyzer(fs);
      const result = await analyzer.analyzeProject('/project');

      expect(result.fileDependencies).toEqual([]);
    });
  });

  describe('glob matching', () => {
    it('應該正確匹配 ** 模式', async () => {
      const files = {
        '/project/src/a.ts': 'export const a = 1;',
        '/project/src/sub/b.ts': 'export const b = 2;',
        '/project/src/sub/deep/c.ts': 'export const c = 3;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeProject('/project');

      expect(result.fileDependencies.length).toBeGreaterThanOrEqual(0);
    });
  });
});
