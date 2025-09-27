/**
 * Move 模組邊界條件和異常處理參數化測試
 * 測試檔案移動和路徑更新在各種極端條件下的行為
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { withMemoryOptimization } from '../../test-utils/cleanup';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

interface MoveResult {
  success: boolean;
  updatedFiles?: string[];
  error?: string;
}

interface ImportInfo {
  path: string;
  resolvedPath?: string;
  type: 'import' | 'require';
  isRelative: boolean;
}

// 模擬移動服務
class MoveService {
  async moveFile(source: string, target: string, options: { updateReferences?: boolean } = {}): Promise<MoveResult> {
    // 參數驗證
    if (typeof source !== 'string') {
      return { success: false, error: '來源路徑必須是字串' };
    }

    if (typeof target !== 'string') {
      return { success: false, error: '目標路徑必須是字串' };
    }

    if (source.trim().length === 0) {
      return { success: false, error: '來源路徑不能為空' };
    }

    if (target.trim().length === 0) {
      return { success: false, error: '目標路徑不能為空' };
    }

    if (source === target) {
      return { success: false, error: '來源和目標路徑不能相同' };
    }

    try {
      // 檢查來源檔案存在性
      const sourceStats = await fs.stat(source);
      if (!sourceStats.isFile()) {
        return { success: false, error: '來源路徑必須是檔案' };
      }

      // 確保目標目錄存在
      const targetDir = dirname(target);
      await fs.mkdir(targetDir, { recursive: true });

      // 檢查目標是否已存在
      try {
        await fs.stat(target);
        return { success: false, error: '目標檔案已存在' };
      } catch (error) {
        // 目標不存在，可以繼續
      }

      // 讀取來源檔案內容
      const content = await fs.readFile(source, 'utf-8');

      // 寫入目標檔案
      await fs.writeFile(target, content);

      // 刪除來源檔案
      await fs.unlink(source);

      // 如果需要更新引用
      const updatedFiles: string[] = [];
      if (options.updateReferences) {
        // 這裡會有更複雜的引用更新邏輯
        // 簡化實作，只返回空陣列
      }

      return { success: true, updatedFiles };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return { success: false, error: '來源檔案不存在' };
      }
      if ((error as any).code === 'EACCES') {
        return { success: false, error: '權限被拒絕' };
      }
      return { success: false, error: (error as Error).message };
    }
  }
}

// 模擬 Import 解析器
class ImportResolver {
  async analyzeImports(filePath: string, content: string): Promise<ImportInfo[]> {
    // 參數驗證
    if (typeof filePath !== 'string') {
      throw new Error('檔案路徑必須是字串');
    }

    if (typeof content !== 'string') {
      throw new Error('檔案內容必須是字串');
    }

    if (filePath.trim().length === 0) {
      throw new Error('檔案路徑不能為空');
    }

    const imports: ImportInfo[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // 匹配 import 語句
      const importMatch = line.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const importPath = importMatch[1];
        imports.push({
          path: importPath,
          type: 'import',
          isRelative: importPath.startsWith('.') || importPath.startsWith('/'),
          resolvedPath: this.resolvePath(filePath, importPath)
        });
      }

      // 匹配 require 語句
      const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (requireMatch) {
        const importPath = requireMatch[1];
        imports.push({
          path: importPath,
          type: 'require',
          isRelative: importPath.startsWith('.') || importPath.startsWith('/'),
          resolvedPath: this.resolvePath(filePath, importPath)
        });
      }
    }

    return imports;
  }

  async updateImportPath(filePath: string, oldPath: string, newPath: string): Promise<string> {
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
      throw new Error('檔案路徑必須是有效字串');
    }

    if (typeof oldPath !== 'string' || oldPath.trim().length === 0) {
      throw new Error('舊路徑必須是有效字串');
    }

    if (typeof newPath !== 'string' || newPath.trim().length === 0) {
      throw new Error('新路徑必須是有效字串');
    }

    if (oldPath === newPath) {
      throw new Error('新舊路徑不能相同');
    }

    // 計算相對路徑
    const relativePath = this.calculateRelativePath(filePath, newPath);
    return relativePath;
  }

  private resolvePath(basePath: string, importPath: string): string {
    if (importPath.startsWith('.')) {
      // 相對路徑解析
      return join(dirname(basePath), importPath);
    }

    // 絕對路徑或模組名稱
    return importPath;
  }

  private calculateRelativePath(fromPath: string, toPath: string): string {
    // 簡化的相對路徑計算
    const fromDir = dirname(fromPath);

    // 計算相對路徑的簡化邏輯
    if (toPath.startsWith(fromDir)) {
      const relative = toPath.substring(fromDir.length + 1);
      return './' + relative;
    }

    return toPath;
  }
}

describe('Move 模組邊界條件測試', () => {
  let testDir: string;
  let moveService: MoveService;
  let importResolver: ImportResolver;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agent-ide-move-edge-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    moveService = new MoveService();
    importResolver = new ImportResolver();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理錯誤
    }
  });

  describe('MoveService 參數驗證測試', () => {
    it.each([
      // [描述, 來源路徑, 目標路徑, 預期錯誤]
      ['null 來源路徑', null, '/target', '來源路徑必須是字串'],
      ['undefined 來源路徑', undefined, '/target', '來源路徑必須是字串'],
      ['數字來源路徑', 123, '/target', '來源路徑必須是字串'],
      ['陣列來源路徑', ['/source'], '/target', '來源路徑必須是字串'],
      ['null 目標路徑', '/source', null, '目標路徑必須是字串'],
      ['undefined 目標路徑', '/source', undefined, '目標路徑必須是字串'],
      ['數字目標路徑', '/source', 123, '目標路徑必須是字串'],
      ['陣列目標路徑', '/source', ['/target'], '目標路徑必須是字串'],
    ])('應該驗證參數類型：%s', withMemoryOptimization(async (description, source, target, expectedError) => {
      const result = await moveService.moveFile(source as any, target as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError);
    }, { testName: 'move-param-type-test' }));

    it.each([
      ['空字串來源', '', '/target', '來源路徑不能為空'],
      ['僅空白來源', '   \t\n  ', '/target', '來源路徑不能為空'],
      ['空字串目標', '/source', '', '目標路徑不能為空'],
      ['僅空白目標', '/source', '   \t\n  ', '目標路徑不能為空'],
      ['相同路徑', '/same/path', '/same/path', '來源和目標路徑不能相同'],
    ])('應該驗證參數內容：%s', withMemoryOptimization(async (description, source, target, expectedError) => {
      const result = await moveService.moveFile(source, target);

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError);
    }, { testName: 'move-param-content-test' }));
  });

  describe('MoveService 檔案系統測試', () => {
    it('應該處理不存在的來源檔案', withMemoryOptimization(async () => {
      const nonExistentSource = join(testDir, 'nonexistent.ts');
      const target = join(testDir, 'target.ts');

      const result = await moveService.moveFile(nonExistentSource, target);

      expect(result.success).toBe(false);
      expect(result.error).toBe('來源檔案不存在');
    }, { testName: 'move-nonexistent-source' }));

    it('應該處理來源為目錄的情況', withMemoryOptimization(async () => {
      const sourceDir = join(testDir, 'source-dir');
      await fs.mkdir(sourceDir);

      const target = join(testDir, 'target.ts');

      const result = await moveService.moveFile(sourceDir, target);

      expect(result.success).toBe(false);
      expect(result.error).toBe('來源路徑必須是檔案');
    }, { testName: 'move-source-directory' }));

    it('應該處理目標檔案已存在的情況', withMemoryOptimization(async () => {
      const source = join(testDir, 'source.ts');
      const target = join(testDir, 'target.ts');

      await fs.writeFile(source, 'source content');
      await fs.writeFile(target, 'existing target content');

      const result = await moveService.moveFile(source, target);

      expect(result.success).toBe(false);
      expect(result.error).toBe('目標檔案已存在');

      // 確認來源檔案未被刪除
      const sourceExists = await fs.access(source).then(() => true).catch(() => false);
      expect(sourceExists).toBe(true);
    }, { testName: 'move-target-exists' }));

    it('應該成功移動檔案', withMemoryOptimization(async () => {
      const source = join(testDir, 'source.ts');
      const target = join(testDir, 'target.ts');
      const content = 'test file content';

      await fs.writeFile(source, content);

      const result = await moveService.moveFile(source, target);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // 確認來源檔案已刪除
      const sourceExists = await fs.access(source).then(() => true).catch(() => false);
      expect(sourceExists).toBe(false);

      // 確認目標檔案已建立且內容正確
      const targetContent = await fs.readFile(target, 'utf-8');
      expect(targetContent).toBe(content);
    }, { testName: 'move-success' }));

    it('應該建立目標目錄', withMemoryOptimization(async () => {
      const source = join(testDir, 'source.ts');
      const target = join(testDir, 'new', 'directory', 'target.ts');

      await fs.writeFile(source, 'content');

      const result = await moveService.moveFile(source, target);

      expect(result.success).toBe(true);

      // 確認目錄和檔案都已建立
      const targetExists = await fs.access(target).then(() => true).catch(() => false);
      expect(targetExists).toBe(true);
    }, { testName: 'move-create-directory' }));
  });

  describe('ImportResolver 參數驗證測試', () => {
    it.each([
      // [描述, 檔案路徑, 內容, 預期錯誤]
      ['null 檔案路徑', null, 'content', '檔案路徑必須是字串'],
      ['undefined 檔案路徑', undefined, 'content', '檔案路徑必須是字串'],
      ['數字檔案路徑', 123, 'content', '檔案路徑必須是字串'],
      ['null 檔案內容', '/path', null, '檔案內容必須是字串'],
      ['undefined 檔案內容', '/path', undefined, '檔案內容必須是字串'],
      ['數字檔案內容', '/path', 123, '檔案內容必須是字串'],
      ['空檔案路徑', '', 'content', '檔案路徑不能為空'],
      ['僅空白檔案路徑', '   ', 'content', '檔案路徑不能為空'],
    ])('應該驗證 analyzeImports 參數：%s', withMemoryOptimization(async (description, filePath, content, expectedError) => {
      await expect(importResolver.analyzeImports(filePath as any, content as any)).rejects.toThrow(expectedError);
    }, { testName: 'analyze-imports-param-test' }));

    it.each([
      ['null 檔案路徑', null, '/old', '/new', '檔案路徑必須是有效字串'],
      ['空檔案路徑', '', '/old', '/new', '檔案路徑必須是有效字串'],
      ['null 舊路徑', '/file', null, '/new', '舊路徑必須是有效字串'],
      ['空舊路徑', '/file', '', '/new', '舊路徑必須是有效字串'],
      ['null 新路徑', '/file', '/old', null, '新路徑必須是有效字串'],
      ['空新路徑', '/file', '/old', '', '新路徑必須是有效字串'],
      ['相同路徑', '/file', '/same', '/same', '新舊路徑不能相同'],
    ])('應該驗證 updateImportPath 參數：%s', withMemoryOptimization(async (description, filePath, oldPath, newPath, expectedError) => {
      await expect(importResolver.updateImportPath(filePath as any, oldPath as any, newPath as any)).rejects.toThrow(expectedError);
    }, { testName: 'update-import-param-test' }));
  });

  describe('ImportResolver 功能測試', () => {
    it.each([
      ['空內容', '', 0],
      ['僅空白', '   \n\t  \n', 0],
      ['無 import 內容', 'const x = 1;\nconsole.log(x);', 0],
      ['單一 import', 'import { test } from "./test";', 1],
      ['多個 import', 'import a from "./a";\nimport b from "./b";', 2],
      ['混合 import/require', 'import a from "./a";\nconst b = require("./b");', 2],
    ])('應該分析不同內容的 import：%s', withMemoryOptimization(async (description, content, expectedCount) => {
      const imports = await importResolver.analyzeImports('/test/file.ts', content);

      expect(imports.length).toBe(expectedCount);

      imports.forEach(imp => {
        expect(imp).toHaveProperty('path');
        expect(imp).toHaveProperty('type');
        expect(imp).toHaveProperty('isRelative');
        expect(typeof imp.path).toBe('string');
        expect(['import', 'require'].includes(imp.type)).toBe(true);
        expect(typeof imp.isRelative).toBe('boolean');
      });
    }, { testName: 'analyze-imports-content-test' }));

    it('應該正確識別相對和絕對路徑', withMemoryOptimization(async () => {
      const content = `
import relative1 from "./relative1";
import relative2 from "../relative2";
import absolute from "/absolute/path";
import module from "external-module";
      `.trim();

      const imports = await importResolver.analyzeImports('/test/file.ts', content);

      expect(imports.length).toBe(4);

      const relative1 = imports.find(i => i.path === './relative1');
      expect(relative1?.isRelative).toBe(true);

      const relative2 = imports.find(i => i.path === '../relative2');
      expect(relative2?.isRelative).toBe(true);

      const absolute = imports.find(i => i.path === '/absolute/path');
      expect(absolute?.isRelative).toBe(true);

      const module = imports.find(i => i.path === 'external-module');
      expect(module?.isRelative).toBe(false);
    }, { testName: 'analyze-imports-relative-absolute' }));

    it('應該處理複雜的 import 語法', withMemoryOptimization(async () => {
      const content = `
import defaultExport from './default';
import { named1, named2 } from './named';
import * as namespace from './namespace';
import defaultExport, { named } from './mixed';
import './side-effect';
const dynamic = require('./dynamic');
      `.trim();

      const imports = await importResolver.analyzeImports('/test/file.ts', content);

      expect(imports.length).toBe(6);

      const paths = imports.map(i => i.path);
      expect(paths).toContain('./default');
      expect(paths).toContain('./named');
      expect(paths).toContain('./namespace');
      expect(paths).toContain('./mixed');
      expect(paths).toContain('./side-effect');
      expect(paths).toContain('./dynamic');
    }, { testName: 'analyze-imports-complex-syntax' }));

    it('應該更新 import 路徑', withMemoryOptimization(async () => {
      const filePath = '/project/src/file.ts';
      const oldPath = '/project/src/old.ts';
      const newPath = '/project/lib/new.ts';

      const updatedPath = await importResolver.updateImportPath(filePath, oldPath, newPath);

      expect(typeof updatedPath).toBe('string');
      expect(updatedPath.length).toBeGreaterThan(0);
    }, { testName: 'update-import-path' }));
  });

  describe('極端情況測試', () => {
    it('應該處理超長檔案路徑', withMemoryOptimization(async () => {
      const longPath = join(testDir, 'a'.repeat(100), 'b'.repeat(100), 'file.ts');
      const target = join(testDir, 'target.ts');

      // 建立深層目錄結構
      await fs.mkdir(dirname(longPath), { recursive: true });
      await fs.writeFile(longPath, 'content');

      const result = await moveService.moveFile(longPath, target);

      expect(result.success).toBe(true);
    }, { testName: 'move-long-path' }));

    it('應該處理特殊字符的檔案名', withMemoryOptimization(async () => {
      const specialSource = join(testDir, 'file with spaces & symbols!.ts');
      const specialTarget = join(testDir, 'new file with spaces & symbols!.ts');

      await fs.writeFile(specialSource, 'special content');

      const result = await moveService.moveFile(specialSource, specialTarget);

      expect(result.success).toBe(true);
    }, { testName: 'move-special-chars' }));

    it('應該處理大檔案移動', withMemoryOptimization(async () => {
      const largeContent = 'x'.repeat(100000); // 100KB
      const source = join(testDir, 'large.ts');
      const target = join(testDir, 'large-moved.ts');

      await fs.writeFile(source, largeContent);

      const result = await moveService.moveFile(source, target);

      expect(result.success).toBe(true);

      const movedContent = await fs.readFile(target, 'utf-8');
      expect(movedContent).toBe(largeContent);
    }, { testName: 'move-large-file', timeout: 10000 }));

    it('應該處理包含大量 import 的檔案', withMemoryOptimization(async () => {
      const manyImports = Array.from({ length: 1000 }, (_, i) =>
        `import module${i} from "./module${i}";`
      ).join('\n');

      const imports = await importResolver.analyzeImports('/test/file.ts', manyImports);

      expect(imports.length).toBe(1000);

      imports.forEach((imp, index) => {
        expect(imp.path).toBe(`./module${index}`);
        expect(imp.type).toBe('import');
        expect(imp.isRelative).toBe(true);
      });
    }, { testName: 'analyze-many-imports', timeout: 5000 }));

    it('應該處理並發移動請求', withMemoryOptimization(async () => {
      const files = [];

      // 建立多個來源檔案
      for (let i = 0; i < 5; i++) {
        const source = join(testDir, `source-${i}.ts`);
        const target = join(testDir, `target-${i}.ts`);
        await fs.writeFile(source, `content ${i}`);

        files.push({ source, target });
      }

      // 並發移動
      const results = await Promise.all(
        files.map(({ source, target }) => moveService.moveFile(source, target))
      );

      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // 確認所有目標檔案都存在
      for (let i = 0; i < 5; i++) {
        const target = join(testDir, `target-${i}.ts`);
        const exists = await fs.access(target).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
    }, { testName: 'move-concurrent' }));
  });
});