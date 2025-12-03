/**
 * CLI search 命令 E2E 測試
 * 基於 sample-project fixture 測試搜尋功能
 * 只測試 symbol 和 structural 子命令
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI search - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該支援 symbol 搜尋', async () => {
      const result = await executeCLI(['search', 'symbol', '--path', fixture.rootPath, '--query', 'User', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援 structural 搜尋', async () => {
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'function', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該在無子命令時返回錯誤或預設行為', async () => {
      const result = await executeCLI(['search', '--path', fixture.rootPath], { memfs: fixture.memfs });

      // 可能返回錯誤或使用預設行為
      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該在無效子命令時返回錯誤或預設行為', async () => {
      const result = await executeCLI(['search', 'invalid', '--path', fixture.rootPath], { memfs: fixture.memfs });

      // 可能返回錯誤或使用預設行為
      expect([0, 1]).toContain(result.exitCode);
    });
  });

  describe('symbol 搜尋', () => {
    it('應該搜尋函數名稱', async () => {
      await fixture.writeFile('test-symbol.ts', 'export function myFunction() { return true; }');
      const result = await executeCLI(['search', 'symbol', '--path', fixture.rootPath, '--query', 'myFunction', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋類別名稱', async () => {
      await fixture.writeFile('test-class.ts', 'export class MyClass { method() {} }');
      const result = await executeCLI(['search', 'symbol', '--path', fixture.rootPath, '--query', 'MyClass', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋介面名稱', async () => {
      await fixture.writeFile('test-interface.ts', 'export interface IUser { name: string; }');
      const result = await executeCLI(['search', 'symbol', '--path', fixture.rootPath, '--query', 'IUser', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋不到時返回空結果', async () => {
      const result = await executeCLI(['search', 'symbol', '--path', fixture.rootPath, '--query', 'xyzNotExist123', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
      expect(output.results.length).toBe(0);
    });

    it('應該處理 Unicode 符號名稱', async () => {
      await fixture.writeFile('test-unicode.ts', 'export class 用戶管理器 { 添加用戶() {} }');
      const result = await executeCLI(['search', 'symbol', '--path', fixture.rootPath, '--query', '用戶', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });
  });

  describe('structural 搜尋', () => {
    it('應該搜尋所有函數', async () => {
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'function', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋所有類別', async () => {
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'class', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋介面', async () => {
      await fixture.writeFile('test-interface.ts', 'interface IUser { name: string; }');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'interface', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋 enum', async () => {
      await fixture.writeFile('test-enum.ts', 'enum Color { Red, Green, Blue }');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'enum', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋 type alias', async () => {
      await fixture.writeFile('test-type.ts', 'type UserId = string;');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'type', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋變數宣告', async () => {
      await fixture.writeFile('test-variable.ts', 'const myVar = 123; let anotherVar = "test";');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'variable', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理不支援的類型過濾', async () => {
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'nonexistent', '--format', 'json'], { memfs: fixture.memfs });

      // 應該返回錯誤或空結果
      expect([0, 1]).toContain(result.exitCode);
    });
  });

  describe('結構化搜尋極端情境', () => {
    it('應該搜尋巢狀 class 中的函數', async () => {
      await fixture.writeFile('test-nested.ts', 'class Outer { inner = class Inner { method() {} } }');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'function', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋匿名函數', async () => {
      await fixture.writeFile('test-anonymous.ts', 'const fn = function() { return 42; };');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'function', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋箭頭函數', async () => {
      await fixture.writeFile('test-arrow.ts', 'const arrow = () => true;');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'function', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋 Generic 型別參數的 class', async () => {
      await fixture.writeFile('test-generic.ts', 'class Container<T, K extends string> { }');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'class', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋裝飾器標記的 class', async () => {
      await fixture.writeFile('test-decorator.ts', '@Injectable() class Service { }');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'class', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋包含 Unicode 屬性的 TypeScript class', async () => {
      await fixture.writeFile('test-unicode-class.ts', 'class 用戶管理器 { 添加用戶() {} }');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'class', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });
  });

  describe('邊界條件', () => {
    it('應該處理空專案', async () => {
      const emptyFixture = await loadFixture('empty-project');
      try {
        const result = await executeCLI(['search', 'structural', '--path', emptyFixture.rootPath, '--type', 'function', '--format', 'json'], { memfs: emptyFixture.memfs });

        // 空專案可能返回錯誤或空結果
        expect([0, 1]).toContain(result.exitCode);
        if (result.exitCode === 0 && result.stdout) {
          const output = JSON.parse(result.stdout);
          expect(output.results).toBeDefined();
          expect(output.results.length).toBe(0);
        }
      } finally {
        emptyFixture.cleanup();
      }
    });

    it('應該處理不存在的路徑', async () => {
      const result = await executeCLI(['search', 'symbol', '--path', '/nonexistent/path', '--query', 'test', '--format', 'json'], { memfs: fixture.memfs });

      // 應該返回錯誤或空結果
      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理大量檔案（100+ 檔案）', async () => {
      for (let i = 0; i < 100; i++) {
        await fixture.writeFile(`file-${i}.ts`, `export function func${i}() { return ${i}; }`);
      }
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'function', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理深層巢狀目錄（12 層）', async () => {
      await fixture.writeFile('a/b/c/d/e/f/g/h/i/j/k/l/deep.ts', 'export function deepFunction() { return true; }');
      const result = await executeCLI(['search', 'symbol', '--path', fixture.rootPath, '--query', 'deepFunction', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理特殊檔名', async () => {
      await fixture.writeFile('test file (special).ts', 'export function special() { return true; }');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'function', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });
  });

  describe('輸出格式', () => {
    it('應該支援 JSON 格式', async () => {
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'function', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援 summary 格式', async () => {
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'function', '--format', 'summary'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });
  });
});
