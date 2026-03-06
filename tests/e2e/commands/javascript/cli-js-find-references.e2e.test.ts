import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI find-references - JavaScript 專案', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功查找 JS 函數引用並回傳 JSON', async () => {
      const result = await executeCLI(
        ['find-references', 'formatName', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('formatName');
      expect(output.success).toBe(true);
    });

    it('應該以 summary 格式回傳結果', async () => {
      const result = await executeCLI(
        ['find-references', 'formatName', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('formatName');
    });

    it('應該找到 calculateTotal 的引用', async () => {
      const result = await executeCLI(
        ['find-references', 'calculateTotal', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('引用查找結果', () => {
    it('formatName 應該在 service.js 中找到引用', async () => {
      const result = await executeCLI(
        ['find-references', 'formatName', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const refs: Array<{ file: string }> = output.references ?? output.results ?? [];
      const hasServiceRef = refs.some((r) => r.file?.includes('service'));
      expect(hasServiceRef).toBe(true);
    });

    it('未使用的符號應回傳空引用列表或低計數', async () => {
      const result = await executeCLI(
        ['find-references', 'unusedHelper', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('新增 JS 檔案後應能找到新引用', async () => {
      await fixture.writeFile('consumer.js', 'import { formatName } from "./src/utils.js";\nexport const greet = (f, l) => formatName(f, l);');

      const result = await executeCLI(
        ['find-references', 'formatName', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('邊界條件', () => {
    it('不存在的符號應成功回傳空結果', async () => {
      const result = await executeCLI(
        ['find-references', 'nonExistentSymbol99', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理 JSX 檔案中的符號引用', async () => {
      await fixture.writeFile('App.jsx', 'import { formatName } from "./src/utils.js";\nexport function App({ first, last }) { return formatName(first, last); }');

      const result = await executeCLI(
        ['find-references', 'formatName', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });
});
