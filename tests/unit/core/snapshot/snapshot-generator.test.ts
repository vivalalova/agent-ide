/**
 * SnapshotGenerator 單元測試
 */

import { describe, it, expect, vi } from 'vitest';
import { SnapshotGenerator } from '@core/snapshot/snapshot-generator.js';
import { createMockFileSystem, createMockFileStats } from '../_helpers/mock-factories.js';

describe('SnapshotGenerator', () => {
  describe('generate - 空目錄', () => {
    it('Given 空目錄（exists=false, readDirectory=[]）, when generate, then 回傳空 ModuleSnapshot', async () => {
      const mockFs = createMockFileSystem({});
      // 讓 IndexEngine.indexProject 通過 isDirectory 檢查
      vi.mocked(mockFs.getStats).mockResolvedValue(
        createMockFileStats({ isFile: false, isDirectory: true })
      );

      const generator = new SnapshotGenerator(mockFs);
      const result = await generator.generate('/empty-module');

      expect(result).toBeDefined();
      // 應為 ModuleSnapshot（非 ProjectSnapshot）
      expect('module' in result).toBe(true);
      if ('module' in result) {
        expect(result.api).toBeDefined();
        expect(result.factories).toBeDefined();
        expect(result.types).toBeDefined();
      }
    });

    it('Given 空目錄, when generate, then api/factories/types 均為空物件', async () => {
      const mockFs = createMockFileSystem({});
      vi.mocked(mockFs.getStats).mockResolvedValue(
        createMockFileStats({ isFile: false, isDirectory: true })
      );

      const generator = new SnapshotGenerator(mockFs);
      const result = await generator.generate('/empty-module');

      expect('module' in result).toBe(true);
      if ('module' in result) {
        expect(Object.keys(result.api)).toHaveLength(0);
        expect(Object.keys(result.factories)).toHaveLength(0);
        expect(Object.keys(result.types)).toHaveLength(0);
      }
    });
  });

  describe('generate - scope 偵測', () => {
    it('Given 有 package.json + src 目錄, when generate, then 回傳 ProjectSnapshot', async () => {
      const mockFs = createMockFileSystem({
        '/project/package.json': '{"name":"test"}',
        '/project/src/index.ts': 'export const x = 1;'
      });
      vi.mocked(mockFs.getStats).mockResolvedValue(
        createMockFileStats({ isFile: false, isDirectory: true })
      );
      // src/ 目錄存在
      vi.mocked(mockFs.exists).mockImplementation(async (p: string) => {
        return p === '/project/package.json' || p === '/project/src';
      });

      const generator = new SnapshotGenerator(mockFs);
      const result = await generator.generate('/project');

      // 應為 ProjectSnapshot
      expect('project' in result).toBe(true);
      if ('project' in result) {
        expect(result.project).toBeDefined();
        expect(result.modules).toBeDefined();
      }
    });

    it('Given 有 index.ts, when generate, then 回傳 ModuleSnapshot', async () => {
      const mockFs = createMockFileSystem({
        '/module/index.ts': 'export const x = 1;'
      });
      vi.mocked(mockFs.getStats).mockResolvedValue(
        createMockFileStats({ isFile: false, isDirectory: true })
      );

      const generator = new SnapshotGenerator(mockFs);
      const result = await generator.generate('/module');

      expect('module' in result).toBe(true);
    });
  });
});
