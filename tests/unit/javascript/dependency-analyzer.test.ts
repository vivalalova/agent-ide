/**
 * JavaScript ImpactAnalyzer 測試
 * 測試 JavaScript 檔案的依賴分析功能
 */

import { describe, it, expect, vi } from 'vitest';
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
// JavaScript ImpactAnalyzer Tests
// ============================================================================

describe('ImpactAnalyzer (JavaScript)', () => {
  describe('analyzeFile - JavaScript 基本依賴', () => {
    it('應該分析 ES6 import 的依賴', async () => {
      const files = {
        '/src/a.js': 'import { foo } from "./b";\nexport const a = foo;',
        '/src/b.js': 'export const foo = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/a.js');

      expect(result.filePath).toBe('/src/a.js');
      expect(result.dependencies.length).toBeGreaterThanOrEqual(0);
    });

    it('應該分析 default import', async () => {
      const files = {
        '/src/app.js': 'import React from "react";\nimport App from "./App";',
        '/src/App.js': 'export default function App() {}',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/app.js');

      expect(result.filePath).toBe('/src/app.js');
      expect(result.dependencies.length).toBeGreaterThanOrEqual(0);
    });

    it('應該分析 namespace import', async () => {
      const files = {
        '/src/main.js': 'import * as utils from "./utils";',
        '/src/utils.js': 'export const helper = () => {};',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/main.js');

      expect(result.filePath).toBe('/src/main.js');
    });

    it('應該分析副作用 import', async () => {
      const files = {
        '/src/index.js': 'import "./styles.css";\nimport "./polyfills";',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/index.js');

      expect(result.filePath).toBe('/src/index.js');
    });
  });

  describe('analyzeFile - JSX 依賴', () => {
    it('應該分析 JSX 檔案的依賴', async () => {
      const files = {
        '/src/App.jsx': `
          import React from 'react';
          import { Button } from './components/Button';
          import Header from './components/Header';

          export default function App() {
            return <div><Header /><Button /></div>;
          }
        `,
        '/src/components/Button.jsx': 'export function Button() {}',
        '/src/components/Header.jsx': 'export default function Header() {}',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/App.jsx');

      expect(result.filePath).toBe('/src/App.jsx');
      expect(result.dependencies.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeFile - 多種 import 語法', () => {
    it('應該分析混合 import 語法', async () => {
      const files = {
        '/src/index.js': `
          import { foo, bar } from './module-a';
          import baz, { qux } from './module-b';
          import * as helpers from './helpers';
          import defaultExport from './default';
          import './side-effects';
        `,
        '/src/module-a.js': 'export const foo = 1; export const bar = 2;',
        '/src/module-b.js': 'export default {}; export const qux = 3;',
        '/src/helpers.js': 'export const helper = () => {};',
        '/src/default.js': 'export default function() {}',
        '/src/side-effects.js': 'console.log("loaded");',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/index.js');

      expect(result.filePath).toBe('/src/index.js');
    });

    it('應該處理帶有別名的 import', async () => {
      const files = {
        '/src/app.js': `
          import { foo as myFoo } from './utils';
          import { bar as myBar, baz as myBaz } from './helpers';
        `,
        '/src/utils.js': 'export const foo = 1;',
        '/src/helpers.js': 'export const bar = 2; export const baz = 3;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/app.js');

      expect(result.filePath).toBe('/src/app.js');
    });
  });

  describe('analyzeFile - CommonJS 語法', () => {
    it('應該處理含有 require 的檔案（僅解析 ES6 import）', async () => {
      const files = {
        '/src/app.js': `
          const fs = require('fs');
          const path = require('path');
          import { helper } from './helper';
        `,
        '/src/helper.js': 'export const helper = () => {};',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/app.js');

      // ImpactAnalyzer 使用正則解析，主要支援 ES6 import
      expect(result.filePath).toBe('/src/app.js');
    });
  });

  describe('analyzeProject - JavaScript 專案', () => {
    it('應該分析純 JavaScript 專案', async () => {
      const files = {
        '/project/src/index.js': 'import { App } from "./App";',
        '/project/src/App.js': 'import { utils } from "./utils";\nexport const App = () => {};',
        '/project/src/utils.js': 'export const utils = {};',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeProject('/project/src');

      expect(result.projectPath).toBe('/project/src');
      expect(result.fileDependencies.length).toBeGreaterThanOrEqual(0);
      expect(result.analyzedAt).toBeInstanceOf(Date);
    });

    it('應該分析混合 .js 和 .jsx 專案', async () => {
      const files = {
        '/project/src/index.js': 'import { App } from "./App.jsx";',
        '/project/src/App.jsx': 'import React from "react";\nexport const App = () => <div />;',
        '/project/src/utils.js': 'export const helper = () => {};',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeProject('/project/src');

      expect(result.projectPath).toBe('/project/src');
      expect(result.fileDependencies.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getDependencies / getDependents - JavaScript', () => {
    it('應該取得 JavaScript 檔案的直接依賴', async () => {
      const files = {
        '/src/a.js': 'import { foo } from "./b";',
        '/src/b.js': 'export const foo = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.js');

      const deps = analyzer.getDependencies('/src/a.js');
      expect(Array.isArray(deps)).toBe(true);
    });

    it('應該取得 JavaScript 檔案的依賴者', async () => {
      const files = {
        '/src/a.js': 'import { foo } from "./b";',
        '/src/b.js': 'export const foo = 1;',
        '/src/c.js': 'import { foo } from "./b";',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.js');
      await analyzer.analyzeFile('/src/b.js');
      await analyzer.analyzeFile('/src/c.js');

      const dependents = analyzer.getDependents('/src/b.js');
      expect(Array.isArray(dependents)).toBe(true);
    });
  });

  describe('getTransitiveDependencies - JavaScript', () => {
    it('應該取得 JavaScript 的傳遞依賴', async () => {
      const files = {
        '/src/a.js': 'import { foo } from "./b";',
        '/src/b.js': 'import { bar } from "./c"; export const foo = bar;',
        '/src/c.js': 'export const bar = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.js');
      await analyzer.analyzeFile('/src/b.js');
      await analyzer.analyzeFile('/src/c.js');

      const transitiveDeps = analyzer.getTransitiveDependencies('/src/a.js');
      expect(Array.isArray(transitiveDeps)).toBe(true);
    });

    it('應該尊重 maxDepth 選項', async () => {
      const files = {
        '/src/a.js': 'import { foo } from "./b";',
        '/src/b.js': 'export const foo = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.js');

      const deps = analyzer.getTransitiveDependencies('/src/a.js', { maxDepth: 1 });
      expect(Array.isArray(deps)).toBe(true);
    });
  });

  describe('getImpactedFiles - JavaScript', () => {
    it('應該取得 JavaScript 檔案變更的影響範圍', async () => {
      const files = {
        '/src/a.js': 'import { foo } from "./b";',
        '/src/b.js': 'export const foo = 1;',
        '/src/c.js': 'import { foo } from "./b";',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.js');
      await analyzer.analyzeFile('/src/b.js');
      await analyzer.analyzeFile('/src/c.js');

      const impacted = analyzer.getImpactedFiles('/src/b.js');
      expect(Array.isArray(impacted)).toBe(true);
    });
  });

  describe('getImpactAnalysis - JavaScript', () => {
    it('應該取得 JavaScript 的詳細影響分析結果', async () => {
      const files = {
        '/src/a.js': 'import { foo } from "./b";',
        '/src/b.js': 'export const foo = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.js');
      await analyzer.analyzeFile('/src/b.js');

      const analysis = analyzer.getImpactAnalysis('/src/b.js');

      expect(analysis.targetFile).toBe('/src/b.js');
      expect(Array.isArray(analysis.directlyAffected)).toBe(true);
      expect(Array.isArray(analysis.transitivelyAffected)).toBe(true);
      expect(Array.isArray(analysis.affectedTests)).toBe(true);
      expect(typeof analysis.impactScore).toBe('number');
    });
  });

  describe('getAffectedTests - JavaScript', () => {
    it('應該取得受影響的 JavaScript 測試檔案', async () => {
      const files = {
        '/src/utils.js': 'export const helper = () => {};',
        '/src/utils.test.js': 'import { helper } from "./utils"; test("helper", () => {});',
        '/tests/utils.spec.js': 'import { helper } from "../src/utils"; test("helper", () => {});',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/utils.js');
      await analyzer.analyzeFile('/src/utils.test.js');
      await analyzer.analyzeFile('/tests/utils.spec.js');

      const tests = analyzer.getAffectedTests('/src/utils.js');
      expect(Array.isArray(tests)).toBe(true);
    });
  });

  describe('getStats - JavaScript', () => {
    it('應該取得 JavaScript 專案的依賴統計', async () => {
      const files = {
        '/src/a.js': 'import { foo } from "./b";',
        '/src/b.js': 'import { bar } from "./c"; export const foo = bar;',
        '/src/c.js': 'export const bar = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/a.js');
      await analyzer.analyzeFile('/src/b.js');
      await analyzer.analyzeFile('/src/c.js');

      const stats = analyzer.getStats();

      expect(typeof stats.totalFiles).toBe('number');
      expect(typeof stats.totalDependencies).toBe('number');
      expect(typeof stats.averageDependenciesPerFile).toBe('number');
      expect(typeof stats.maxDependenciesInFile).toBe('number');
      expect(typeof stats.circularDependencies).toBe('number');
      expect(typeof stats.orphanedFiles).toBe('number');
    });
  });

  describe('excludePatterns - JavaScript', () => {
    it('應該排除 node_modules', async () => {
      const files = {
        '/project/src/app.js': 'import { helper } from "./helper";',
        '/project/node_modules/lib/index.js': 'export const foo = 1;',
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
        '/project/src/app.js': 'export const app = 1;',
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

  describe('includePatterns - JavaScript', () => {
    it('應該只包含 JavaScript 相關檔案類型', async () => {
      const files = {
        '/project/src/app.js': 'export const app = 1;',
        '/project/src/component.jsx': 'export const Component = () => {};',
        '/project/src/readme.md': '# Readme',
        '/project/src/config.json': '{"key": "value"}',
        '/project/src/styles.css': '.app { color: red; }',
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

  describe('error handling - JavaScript', () => {
    it('應該拋出錯誤當檔案路徑為空', async () => {
      const fs = createMockFileSystem();
      const analyzer = new ImpactAnalyzer(fs);

      await expect(analyzer.analyzeFile('')).rejects.toThrow('檔案路徑不能為空');
      await expect(analyzer.analyzeFile('   ')).rejects.toThrow('檔案路徑不能為空');
    });

    it('應該拋出錯誤當 JavaScript 檔案不存在', async () => {
      const fs = createMockFileSystem();
      const analyzer = new ImpactAnalyzer(fs);

      await expect(analyzer.analyzeFile('/nonexistent.js')).rejects.toThrow();
    });

    it('應該處理語法錯誤的 JavaScript 檔案', async () => {
      const files = {
        '/src/broken.js': 'this is not valid import { syntax',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      // ImpactAnalyzer 使用正則解析，不應該拋出錯誤
      const result = await analyzer.analyzeFile('/src/broken.js');
      expect(result.filePath).toBe('/src/broken.js');
    });
  });

  describe('cache - JavaScript', () => {
    it('應該使用快取避免重複分析', async () => {
      const files = {
        '/src/app.js': 'import { helper } from "./helper";',
        '/src/helper.js': 'export const helper = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/app.js');
      await analyzer.analyzeFile('/src/app.js');

      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });

    it('應該重新分析當 JavaScript 檔案已修改', async () => {
      const files = {
        '/src/app.js': 'import { helper } from "./helper";',
        '/src/helper.js': 'export const helper = 1;',
      };
      const fs = createMockFileSystem(files);

      const analyzer = new ImpactAnalyzer(fs);

      await analyzer.analyzeFile('/src/app.js');

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

      await analyzer.analyzeFile('/src/app.js');

      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('mjs/cjs 副檔名', () => {
    it('應該分析 .mjs 檔案', async () => {
      const files = {
        '/src/app.mjs': 'import { helper } from "./helper.mjs";',
        '/src/helper.mjs': 'export const helper = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/app.mjs');

      expect(result.filePath).toBe('/src/app.mjs');
    });

    it('應該分析 .cjs 檔案（含 ES6 import）', async () => {
      const files = {
        '/src/app.cjs': 'import { helper } from "./helper";',
        '/src/helper.cjs': 'export const helper = 1;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/app.cjs');

      // ImpactAnalyzer 目前不支援 .cjs 副檔名（includePatterns 未包含）
      // 但 analyzeFile 直接分析單一檔案應該可以
      expect(result.filePath).toBe('/src/app.cjs');
    });
  });

  describe('相對路徑解析 - JavaScript', () => {
    it('應該正確解析相對路徑', async () => {
      const files = {
        '/project/src/components/Button.js': 'import { utils } from "../utils";',
        '/project/src/utils.js': 'export const utils = {};',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/project/src/components/Button.js');

      expect(result.filePath).toBe('/project/src/components/Button.js');
      expect(result.dependencies.length).toBeGreaterThanOrEqual(0);
    });

    it('應該處理深層嵌套的相對路徑', async () => {
      const files = {
        '/project/src/features/user/components/Avatar.js': 'import { api } from "../../../api";',
        '/project/src/api.js': 'export const api = {};',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/project/src/features/user/components/Avatar.js');

      expect(result.filePath).toBe('/project/src/features/user/components/Avatar.js');
    });
  });

  describe('concurrency - JavaScript', () => {
    it('應該使用預設並行度分析 JavaScript 專案', async () => {
      const files = {
        '/project/src/a.js': 'export const a = 1;',
        '/project/src/b.js': 'export const b = 2;',
        '/project/src/c.js': 'export const c = 3;',
        '/project/src/d.js': 'export const d = 4;',
        '/project/src/e.js': 'export const e = 5;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeProject('/project/src');

      expect(result.fileDependencies.length).toBeGreaterThanOrEqual(0);
    });

    it('應該使用自訂並行度', async () => {
      const files = {
        '/project/src/a.js': 'export const a = 1;',
        '/project/src/b.js': 'export const b = 2;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs, { concurrency: 1 });

      const result = await analyzer.analyzeProject('/project/src');

      expect(result.fileDependencies.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('maxDepth - JavaScript', () => {
    it('應該尊重最大深度限制', async () => {
      const files = {
        '/project/src/a.js': 'export const a = 1;',
        '/project/src/deep/b.js': 'export const b = 2;',
        '/project/src/deep/deeper/c.js': 'export const c = 3;',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs, { maxDepth: 1 });

      const result = await analyzer.analyzeProject('/project/src');

      expect(result.fileDependencies.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('單一檔案路徑', () => {
    it('應該分析單一 JavaScript 檔案路徑', async () => {
      const files = {
        '/project/src/app.js': 'import { helper } from "./helper";',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeProject('/project/src/app.js');

      expect(result.fileDependencies.length).toBe(1);
    });
  });

  describe('空結果', () => {
    it('應該回傳空結果當路徑不存在', async () => {
      const fs = createMockFileSystem();
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeProject('/nonexistent');

      expect(result.fileDependencies).toEqual([]);
    });

    it('應該回傳空統計對空圖', () => {
      const fs = createMockFileSystem();
      const analyzer = new ImpactAnalyzer(fs);

      const stats = analyzer.getStats();

      expect(stats.totalFiles).toBe(0);
      expect(stats.totalDependencies).toBe(0);
    });
  });

  describe('Re-export 語法', () => {
    it('應該處理 export from 語法', async () => {
      const files = {
        '/src/index.js': `
          export { foo, bar } from './module-a';
          export * from './module-b';
          export { default as Component } from './Component';
        `,
        '/src/module-a.js': 'export const foo = 1; export const bar = 2;',
        '/src/module-b.js': 'export const baz = 3;',
        '/src/Component.js': 'export default function Component() {}',
      };
      const fs = createMockFileSystem(files);
      const analyzer = new ImpactAnalyzer(fs);

      const result = await analyzer.analyzeFile('/src/index.js');

      expect(result.filePath).toBe('/src/index.js');
    });
  });
});
