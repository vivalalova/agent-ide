/**
 * MoveService 測試
 * 測試檔案移動服務的各項功能
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MoveService, type MoveResult } from '../../../src/core/move/move-service.js';
import type { MoveOperation, MoveOptions, ImportResolverConfig } from '../../../src/core/move/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock filesystem for testing
vi.mock('fs/promises');
vi.mock('../../../src/core/move/import-resolver.js');

const mockFs = vi.mocked(fs);

// Mock ImportResolver
const mockImportResolver = {
  parseImportStatements: vi.fn(),
  isNodeModuleImport: vi.fn(),
  resolvePathAlias: vi.fn(),
  calculateRelativePath: vi.fn()
};

describe('MoveService', () => {
  let moveService: MoveService;
  
  beforeEach(() => {
    vi.clearAllMocks();

    // 使用 mock ImportResolver 建立 MoveService
    moveService = new MoveService(undefined, mockImportResolver as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('基本移動功能', () => {
    it('應該能建立 MoveService 實例', () => {
      expect(moveService).toBeInstanceOf(MoveService);
    });

    it('應該能建立帶配置的 MoveService 實例', () => {
      const config: ImportResolverConfig = {
        pathAliases: { '@': './src' },
        supportedExtensions: ['.ts', '.js']
      };
      
      const service = new MoveService(config);
      expect(service).toBeInstanceOf(MoveService);
    });

    it('應該能成功移動檔案', async () => {
      const operation: MoveOperation = {
        source: '/src/old.ts',
        target: '/src/new.ts',
        updateImports: false
      };

      // Mock filesystem operations
      mockFs.access.mockImplementation((path: string) => {
        if (path === '/src/old.ts') {
          // 來源檔案存在
          return Promise.resolve();
        } else if (path === '/src/new.ts') {
          // 目標檔案不存在 (這是好的)
          const error = new Error('ENOENT');
          (error as any).code = 'ENOENT';
          throw error;
        } else if (path === '/src') {
          // 目標目錄存在
          return Promise.resolve();
        }
        return Promise.resolve();
      });
      mockFs.rename.mockResolvedValue();
      mockFs.mkdir.mockResolvedValue();

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(true);
      expect(result.moved).toBe(true);
      expect(result.source).toBe('/src/old.ts');
      expect(result.target).toBe('/src/new.ts');
      expect(mockFs.rename).toHaveBeenCalledWith('/src/old.ts', '/src/new.ts');
    });

    it('應該能處理預覽模式', async () => {
      const operation: MoveOperation = {
        source: '/src/old.ts',
        target: '/src/new.ts',
        updateImports: true
      };

      const options: MoveOptions = {
        preview: true
      };

      // Mock filesystem operations
      mockFs.access
        .mockResolvedValueOnce() // source exists
        .mockResolvedValueOnce() // target dir exists
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); // target file doesn't exist
      mockFs.readdir.mockResolvedValue([]);

      const result = await moveService.moveFile(operation, options);

      expect(result.success).toBe(true);
      expect(result.moved).toBe(false);
      expect(result.message).toContain('預覽');
      expect(mockFs.rename).not.toHaveBeenCalled();
    });

    it('應該能處理來源檔案不存在的錯誤', async () => {
      const operation: MoveOperation = {
        source: '/src/nonexistent.ts',
        target: '/src/new.ts'
      };

      // Mock access to throw error for source file
      mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('來源路徑不存在');
    });

    it('應該能處理目標檔案已存在的錯誤', async () => {
      const operation: MoveOperation = {
        source: '/src/old.ts',
        target: '/src/existing.ts'
      };

      // Mock source exists, target exists
      mockFs.access
        .mockResolvedValueOnce() // source exists
        .mockResolvedValueOnce() // target dir exists
        .mockResolvedValueOnce(); // target exists (should cause error)

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('目標路徑已存在');
    });

    it('應該能建立目標目錄', async () => {
      const operation: MoveOperation = {
        source: '/src/old.ts',
        target: '/src/new/folder/new.ts'
      };

      // Mock source exists, target dir doesn't exist, target file doesn't exist
      mockFs.access
        .mockResolvedValueOnce() // source exists
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })) // target dir doesn't exist
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); // target file doesn't exist
      
      mockFs.mkdir.mockResolvedValue();
      mockFs.rename.mockResolvedValue();

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(true);
      expect(mockFs.mkdir).toHaveBeenCalledWith('/src/new/folder', { recursive: true });
    });
  });

  describe('Import 路徑更新功能', () => {
    it('應該能更新 import 路徑', async () => {
      const testRoot = process.cwd();
      const operation: MoveOperation = {
        source: path.join(testRoot, 'src/components/old.ts'),
        target: path.join(testRoot, 'src/utils/new.ts'),
        updateImports: true
      };

      // Mock filesystem operations
      mockFs.access.mockImplementation((filePath: string) => {
        if (filePath.includes('old.ts')) {
          return Promise.resolve(); // source exists
        }
        if (filePath.includes('utils') && !filePath.includes('new.ts')) {
          return Promise.resolve(); // target dir exists
        }
        if (filePath.includes('new.ts')) {
          const error = new Error('ENOENT');
          (error as any).code = 'ENOENT';
          throw error; // target doesn't exist
        }
        return Promise.resolve();
      });
      mockFs.rename.mockResolvedValue();
      mockFs.mkdir.mockResolvedValue();

      // Mock project files discovery - 需要正確處理遞迴目錄讀取
      mockFs.readdir.mockImplementation((dir: any) => {
        if (dir.includes('node_modules')) {
          throw new Error('Access denied');
        }
        if (dir === testRoot) {
          return Promise.resolve([
            { name: 'src', isDirectory: () => true, isFile: () => false }
          ] as any);
        }
        if (dir === path.join(testRoot, 'src')) {
          return Promise.resolve([
            { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
            { name: 'file2.js', isDirectory: () => false, isFile: () => true },
            { name: 'components', isDirectory: () => true, isFile: () => false }
          ] as any);
        }
        if (dir.includes('components')) {
          return Promise.resolve([
            { name: 'old.ts', isDirectory: () => false, isFile: () => true }
          ] as any);
        }
        return Promise.resolve([]);
      });

      // Mock file content reading - 正確回傳符合預期的檔案內容
      mockFs.readFile.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('file1')) {
          return Promise.resolve("import { Component } from './components/old';\n");
        }
        return Promise.resolve("// no imports\n");
      });
      mockFs.writeFile.mockResolvedValue();

      // Mock import resolver
      mockImportResolver.parseImportStatements.mockReturnValue([
        {
          path: './components/old',
          rawStatement: "import { Component } from './components/old';",
          position: { line: 1, column: 1 }
        }
      ]);
      
      mockImportResolver.isNodeModuleImport.mockReturnValue(false);
      mockImportResolver.resolvePathAlias.mockImplementation((path: string) => path);
      mockImportResolver.calculateRelativePath.mockReturnValue('../utils/new');

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(true);
      expect(result.pathUpdates.length).toBeGreaterThan(0);
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('應該能處理複雜的 import 路徑', async () => {
      const testRoot = process.cwd();
      const operation: MoveOperation = {
        source: path.join(testRoot, 'src/old.ts'),
        target: path.join(testRoot, 'src/new/new.ts'),
        updateImports: true
      };

      // Mock filesystem operations
      mockFs.access.mockImplementation((filePath: string) => {
        if (filePath.includes('old.ts')) {
          return Promise.resolve(); // source exists
        }
        if (filePath.includes('/new') && !filePath.includes('new.ts')) {
          return Promise.resolve(); // target dir exists
        }
        if (filePath.includes('new.ts')) {
          const error = new Error('ENOENT');
          (error as any).code = 'ENOENT';
          throw error; // target doesn't exist
        }
        return Promise.resolve();
      });
      mockFs.rename.mockResolvedValue();
      mockFs.mkdir.mockResolvedValue();

      // Mock project files discovery - similar to the working test
      mockFs.readdir.mockImplementation((dir: any) => {
        if (dir.includes('node_modules')) {
          throw new Error('Access denied');
        }
        if (dir === testRoot) {
          return Promise.resolve([
            { name: 'src', isDirectory: () => true, isFile: () => false }
          ] as any);
        }
        if (dir === path.join(testRoot, 'src')) {
          return Promise.resolve([
            { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
            { name: 'file2.ts', isDirectory: () => false, isFile: () => true }
          ] as any);
        }
        return Promise.resolve([]);
      });

      // Mock file content reading - files that reference the source
      mockFs.readFile.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('file1')) {
          return Promise.resolve(`
            import { A } from './old';
            import { B } from '../old';
            import React from 'react';
          `);
        }
        if (typeof filePath === 'string' && filePath.includes('file2')) {
          return Promise.resolve(`
            import { C } from './old';
            import { D } from '../old';
          `);
        }
        return Promise.resolve("// no imports\n");
      });
      mockFs.writeFile.mockResolvedValue();

      mockImportResolver.parseImportStatements.mockImplementation((content: string, filePath: string) => {
        if (filePath.includes('file1')) {
          return [
            {
              path: './old',
              rawStatement: "import { A } from './old';",
              position: { line: 1, column: 1 }
            },
            {
              path: '../old',
              rawStatement: "import { B } from '../old';",
              position: { line: 2, column: 1 }
            },
            {
              path: 'react',
              rawStatement: "import React from 'react';",
              position: { line: 3, column: 1 }
            }
          ];
        }
        if (filePath.includes('file2')) {
          return [
            {
              path: './old',
              rawStatement: "import { C } from './old';",
              position: { line: 1, column: 1 }
            },
            {
              path: '../old',
              rawStatement: "import { D } from '../old';",
              position: { line: 2, column: 1 }
            }
          ];
        }
        return [];
      });

      mockImportResolver.isNodeModuleImport.mockImplementation((importPath: string) => {
        return importPath === 'react'; // Only 'react' is a node module
      });

      mockImportResolver.resolvePathAlias.mockImplementation((path: string) => path);
      mockImportResolver.calculateRelativePath.mockReturnValue('./new/new');

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(true);
      expect(result.pathUpdates.length).toBe(2); // 只有兩個本地 import
    });

    it('應該能處理無法讀取的檔案', async () => {
      const operation: MoveOperation = {
        source: '/src/old.ts',
        target: '/src/new.ts',
        updateImports: true
      };

      // Mock filesystem operations
      mockFs.access
        .mockResolvedValueOnce() // source exists
        .mockResolvedValueOnce() // target dir exists
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); // target file doesn't exist
      mockFs.rename.mockResolvedValue();
      mockFs.mkdir.mockResolvedValue();
      mockFs.readdir.mockResolvedValue([
        { name: 'test.ts', isDirectory: () => false, isFile: () => true }
      ] as any);

      // Mock file reading error
      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));
      
      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(true); // 服務應該繼續執行，即使某些檔案無法讀取
      expect(result.pathUpdates).toHaveLength(0);
    });

    it('應該能跳過被移動的檔案本身', async () => {
      const operation: MoveOperation = {
        source: '/src/old.ts',
        target: '/src/new.ts',
        updateImports: true
      };

      // Mock filesystem operations
      mockFs.access
        .mockResolvedValueOnce() // source exists
        .mockResolvedValueOnce() // target dir exists
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); // target file doesn't exist
      mockFs.rename.mockResolvedValue();
      mockFs.mkdir.mockResolvedValue();
      mockFs.readdir.mockResolvedValue([
        { name: 'old.ts', isDirectory: () => false, isFile: () => true },
        { name: 'other.ts', isDirectory: () => false, isFile: () => true }
      ] as any);

      mockFs.readFile.mockResolvedValue("import { Test } from './other';\n");
      mockFs.writeFile.mockResolvedValue();

      mockImportResolver.parseImportStatements.mockReturnValue([]);

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(true);
      // 確保不會處理被移動的檔案本身
    });
  });

  describe('路徑解析功能', () => {
    it('應該能正確匹配路徑', async () => {
      const testRoot = process.cwd();
      const operation: MoveOperation = {
        source: path.join(testRoot, 'src/components/Button.ts'),
        target: path.join(testRoot, 'src/ui/Button.ts'),
        updateImports: true
      };

      // Mock filesystem operations
      mockFs.access.mockImplementation((filePath: string) => {
        if (filePath.includes('Button.ts') && filePath.includes('components')) {
          return Promise.resolve(); // source exists
        }
        if (filePath.includes('/ui') && !filePath.includes('Button.ts')) {
          return Promise.resolve(); // target dir exists
        }
        if (filePath.includes('Button.ts') && filePath.includes('ui')) {
          const error = new Error('ENOENT');
          (error as any).code = 'ENOENT';
          throw error; // target doesn't exist
        }
        return Promise.resolve();
      });
      mockFs.rename.mockResolvedValue();
      mockFs.mkdir.mockResolvedValue();

      // Mock project files discovery
      mockFs.readdir.mockImplementation((dir: any) => {
        if (dir.includes('node_modules')) {
          throw new Error('Access denied');
        }
        if (dir === testRoot) {
          return Promise.resolve([
            { name: 'src', isDirectory: () => true, isFile: () => false }
          ] as any);
        }
        if (dir === path.join(testRoot, 'src')) {
          return Promise.resolve([
            { name: 'App.ts', isDirectory: () => false, isFile: () => true }
          ] as any);
        }
        return Promise.resolve([]);
      });

      mockFs.readFile.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('App.ts')) {
          return Promise.resolve("import { Button } from './components/Button';\n");
        }
        return Promise.resolve("// no imports\n");
      });
      mockFs.writeFile.mockResolvedValue();

      mockImportResolver.parseImportStatements.mockReturnValue([
        {
          path: './components/Button',
          rawStatement: "import { Button } from './components/Button';",
          position: { line: 1, column: 1 }
        }
      ]);

      mockImportResolver.isNodeModuleImport.mockReturnValue(false);
      mockImportResolver.resolvePathAlias.mockImplementation((path: string) => path);
      mockImportResolver.calculateRelativePath.mockReturnValue('./ui/Button');

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(true);
      expect(result.pathUpdates.length).toBe(1);
      expect(result.pathUpdates[0].newImport).toContain('./ui/Button');
    });

    it('應該能處理不同副檔名的匹配', async () => {
      const testRoot = process.cwd();
      const operation: MoveOperation = {
        source: path.join(testRoot, 'src/Button.tsx'),
        target: path.join(testRoot, 'src/ui/Button.tsx'),
        updateImports: true
      };

      // Mock filesystem operations
      mockFs.access.mockImplementation((filePath: string) => {
        if (filePath.includes('Button.tsx') && !filePath.includes('/ui')) {
          return Promise.resolve(); // source exists
        }
        if (filePath.includes('/ui') && !filePath.includes('Button.tsx')) {
          return Promise.resolve(); // target dir exists
        }
        if (filePath.includes('Button.tsx') && filePath.includes('/ui')) {
          const error = new Error('ENOENT');
          (error as any).code = 'ENOENT';
          throw error; // target doesn't exist
        }
        return Promise.resolve();
      });
      mockFs.rename.mockResolvedValue();
      mockFs.mkdir.mockResolvedValue();

      // Mock project files discovery
      mockFs.readdir.mockImplementation((dir: any) => {
        if (dir.includes('node_modules')) {
          throw new Error('Access denied');
        }
        if (dir === testRoot) {
          return Promise.resolve([
            { name: 'src', isDirectory: () => true, isFile: () => false }
          ] as any);
        }
        if (dir === path.join(testRoot, 'src')) {
          return Promise.resolve([
            { name: 'App.ts', isDirectory: () => false, isFile: () => true }
          ] as any);
        }
        return Promise.resolve([]);
      });

      // Import without extension
      mockFs.readFile.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('App.ts')) {
          return Promise.resolve("import { Button } from './Button';\n");
        }
        return Promise.resolve("// no imports\n");
      });
      mockFs.writeFile.mockResolvedValue();

      mockImportResolver.parseImportStatements.mockReturnValue([
        {
          path: './Button',
          rawStatement: "import { Button } from './Button';",
          position: { line: 1, column: 1 }
        }
      ]);

      mockImportResolver.isNodeModuleImport.mockReturnValue(false);
      mockImportResolver.resolvePathAlias.mockImplementation((path: string) => path);
      mockImportResolver.calculateRelativePath.mockReturnValue('./ui/Button');

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(true);
      expect(result.pathUpdates.length).toBe(1);
    });

    it('應該能處理路徑別名', async () => {
      const config: ImportResolverConfig = {
        pathAliases: { '@': './src' },
        supportedExtensions: ['.ts', '.js']
      };
      
      const service = new MoveService(config, mockImportResolver as any);

      const operation: MoveOperation = {
        source: '/src/components/Button.ts',
        target: '/src/ui/Button.ts',
        updateImports: true
      };

      // Mock filesystem operations
      mockFs.access
        .mockResolvedValueOnce() // source exists
        .mockResolvedValueOnce() // target dir exists
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); // target file doesn't exist
      mockFs.rename.mockResolvedValue();
      mockFs.mkdir.mockResolvedValue();
      mockFs.readdir.mockResolvedValue([
        { name: 'App.ts', isDirectory: () => false, isFile: () => true }
      ] as any);

      mockFs.readFile.mockResolvedValue("import { Button } from '@/components/Button';\n");
      mockFs.writeFile.mockResolvedValue();

      mockImportResolver.parseImportStatements.mockReturnValue([
        {
          path: '@/components/Button',
          rawStatement: "import { Button } from '@/components/Button';",
          position: { line: 1, column: 1 }
        }
      ]);

      mockImportResolver.isNodeModuleImport.mockReturnValue(false);
      mockImportResolver.resolvePathAlias.mockReturnValue('./components/Button');
      mockImportResolver.calculateRelativePath.mockReturnValue('@/ui/Button');

      const result = await service.moveFile(operation);

      expect(result.success).toBe(true);
    });
  });

  describe('錯誤處理', () => {
    it('應該能處理檔案移動失敗', async () => {
      const operation: MoveOperation = {
        source: '/src/old.ts',
        target: '/readonly/new.ts'
      };

      // Mock source exists, target dir exists, target doesn't exist
      mockFs.access
        .mockResolvedValueOnce() // source exists
        .mockResolvedValueOnce() // target dir exists
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); // target doesn't exist

      // Mock rename failure
      mockFs.rename.mockRejectedValue(new Error('Permission denied'));

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('應該能處理 import 更新失敗', async () => {
      const testRoot = process.cwd();
      const operation: MoveOperation = {
        source: path.join(testRoot, 'src/old.ts'),
        target: path.join(testRoot, 'src/new.ts'),
        updateImports: true
      };

      // Mock filesystem operations
      mockFs.access.mockImplementation((filePath: string) => {
        if (filePath.includes('old.ts')) {
          return Promise.resolve(); // source exists
        }
        if (filePath.includes('/src') && !filePath.includes('new.ts')) {
          return Promise.resolve(); // target dir exists
        }
        if (filePath.includes('new.ts')) {
          const error = new Error('ENOENT');
          (error as any).code = 'ENOENT';
          throw error; // target doesn't exist
        }
        return Promise.resolve();
      });
      mockFs.rename.mockResolvedValue();
      mockFs.mkdir.mockResolvedValue();

      // Mock project files discovery
      mockFs.readdir.mockImplementation((dir: any) => {
        if (dir.includes('node_modules')) {
          throw new Error('Access denied');
        }
        if (dir === testRoot) {
          return Promise.resolve([
            { name: 'src', isDirectory: () => true, isFile: () => false }
          ] as any);
        }
        if (dir === path.join(testRoot, 'src')) {
          return Promise.resolve([
            { name: 'test.ts', isDirectory: () => false, isFile: () => true }
          ] as any);
        }
        return Promise.resolve([]);
      });

      mockFs.readFile.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('test.ts')) {
          return Promise.resolve("import { Test } from './old';\n");
        }
        return Promise.resolve("// no imports\n");
      });

      // Mock write failure
      mockFs.writeFile.mockRejectedValue(new Error('Write permission denied'));

      mockImportResolver.parseImportStatements.mockImplementation((content: string, filePath: string) => {
        if (filePath.includes('test.ts')) {
          return [
            {
              path: './old',
              rawStatement: "import { Test } from './old';",
              position: { line: 1, column: 1 }
            }
          ];
        }
        return [];
      });

      mockImportResolver.isNodeModuleImport.mockImplementation((importPath: string) => {
        return false; // All imports are local for this test
      });
      mockImportResolver.resolvePathAlias.mockImplementation((path: string) => path);
      mockImportResolver.calculateRelativePath.mockReturnValue('./new');

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('更新檔案');
    });

    it('應該能處理目錄無法存取的情況', async () => {
      const operation: MoveOperation = {
        source: '/src/old.ts',
        target: '/src/new.ts',
        updateImports: true
      };

      // Mock filesystem operations
      mockFs.access
        .mockResolvedValueOnce() // source exists
        .mockResolvedValueOnce() // target dir exists
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); // target file doesn't exist
      mockFs.rename.mockResolvedValue();
      mockFs.mkdir.mockResolvedValue();
      
      // Mock readdir failure for some directories
      mockFs.readdir.mockImplementation((dir: any) => {
        if (dir.includes('restricted')) {
          throw new Error('Access denied');
        }
        return Promise.resolve([]);
      });

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(true); // 應該能處理部分目錄存取失敗
    });
  });

  describe('大型專案處理', () => {
    it('應該能處理大量檔案的專案', async () => {
      const operation: MoveOperation = {
        source: '/src/old.ts',
        target: '/src/new.ts',
        updateImports: true
      };

      // Mock filesystem operations
      mockFs.access
        .mockResolvedValueOnce() // source exists
        .mockResolvedValueOnce() // target dir exists
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); // target file doesn't exist
      mockFs.rename.mockResolvedValue();
      mockFs.mkdir.mockResolvedValue();

      // Mock large number of files
      const files = Array.from({ length: 100 }, (_, i) => ({
        name: `file${i}.ts`,
        isDirectory: () => false,
        isFile: () => true
      }));
      
      mockFs.readdir.mockResolvedValue(files as any);
      mockFs.readFile.mockResolvedValue("// No imports\n");

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(true);
    });

    it('應該能正確處理多層級目錄結構', async () => {
      const operation: MoveOperation = {
        source: '/src/components/ui/Button.ts',
        target: '/src/components/common/Button.ts',
        updateImports: true
      };

      // Mock filesystem operations
      mockFs.access
        .mockResolvedValueOnce() // source exists
        .mockResolvedValueOnce() // target dir exists
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); // target file doesn't exist
      mockFs.rename.mockResolvedValue();
      mockFs.mkdir.mockResolvedValue();

      // Mock nested directory structure
      let readDirCallCount = 0;
      mockFs.readdir.mockImplementation((dir: any) => {
        readDirCallCount++;
        if (readDirCallCount === 1) {
          return Promise.resolve([
            { name: 'components', isDirectory: () => true, isFile: () => false }
          ] as any);
        } else if (readDirCallCount === 2) {
          return Promise.resolve([
            { name: 'ui', isDirectory: () => true, isFile: () => false },
            { name: 'common', isDirectory: () => true, isFile: () => false }
          ] as any);
        } else {
          return Promise.resolve([
            { name: 'Test.ts', isDirectory: () => false, isFile: () => true }
          ] as any);
        }
      });

      mockFs.readFile.mockResolvedValue("// No imports\n");

      const result = await moveService.moveFile(operation);

      expect(result.success).toBe(true);
    });
  });

  describe('效能測試', () => {
    it('應該在合理時間內完成移動操作', async () => {
      const operation: MoveOperation = {
        source: '/src/old.ts',
        target: '/src/new.ts',
        updateImports: false
      };

      // Mock quick filesystem operations
      mockFs.access
        .mockResolvedValueOnce() // source exists
        .mockResolvedValueOnce() // target dir exists
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); // target file doesn't exist
      mockFs.rename.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 10))
      );
      mockFs.mkdir.mockResolvedValue();

      const startTime = Date.now();
      const result = await moveService.moveFile(operation);
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(1000); // 應該在 1 秒內完成
    });
  });
});