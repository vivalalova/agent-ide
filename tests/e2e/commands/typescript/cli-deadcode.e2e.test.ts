/**
 * deadcode 命令 E2E 測試
 * 基於 deadcode-test fixture
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode - 基於 deadcode-test fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('deadcode-test');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功檢測 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('deadcode-removal');
      expect(output.success).toBe(true);
      expect(output.files).toBeDefined();
      expect(Array.isArray(output.files)).toBe(true);
    });

    it('應該輸出 diff 格式', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      // diff 格式應該包含刪除標記
      expect(result.stdout).toContain('-');
    });

    it('應該檢測到真正的 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      // 應該檢測到一些 dead code
      expect(output.files.length).toBeGreaterThan(0);
    });

    it('應該包含正確的統計資訊', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      expect(output.summary).toBeDefined();
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
      expect(output.summary.totalChanges).toBeGreaterThanOrEqual(0);
    });
  });

  describe('選項測試', () => {
    it('--include-exports 應該包含 export 的符號', async () => {
      // 不包含 exports
      const resultWithout = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 包含 exports
      const resultWith = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--include-exports'],
        { memfs: fixture.memfs }
      );

      const outputWithout = JSON.parse(resultWithout.stdout);
      const outputWith = JSON.parse(resultWith.stdout);

      // 計算 hunks 總數
      const countHunks = (output: { files?: Array<{ hunks?: unknown[] }> }) =>
        output.files?.reduce((sum, f) => sum + (f.hunks?.length ?? 0), 0) ?? 0;

      // 包含 exports 時應該檢測到更多或相同
      expect(countHunks(outputWith)).toBeGreaterThanOrEqual(countHunks(outputWithout));
    });
  });

  describe('輸出格式', () => {
    it('JSON 輸出應該是有效的 JSON', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('每個檔案應該包含 hunks 資訊', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      if (output.files && output.files.length > 0) {
        const file = output.files[0];
        expect(file.filePath).toBeDefined();
        expect(file.hunks).toBeDefined();
        expect(Array.isArray(file.hunks)).toBe(true);
      }
    });
  });

  describe('錯誤處理', () => {
    it('不存在的路徑應該報錯', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', '/non/existent/path', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
    });

    it('不支援的格式應該報錯', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'invalid'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      // 錯誤訊息可能在 stdout 或 stderr
      const output = result.stdout + result.stderr;
      expect(output).toContain('不支援的輸出格式');
    });
  });
});
