import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode - JavaScript 專案', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功分析 JS 專案的 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.files)).toBe(true);
    });

    it('應該支援 diff 格式輸出', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('--dry-run 應不修改任何檔案', async () => {
      const originalContent = await fixture.readFile('src/unused.js');

      await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const afterContent = await fixture.readFile('src/unused.js');
      expect(afterContent).toBe(originalContent);
    });
  });

  describe('Dead code 檢測', () => {
    it('應該回傳正確的統計資訊', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('deadcode-removal');
      expect(output.files).toBeDefined();
    });

    it('--include-exports 應成功執行並回傳 JS 專案的分析結果', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--include-exports'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.command).toBe('deadcode-removal');
      expect(Array.isArray(output.files)).toBe(true);
    });

    it('被引用的函數不應被標記為 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // formatName 在 service.js 中有使用，不應被標記
      const deadFiles: Array<{ file: string; removals: Array<{ symbol: string }> }> = output.files ?? [];
      const hasFormatNameAsDead = deadFiles.some((f) =>
        f.file?.includes('utils') &&
        f.removals?.some((r) => r.symbol === 'formatName')
      );
      expect(hasFormatNameAsDead).toBe(false);
    });
  });
});
