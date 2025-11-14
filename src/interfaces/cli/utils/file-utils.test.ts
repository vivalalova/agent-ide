/**
 * file-utils 單元測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fileExists, getAllProjectFiles, loadPathAliases } from './file-utils.js';

describe('file-utils', () => {
  let tempDir: string;

  beforeEach(async () => {
    // 創建臨時測試目錄
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-utils-test-'));
  });

  afterEach(async () => {
    // 清理臨時目錄
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('fileExists', () => {
    it('應該對存在的檔案返回 true', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');

      const exists = await fileExists(testFile);
      expect(exists).toBe(true);
    });

    it('應該對不存在的檔案返回 false', async () => {
      const nonExistentFile = path.join(tempDir, 'non-existent.txt');

      const exists = await fileExists(nonExistentFile);
      expect(exists).toBe(false);
    });

    it('應該對目錄返回 true', async () => {
      const exists = await fileExists(tempDir);
      expect(exists).toBe(true);
    });
  });

  describe('getAllProjectFiles', () => {
    it('應該返回所有支援的檔案類型', async () => {
      // 創建測試檔案
      await fs.writeFile(path.join(tempDir, 'file1.ts'), 'content');
      await fs.writeFile(path.join(tempDir, 'file2.js'), 'content');
      await fs.writeFile(path.join(tempDir, 'file3.txt'), 'content'); // 不支援的類型

      const files = await getAllProjectFiles(tempDir);

      expect(files).toHaveLength(2);
      expect(files.some(f => f.endsWith('file1.ts'))).toBe(true);
      expect(files.some(f => f.endsWith('file2.js'))).toBe(true);
      expect(files.some(f => f.endsWith('file3.txt'))).toBe(false);
    });

    it('應該遞歸掃描子目錄', async () => {
      // 創建嵌套目錄結構
      const subDir = path.join(tempDir, 'sub');
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(tempDir, 'root.ts'), 'content');
      await fs.writeFile(path.join(subDir, 'nested.ts'), 'content');

      const files = await getAllProjectFiles(tempDir);

      expect(files).toHaveLength(2);
      expect(files.some(f => f.endsWith('root.ts'))).toBe(true);
      expect(files.some(f => f.endsWith('nested.ts'))).toBe(true);
    });

    it('應該排除 node_modules 目錄', async () => {
      // 創建 node_modules
      const nodeModulesDir = path.join(tempDir, 'node_modules');
      await fs.mkdir(nodeModulesDir);
      await fs.writeFile(path.join(tempDir, 'app.ts'), 'content');
      await fs.writeFile(path.join(nodeModulesDir, 'lib.ts'), 'content');

      const files = await getAllProjectFiles(tempDir);

      expect(files).toHaveLength(1);
      expect(files[0]).toContain('app.ts');
      expect(files.some(f => f.includes('node_modules'))).toBe(false);
    });

    it('應該處理單一檔案路徑', async () => {
      const testFile = path.join(tempDir, 'single.ts');
      await fs.writeFile(testFile, 'content');

      const files = await getAllProjectFiles(testFile);

      expect(files).toEqual([testFile]);
    });

    it('應該對不存在的路徑返回空陣列', async () => {
      const nonExistent = path.join(tempDir, 'non-existent');

      const files = await getAllProjectFiles(nonExistent);

      expect(files).toEqual([]);
    });
  });

  describe('loadPathAliases', () => {
    it('應該解析 tsconfig.json 的路徑別名', async () => {
      const tsconfig = {
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*'],
            '@utils/*': ['src/utils/*']
          }
        }
      };

      await fs.writeFile(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify(tsconfig, null, 2)
      );

      const aliases = await loadPathAliases(tempDir);

      expect(aliases['@']).toBeDefined();
      expect(aliases['@utils']).toBeDefined();
      expect(aliases['@']).toContain('src');
      expect(aliases['@utils']).toContain('src/utils');
    });

    it('應該對沒有 paths 的 tsconfig 返回空物件', async () => {
      const tsconfig = {
        compilerOptions: {
          target: 'ES2020'
        }
      };

      await fs.writeFile(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify(tsconfig, null, 2)
      );

      const aliases = await loadPathAliases(tempDir);

      expect(aliases).toEqual({});
    });

    it('應該對不存在的 tsconfig.json 返回空物件', async () => {
      const aliases = await loadPathAliases(tempDir);

      expect(aliases).toEqual({});
    });

    it('應該處理無效的 JSON', async () => {
      await fs.writeFile(
        path.join(tempDir, 'tsconfig.json'),
        'invalid json {'
      );

      const aliases = await loadPathAliases(tempDir);

      expect(aliases).toEqual({});
    });
  });
});
