/**
 * CLI search 命令 E2E 測試
 * 基於 sample-project fixture 測試符號搜尋功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI search - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功搜尋函數並輸出 JSON 格式', async () => {
      await fixture.writeFile('src/utils.ts', 'export function processData(input: string) { return input; }');

      const result = await executeCLI(
        ['search', 'processData', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('search');
      expect(output.success).toBe(true);
      expect(Array.isArray(output.results)).toBe(true);
      expect(output.results.length).toBeGreaterThan(0);
    });

    it('應該支援 summary 格式輸出', async () => {
      await fixture.writeFile('src/helper.ts', 'export function helperFn() {}');

      const result = await executeCLI(
        ['search', 'helperFn', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('helperFn');
    });

    it('應該找到 class 符號', async () => {
      // UserService 已存在於 sample-project
      const result = await executeCLI(
        ['search', 'UserService', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.some((r: { content: string }) => r.content.includes('UserService'))).toBe(true);
    });
  });

  describe('搜尋結果結構', () => {
    it('JSON 結果應包含 filePath, line, content 欄位', async () => {
      await fixture.writeFile('src/lib.ts', 'export function uniqueLibFn42() { return 42; }');

      const result = await executeCLI(
        ['search', 'uniqueLibFn42', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(0);
      const match = output.results[0];
      expect(match.filePath).toBeDefined();
      expect(typeof match.line).toBe('number');
      expect(typeof match.content).toBe('string');
    });

    it('應包含 summary.matchCount', async () => {
      await fixture.writeFile('src/a.ts', 'export function xqzFooFn() {}');
      await fixture.writeFile('src/b.ts', 'export function xqzBarFn() {}');

      const result = await executeCLI(
        ['search', 'xqzFoo', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
      expect(typeof output.summary.matchCount).toBe('number');
    });

    it('應包含 searchTime 欄位', async () => {
      await fixture.writeFile('src/comp.ts', 'export class XqzSearchComp {}');

      const result = await executeCLI(
        ['search', 'XqzSearchComp', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(typeof output.searchTime).toBe('number');
    });
  });

  describe('模糊搜尋', () => {
    it('應找到部分名稱匹配的符號', async () => {
      await fixture.writeFile('src/utils-xqz.ts', 'export function xqzFuzzyTarget(x: string) { return x; }');

      const result = await executeCLI(
        ['search', 'xqzFuzzy', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.some((r: { content: string }) => r.content.includes('xqzFuzzyTarget'))).toBe(true);
    });
  });

  describe('精確匹配（--no-fuzzy）', () => {
    it('--no-fuzzy 應僅匹配完全相同名稱', async () => {
      await fixture.writeFile('src/exact.ts', [
        'export function findItem() {}',
        'export function findItemById() {}',
      ].join('\n'));

      const result = await executeCLI(
        ['search', 'findItem', '--no-fuzzy', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 精確匹配應找到 findItem
      expect(output.results.some((r: { content: string }) => r.content.includes('findItem') && !r.content.includes('findItemById'))).toBe(true);
    });
  });

  describe('--type 過濾', () => {
    it('應依型別過濾結果', async () => {
      await fixture.writeFile('src/mixed-xqz.ts', [
        'export class XqzTypeClass {}',
        'export function xqzTypeFunc() {}',
        'export const xqzTypeConst = 1;',
      ].join('\n'));

      const result = await executeCLI(
        ['search', 'xqzType', '--type', 'class', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 所有結果應為 class 型別
      expect(output.results.every((r: { content: string }) => r.content.includes('class'))).toBe(true);
    });
  });

  describe('--max-results 限制', () => {
    it('應限制回傳結果數量', async () => {
      // 建立多個同前綴符號
      const lines = Array.from({ length: 10 }, (_, i) => `export function xqzItem${i}() {}`);
      await fixture.writeFile('src/many-xqz.ts', lines.join('\n'));

      const result = await executeCLI(
        ['search', 'xqzItem', '--max-results', '3', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeLessThanOrEqual(3);
    });

    it('結果達上限時應標記 truncated=true', async () => {
      const lines = Array.from({ length: 5 }, (_, i) => `export function xqzBatchFn${i}() {}`);
      await fixture.writeFile('src/batch-xqz.ts', lines.join('\n'));

      const result = await executeCLI(
        ['search', 'xqzBatch', '--max-results', '2', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.truncated).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('不存在的符號應回傳空結果且 success=true', async () => {
      const result = await executeCLI(
        ['search', 'nonExistentSymbolXYZ123', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.results).toEqual([]);
    });

    it('無效路徑應回傳錯誤', async () => {
      const result = await executeCLI(
        ['search', 'foo', '--path', '/nonexistent/path/xyz', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('路徑不存在');
    });
  });
});
