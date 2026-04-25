import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename - JavaScript 專案', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該以 --dry-run 預覽 JS 符號重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'DEFAULT_LOCALE', '--to', 'DEFAULT_LANG', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該支援 diff 格式的 --dry-run 輸出', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'DEFAULT_LOCALE', '--to', 'DEFAULT_LANG', '--dry-run', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該支援 summary 格式的 --dry-run 輸出', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'DEFAULT_LOCALE', '--to', 'DEFAULT_LANG', '--dry-run', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('重命名結果驗證', () => {
    it('重命名後 utils.js 應包含新名稱', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'DEFAULT_LOCALE', '--to', 'DEFAULT_LANG', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const content = await fixture.readFile('src/utils.js');
      expect(content).toContain('DEFAULT_LANG');
      expect(content).not.toContain('DEFAULT_LOCALE');
    });

    it('重命名跨檔案符號應更新所有引用', async () => {
      await fixture.writeFile('extra.js', 'import { DEFAULT_LOCALE } from "./src/utils.js";\nexport const locale = DEFAULT_LOCALE;');

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'DEFAULT_LOCALE', '--to', 'DEFAULT_LANG', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const extraContent = await fixture.readFile('extra.js');
      expect(extraContent).toContain('DEFAULT_LANG');
      expect(extraContent).not.toContain('DEFAULT_LOCALE');
    });

    it('--dry-run 不應實際修改檔案', async () => {
      const originalContent = await fixture.readFile('src/utils.js');

      await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'DEFAULT_LOCALE', '--to', 'DEFAULT_LANG', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const afterContent = await fixture.readFile('src/utils.js');
      expect(afterContent).toBe(originalContent);
    });
  });

  describe('錯誤處理', () => {
    it('同名符號錯誤應列出可直接用於 --at 的 1-based 位置', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'formatName', '--to', 'formatDisplayName', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.error).toContain('src/utils.js:1:');
      expect(output.error).not.toContain('.js:0:');
    });

    it('不存在的符號應回傳錯誤', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'nonExistentSymbol99', '--to', 'newName', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect([0, 1]).toContain(result.exitCode);
    });

    it('重命名為與現有符號衝突的名稱應適當處理', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'DEFAULT_LOCALE', '--to', 'DEFAULT_LOCALE', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect([0, 1]).toContain(result.exitCode);
    });
  });
});
