/**
 * MoveEngine 單元測試
 */

import { describe, it, expect, vi } from 'vitest';
import { MoveEngine } from '@core/move/move-engine.js';
import { createMockFileSystem } from '../_helpers/mock-factories.js';

describe('MoveEngine', () => {
  describe('moveFile - 驗證失敗', () => {
    it('Given 來源不存在, when moveFile, then success: false + 錯誤訊息含路徑', async () => {
      const mockFs = createMockFileSystem({});
      const engine = new MoveEngine(mockFs);

      const result = await engine.moveFile({
        source: '/src/foo.ts',
        target: '/src/bar.ts'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('來源路徑不存在');
      expect(result.error).toContain('/src/foo.ts');
    });

    it('Given 目標已存在, when moveFile, then success: false + 錯誤訊息含路徑', async () => {
      const mockFs = createMockFileSystem({
        '/src/foo.ts': 'export const x = 1;',
        '/src/bar.ts': 'export const y = 2;'
      });
      const engine = new MoveEngine(mockFs);

      const result = await engine.moveFile({
        source: '/src/foo.ts',
        target: '/src/bar.ts'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('目標路徑已存在');
      expect(result.error).toContain('/src/bar.ts');
    });
  });

  describe('moveFile - 預覽模式', () => {
    it('Given 有效路徑且 preview: true, when moveFile, then success: true + moved: false', async () => {
      const mockFs = createMockFileSystem({
        '/src/foo.ts': 'export const x = 1;'
      });
      const engine = new MoveEngine(mockFs);

      const result = await engine.moveFile(
        { source: '/src/foo.ts', target: '/src/bar.ts', updateImports: false },
        { preview: true }
      );

      expect(result.success).toBe(true);
      expect(result.moved).toBe(false);
      expect(result.source).toBe('/src/foo.ts');
      expect(result.target).toBe('/src/bar.ts');
    });
  });

  describe('generateChangeset - 來源不存在', () => {
    it('Given 來源不存在, when generateChangeset, then 回傳 success: false + 錯誤訊息', async () => {
      const mockFs = createMockFileSystem({});
      const engine = new MoveEngine(mockFs);

      const changeset = await engine.generateChangeset({
        source: '/src/missing.ts',
        target: '/src/dest.ts'
      });

      expect(changeset.success).toBe(false);
      expect(changeset.errors).toBeDefined();
      expect(changeset.errors!.some(e => e.includes('來源路徑不存在'))).toBe(true);
    });
  });

  describe('generateChangeset - 批次移動效能', () => {
    it('Given 同一批次的多個檔案移動, when 逐一產生 changeset, then 專案目錄只掃描一次', async () => {
      const projectRoot = '/project';
      const sourceA = '/project/src/a.ts';
      const sourceB = '/project/src/b.ts';
      const consumer = '/project/src/consumer.ts';
      const files = {
        [sourceA]: 'export const a = 1;',
        [sourceB]: 'export const b = 2;',
        [consumer]: [
          'import { a } from \'./a\';',
          'import { b } from \'./b\';',
          'console.log(a, b);'
        ].join('\n')
      };
      const mockFs = createMockFileSystem(files);
      const readDirectory = vi.fn(async (dirPath: string) => {
        if (dirPath === projectRoot) {
          return [
            { name: 'src', path: '/project/src', isDirectory: true, isFile: false }
          ];
        }
        if (dirPath === '/project/src') {
          return [
            { name: 'a.ts', path: sourceA, isDirectory: false, isFile: true },
            { name: 'b.ts', path: sourceB, isDirectory: false, isFile: true },
            { name: 'consumer.ts', path: consumer, isDirectory: false, isFile: true }
          ];
        }
        return [];
      });
      mockFs.readDirectory = readDirectory;
      const engine = new MoveEngine(mockFs);
      const batchMoveInfo = {
        allMovedFiles: new Map([
          [sourceA, '/project/lib/a.ts'],
          [sourceB, '/project/lib/b.ts']
        ])
      };

      await engine.generateChangeset(
        { source: sourceA, target: '/project/lib/a.ts' },
        { projectRoot, batchMoveInfo }
      );
      await engine.generateChangeset(
        { source: sourceB, target: '/project/lib/b.ts' },
        { projectRoot, batchMoveInfo }
      );

      expect(readDirectory).toHaveBeenCalledTimes(2);
      expect(readDirectory).toHaveBeenNthCalledWith(1, projectRoot);
      expect(readDirectory).toHaveBeenNthCalledWith(2, '/project/src');
    });
  });
});
