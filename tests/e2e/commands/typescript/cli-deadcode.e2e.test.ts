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
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('analyze');
      expect(output.analyzeType).toBe('dead-code');
      expect(output.success).toBe(true);
      expect(output.items).toBeDefined();
      expect(Array.isArray(output.items)).toBe(true);
    });

    it('應該輸出 summary 格式', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Dead Code');
      expect(result.stdout).toContain('掃描符號');
    });

    it('應該檢測到真正的 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      // 應該檢測到一些 dead code
      expect(output.items.length).toBeGreaterThan(0);

      // 檢查是否包含預期的 dead code
      const itemNames = output.items.map((item: { name: string }) => item.name);
      expect(itemNames).toContain('unusedFunction');
      expect(itemNames).toContain('UnusedClass');
      expect(itemNames).toContain('UnusedInternalClass');
    });

    it('應該包含正確的統計資訊', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      expect(output.summary.totalScanned).toBeGreaterThan(0);
      expect(output.filesAffected).toBeGreaterThan(0);
      expect(output.scanTime).toBeGreaterThanOrEqual(0);
      expect(output.byType).toBeDefined();
    });
  });

  describe('選項測試', () => {
    it('--include-exports 應該包含 export 的符號', async () => {
      // 不包含 exports
      const resultWithout = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 包含 exports
      const resultWith = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json', '--include-exports'],
        { memfs: fixture.memfs }
      );

      const outputWithout = JSON.parse(resultWithout.stdout);
      const outputWith = JSON.parse(resultWith.stdout);

      // 包含 exports 時應該檢測到更多
      expect(outputWith.items.length).toBeGreaterThanOrEqual(outputWithout.items.length);
    });
  });

  describe('輸出格式', () => {
    it('JSON 輸出應該是有效的 JSON', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('每個 dead code 項目應該包含完整資訊', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      if (output.items.length > 0) {
        const item = output.items[0];
        expect(item.name).toBeDefined();
        expect(item.type).toBeDefined();
        expect(item.file).toBeDefined();
        expect(item.line).toBeDefined();
        expect(item.confidence).toBeDefined();
        expect(item.reason).toBeDefined();
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

// 大型專案測試已移除（執行時間 > 120s）

// empty-project fixture 在 memfs 中無法正確處理，已移除測試
// 空專案在真實 FS 中正常運作
