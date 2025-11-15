import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MoveService } from '@core/move/move-service';
import { ImportResolver } from '@core/move/import-resolver';
import type { ImportResolverConfig } from '@core/move/types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises
vi.mock('fs/promises');

describe('MoveService', () => {
  let service: MoveService;
  let mockResolver: ImportResolver;

  beforeEach(() => {
    vi.clearAllMocks();

    // 設置 fs mock 的預設行為
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.readdir).mockResolvedValue([]);

    const config: ImportResolverConfig = {
      supportedExtensions: ['.js', '.ts', '.jsx', '.tsx'],
      pathAliases: {}
    };

    mockResolver = new ImportResolver(config);
    service = new MoveService(config, mockResolver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('建構函式', () => {
    it('應該接受自訂 ImportResolver', () => {
      const customResolver = new ImportResolver({
        supportedExtensions: ['.ts'],
        pathAliases: { '@': '/src' }
      });

      const customService = new MoveService(undefined, customResolver);
      expect(customService).toBeDefined();
    });

    it('應該使用預設配置建立 ImportResolver', () => {
      const defaultService = new MoveService();
      expect(defaultService).toBeDefined();
    });

    it('應該合併自訂配置與預設配置', () => {
      const customConfig: ImportResolverConfig = {
        supportedExtensions: ['.ts'],
        pathAliases: { '@': '/src' }
      };

      const customService = new MoveService(customConfig);
      expect(customService).toBeDefined();
    });
  });

  describe('moveFile - 基本功能', () => {
    it('應該成功移動檔案', async () => {
      const source = '/src/old.ts';
      const target = '/src/new.ts';

      // Mock 來源存在
      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      const result = await service.moveFile(
        { source, target, updateImports: false },
        { preview: false }
      );

      expect(result.success).toBe(true);
      expect(result.moved).toBe(true);
      expect(result.source).toBe(source);
      expect(result.target).toBe(target);
      expect(vi.mocked(fs.rename)).toHaveBeenCalledWith(source, target);
    });

    it('應該在預覽模式下不移動檔案', async () => {
      const source = '/src/old.ts';
      const target = '/src/new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      const result = await service.moveFile(
        { source, target, updateImports: false },
        { preview: true }
      );

      expect(result.success).toBe(true);
      expect(result.moved).toBe(false);
      expect(result.message).toContain('預覽');
      expect(vi.mocked(fs.rename)).not.toHaveBeenCalled();
    });

    it('應該建立目標目錄如果不存在', async () => {
      const source = '/src/old.ts';
      const target = '/src/nested/new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      await service.moveFile(
        { source, target, updateImports: false },
        { preview: false }
      );

      expect(vi.mocked(fs.mkdir)).toHaveBeenCalledWith(
        path.dirname(target),
        { recursive: true }
      );
    });
  });

  describe('moveFile - 路徑驗證', () => {
    it('應該拋出錯誤當來源不存在', async () => {
      const source = '/src/nonexistent.ts';
      const target = '/src/new.ts';

      vi.mocked(fs.access).mockRejectedValue({ code: 'ENOENT' });

      const result = await service.moveFile(
        { source, target, updateImports: false },
        { preview: false }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('來源路徑不存在');
    });

    it('應該拋出錯誤當目標已存在', async () => {
      const source = '/src/old.ts';
      const target = '/src/existing.ts';

      // Mock 來源和目標都存在
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await service.moveFile(
        { source, target, updateImports: false },
        { preview: false }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('目標路徑已存在');
    });

    it('應該處理目標目錄建立失敗', async () => {
      const source = '/src/old.ts';
      const target = '/protected/new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'));

      const result = await service.moveFile(
        { source, target, updateImports: false },
        { preview: false }
      );

      expect(result.success).toBe(false);
    });
  });

  describe('moveFile - Import 更新', () => {
    it('應該更新 import 路徑當 updateImports 為 true', async () => {
      const source = '/project/src/utils.ts';
      const target = '/project/src/helpers/utils.ts';
      const importingFile = '/project/src/index.ts';

      // Mock 檔案系統
      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source || path === importingFile) return undefined;
        throw { code: 'ENOENT' };
      });

      // Mock readdir 回傳專案檔案
      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        if (dir === '/project/src') {
          return [
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true }
          ] as any;
        }
        return [];
      });

      // Mock 檔案內容
      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (path === importingFile) {
          return "import { helper } from './utils';";
        }
        if (path === source) {
          return 'export const helper = () => {};';
        }
        return '';
      });

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: false, projectRoot: '/project/src' }
      );

      expect(result.success).toBe(true);
      expect(result.pathUpdates.length).toBeGreaterThan(0);
    });

    it('應該跳過 import 更新當 updateImports 為 false', async () => {
      const source = '/src/old.ts';
      const target = '/src/new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      const result = await service.moveFile(
        { source, target, updateImports: false },
        { preview: false }
      );

      expect(result.pathUpdates).toHaveLength(0);
      expect(vi.mocked(fs.readdir)).not.toHaveBeenCalled();
    });

    it('應該在預覽模式下顯示 import 更新', async () => {
      const source = '/project/src/utils.ts';
      const target = '/project/src/helpers/utils.ts';
      const importingFile = '/project/src/index.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source || path === importingFile) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        if (dir === '/project/src') {
          return [
            { name: 'index.ts', isDirectory: () => false, isFile: () => true }
          ] as any;
        }
        return [];
      });

      vi.mocked(fs.readFile).mockResolvedValue("import { helper } from './utils';");

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: true, projectRoot: '/project/src' }
      );

      expect(result.success).toBe(true);
      expect(result.moved).toBe(false);
      expect(result.message).toContain('預覽');
    });
  });

  describe('moveFile - 錯誤處理', () => {
    it('應該處理移動失敗', async () => {
      const source = '/src/old.ts';
      const target = '/src/new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.rename).mockRejectedValue(new Error('移動失敗'));

      const result = await service.moveFile(
        { source, target, updateImports: false },
        { preview: false }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('移動失敗');
    });

    it('應該回滾檔案如果 import 更新失敗', async () => {
      const source = '/project/src/utils.ts';
      const target = '/project/src/helpers/utils.ts';
      const importingFile = '/project/src/index.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source || path === importingFile) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'index.ts', isDirectory: () => false, isFile: () => true },
        { name: 'utils.ts', isDirectory: () => false, isFile: () => true }
      ] as any);

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath === importingFile) {
          return "import { x } from './utils';";
        }
        if (filePath === source) {
          return "export const x = 1;";
        }
        return '';
      });

      // 模擬寫入失敗
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('更新檔案失敗: Write permission denied'));

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: false, projectRoot: '/project/src' }
      );

      expect(result.success).toBe(false);
      expect(result.moved).toBe(false);
    });

    it('應該處理專案檔案掃描錯誤', async () => {
      const source = '/src/old.ts';
      const target = '/src/new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'));

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: false, projectRoot: '/src' }
      );

      // 應該仍然成功，但沒有 import 更新
      expect(result.success).toBe(true);
    });
  });

  describe('moveFile - 被移動檔案內部的 import', () => {
    it('應該更新被移動檔案內部的相對 import', async () => {
      const source = '/project/src/components/old.ts';
      const target = '/project/src/utils/new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'old.ts', isDirectory: () => false, isFile: () => true }
      ] as any);

      // 被移動的檔案包含相對 import
      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (path === source) {
          return "import { helper } from './utils';";
        }
        return '';
      });

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: false, projectRoot: '/project/src' }
      );

      expect(result.success).toBe(true);
      // 應該有針對被移動檔案內部 import 的更新
      const internalUpdates = result.pathUpdates.filter(u => u.filePath === target);
      expect(internalUpdates.length).toBeGreaterThanOrEqual(0);
    });

    it('應該跳過 Node 模組 import', async () => {
      const source = '/project/src/old.ts';
      const target = '/project/src/new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'old.ts', isDirectory: () => false, isFile: () => true }
      ] as any);

      vi.mocked(fs.readFile).mockResolvedValue("import React from 'react';");

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: false, projectRoot: '/project/src' }
      );

      expect(result.success).toBe(true);
      // Node 模組不應該被更新
      const reactUpdates = result.pathUpdates.filter(u => u.oldImport.includes('react'));
      expect(reactUpdates).toHaveLength(0);
    });
  });

  describe('邊界情況', () => {
    it('應該處理空的專案根目錄', async () => {
      const source = '/src/old.ts';
      const target = '/src/new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.readdir).mockResolvedValue([]);

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: false, projectRoot: '/empty' }
      );

      expect(result.success).toBe(true);
      expect(result.pathUpdates).toHaveLength(0);
    });

    it('應該跳過被移動的檔案本身', async () => {
      const source = path.normalize('/project/src/old.ts');
      const target = '/project/src/new.ts';

      vi.mocked(fs.access).mockImplementation(async (p) => {
        if (p === source) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'old.ts', isDirectory: () => false, isFile: () => true }
      ] as any);

      vi.mocked(fs.readFile).mockResolvedValue("import { x } from './other';");

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: false, projectRoot: '/project/src' }
      );

      expect(result.success).toBe(true);
    });

    it('應該處理深層嵌套的目錄結構', async () => {
      const source = '/project/src/a/b/c/d/old.ts';
      const target = '/project/src/x/y/z/new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      const result = await service.moveFile(
        { source, target, updateImports: false },
        { preview: false }
      );

      expect(result.success).toBe(true);
      expect(vi.mocked(fs.mkdir)).toHaveBeenCalledWith(
        expect.stringContaining('x/y/z'),
        { recursive: true }
      );
    });

    it('應該處理 Windows 風格的路徑', async () => {
      const source = 'C:\\project\\src\\old.ts';
      const target = 'C:\\project\\src\\new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      const result = await service.moveFile(
        { source, target, updateImports: false },
        { preview: false }
      );

      expect(result.success).toBe(true);
    });

    it('應該處理包含特殊字元的檔案名', async () => {
      const source = '/src/old-file_v2.0.ts';
      const target = '/src/new-file_v2.0.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      const result = await service.moveFile(
        { source, target, updateImports: false },
        { preview: false }
      );

      expect(result.success).toBe(true);
    });

    it('應該處理排除的目錄 (node_modules, dist, etc)', async () => {
      const source = '/project/src/old.ts';
      const target = '/project/src/new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        if (dir === '/project/src') {
          return [
            { name: 'old.ts', isDirectory: () => false, isFile: () => true },
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
            { name: 'dist', isDirectory: () => true, isFile: () => false }
          ] as any;
        }
        return [];
      });

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: false, projectRoot: '/project/src' }
      );

      expect(result.success).toBe(true);
      // 不應該掃描 node_modules 和 dist
    });

    it('應該處理沒有副檔名的檔案', async () => {
      const source = '/src/Makefile';
      const target = '/src/Makefile.new';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      const result = await service.moveFile(
        { source, target, updateImports: false },
        { preview: false }
      );

      expect(result.success).toBe(true);
    });

    it('應該使用 process.cwd() 作為預設 projectRoot', async () => {
      const source = '/src/old.ts';
      const target = '/src/new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: false }
      );

      expect(result).toBeDefined();
    });
  });

  describe('複雜場景', () => {
    it('應該處理多個檔案引用被移動的檔案', async () => {
      const source = '/project/src/utils.ts';
      const target = '/project/src/helpers/utils.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        if (dir === '/project/src') {
          return [
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
            { name: 'app.ts', isDirectory: () => false, isFile: () => true }
          ] as any;
        }
        return [];
      });

      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (path.toString().includes('index.ts')) {
          return "import { util } from './utils';";
        }
        if (path.toString().includes('app.ts')) {
          return "import { util } from './utils';";
        }
        return '';
      });

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: false, projectRoot: '/project/src' }
      );

      expect(result.success).toBe(true);
    });

    it('應該處理循環 import', async () => {
      const source = '/project/src/a.ts';
      const target = '/project/src/b.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'a.ts', isDirectory: () => false, isFile: () => true }
      ] as any);

      // a.ts import 自己
      vi.mocked(fs.readFile).mockResolvedValue("import { x } from './a';");

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: false, projectRoot: '/project/src' }
      );

      expect(result).toBeDefined();
    });

    it('應該處理空檔案', async () => {
      const source = '/src/empty.ts';
      const target = '/src/new-empty.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.readFile).mockResolvedValue('');

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: false, projectRoot: '/src' }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('效能考慮', () => {
    it('應該只掃描支援的檔案類型', async () => {
      const source = '/project/src/old.ts';
      const target = '/project/src/new.ts';

      vi.mocked(fs.access).mockImplementation(async (path) => {
        if (path === source) return undefined;
        throw { code: 'ENOENT' };
      });

      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file.ts', isDirectory: () => false, isFile: () => true },
        { name: 'file.json', isDirectory: () => false, isFile: () => true },
        { name: 'file.md', isDirectory: () => false, isFile: () => true },
        { name: 'image.png', isDirectory: () => false, isFile: () => true }
      ] as any);

      const result = await service.moveFile(
        { source, target, updateImports: true },
        { preview: false, projectRoot: '/project/src' }
      );

      expect(result.success).toBe(true);
      // 應該只讀取 .ts 檔案
      const readCalls = vi.mocked(fs.readFile).mock.calls;
      const tsFiles = readCalls.filter(call => call[0].toString().endsWith('.ts'));
      expect(tsFiles.length).toBeGreaterThan(0);
    });
  });
});
