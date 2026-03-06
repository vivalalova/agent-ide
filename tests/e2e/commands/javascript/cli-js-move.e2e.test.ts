import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - JavaScript 專案', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該以 --dry-run 預覽 JS 檔案移動', async () => {
      const result = await executeCLI(
        ['move', 'src/unused.js', 'src/deprecated.js', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該支援 diff 格式的 --dry-run 輸出', async () => {
      const result = await executeCLI(
        ['move', 'src/unused.js', 'src/deprecated.js', '--path', fixture.rootPath, '--dry-run', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該支援 summary 格式的 --dry-run 輸出', async () => {
      const result = await executeCLI(
        ['move', 'src/unused.js', 'src/deprecated.js', '--path', fixture.rootPath, '--dry-run', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('移動結果驗證', () => {
    it('移動 JS 檔案後目標路徑應存在', async () => {
      await executeCLI(
        ['move', 'src/unused.js', 'src/deprecated.js', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const targetExists = await fixture.exists('src/deprecated.js');
      expect(targetExists).toBe(true);
    });

    it('移動後引用此檔案的 import 路徑應更新', async () => {
      await fixture.writeFile('consumer.js', 'import { unusedHelper } from "./src/unused.js";\nexport const h = unusedHelper;');

      const result = await executeCLI(
        ['move', 'src/unused.js', 'src/deprecated.js', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const consumerContent = await fixture.readFile('consumer.js');
      expect(consumerContent).toContain('deprecated');
      // import 路徑應從 src/unused 更新為 src/deprecated
      expect(consumerContent).not.toContain('./src/unused');
    });

    it('--dry-run 不應實際移動檔案', async () => {
      await executeCLI(
        ['move', 'src/unused.js', 'src/deprecated.js', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const sourceExists = await fixture.exists('src/unused.js');
      const targetExists = await fixture.exists('src/deprecated.js');
      expect(sourceExists).toBe(true);
      expect(targetExists).toBe(false);
    });
  });

  describe('錯誤處理', () => {
    it('不存在的來源檔案應返回錯誤', async () => {
      const result = await executeCLI(
        ['move', 'src/nonexistent.js', 'src/target.js', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
    });
  });
});
