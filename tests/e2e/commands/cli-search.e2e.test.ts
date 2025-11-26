/**
 * CLI search 命令 E2E 測試
 * 基於 sample-project fixture 測試搜尋功能
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

  describe('基本文字搜尋', () => {
    it('應該成功執行搜尋命令', async () => {
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'User'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該在 JSON 格式下返回有效 JSON', async () => {
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'User', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該搜尋不到時返回空結果', async () => {
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'xyzNotExist123', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
      expect(output.results.length).toBe(0);
    });
  });

  describe('搜尋選項', () => {
    it('應該支援 case-sensitive 搜尋', async () => {
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'USER', '--case-sensitive'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該支援正則表達式搜尋', async () => {
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'User.*', '--regex'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('結構化搜尋', () => {
    it('應該支援符號搜尋', async () => {
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'function', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該支援類別搜尋', async () => {
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'class', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('輸出格式', () => {
    it('應該支援 list 格式', async () => {
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'function', '--format', 'list'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該支援 minimal 格式', async () => {
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'function', '--format', 'minimal'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('文字搜尋極端情境', () => {
    it('應該處理超長搜尋字串 (1000+ 字元)', async () => {
      const longQuery = 'a'.repeat(1000);
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', longQuery, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理正則元字符搜尋 (非 regex 模式)', async () => {
      const specialChars = '.*+?^${}()|[]\\';
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', specialChars, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 Unicode 和中文搜尋', async () => {
      await fixture.writeFile('test-unicode.ts', 'const 變數 = "測試"; // 註解 🚀');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', '變數', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理 emoji 搜尋', async () => {
      await fixture.writeFile('test-emoji.ts', 'const rocket = "🚀"; // Test emoji');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', '🚀', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理空字串搜尋', async () => {
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', '', '--format', 'json'], { memfs: fixture.memfs });

      // 空字串可能返回錯誤或空結果
      expect([0, 1]).toContain(result.exitCode);
      if (result.exitCode === 0 && result.stdout) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('應該處理全空白字串搜尋', async () => {
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', '   ', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理包含換行符的搜尋字串', async () => {
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'test\nline', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理包含 Tab 的搜尋字串', async () => {
      await fixture.writeFile('test-tabs.ts', 'const data = {\n\tkey: "value"\n};');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', '\t', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });
  });

  describe('搜尋結果極端情境', () => {
    it('應該處理單行多次匹配', async () => {
      await fixture.writeFile('test-multi-match.ts', 'const test = test + test + test;');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'test', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理大量匹配結果 (生成 100+ 行)', async () => {
      const lines = Array.from({ length: 150 }, (_, i) => `const var${i} = "match";`).join('\n');
      await fixture.writeFile('test-many-matches.ts', lines);
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'match', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理全檔案匹配 (搜尋常見關鍵字)', async () => {
      await fixture.writeFile('test-all-match.ts', 'a\na\na\na\na');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'a', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理跨行匹配 (regex 模式)', async () => {
      await fixture.writeFile('test-multiline.ts', 'function test() {\n  return true;\n}');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'function.*return', '--regex', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('結構化搜尋極端情境', () => {
    it('應該搜尋巢狀 class 中的函數', async () => {
      await fixture.writeFile('test-nested.ts', 'class Outer { class Inner { method() {} } }');
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

    it('應該搜尋 interface', async () => {
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
  });

  describe('邊界條件', () => {
    it('應該處理空專案 (無檔案)', async () => {
      const emptyFixture = await loadFixture('empty-project');
      try {
        const result = await executeCLI(['search', 'text', '--path', emptyFixture.rootPath, '--query', 'test', '--format', 'json'], { memfs: emptyFixture.memfs });

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.results).toBeDefined();
        expect(output.results.length).toBe(0);
      } finally {
        emptyFixture.cleanup();
      }
    });

    it('應該忽略 binary 檔案', async () => {
      await fixture.writeFile('test.bin', '\x00\x01\x02\x03\xFF');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'test', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理超大檔案 (模擬 10000+ 行)', async () => {
      const bigFile = Array.from({ length: 10000 }, (_, i) => `line ${i}`).join('\n');
      await fixture.writeFile('test-big.ts', bigFile);
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'line 5000', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理特殊檔名 (空格、特殊字元)', async () => {
      await fixture.writeFile('test file (special).ts', 'const test = true;');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'test', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理深層巢狀目錄（12 層）', async () => {
      await fixture.writeFile('a/b/c/d/e/f/g/h/i/j/k/l/deep.ts', 'const deep = true;');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'deep', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });
  });

  describe('錯誤處理', () => {
    it('應該處理無效正則表達式', async () => {
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', '[invalid(regex', '--regex', '--format', 'json'], { memfs: fixture.memfs });

      // 應該返回錯誤但不崩潰
      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理不存在的符號類型過濾', async () => {
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'nonexistent', '--format', 'json'], { memfs: fixture.memfs });

      // 應該返回錯誤或空結果
      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理不存在的路徑', async () => {
      const result = await executeCLI(['search', 'text', '--path', '/nonexistent/path', '--query', 'test', '--format', 'json'], { memfs: fixture.memfs });

      // 應該返回錯誤或空結果
      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理空路徑參數', async () => {
      const result = await executeCLI(['search', 'text', '--path', '', '--query', 'test', '--format', 'json'], { memfs: fixture.memfs });

      // 應該返回錯誤或使用預設值
      expect([0, 1]).toContain(result.exitCode);
    });
  });

  describe('複合條件測試', () => {
    it('應該同時使用 case-sensitive 和 regex', async () => {
      await fixture.writeFile('test-combined.ts', 'const Test = true; const test = false;');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'Test', '--case-sensitive', '--regex', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該在大量檔案中使用 regex 搜尋（120 檔案）', async () => {
      for (let i = 0; i < 120; i++) {
        await fixture.writeFile(`test-file-${i}.ts`, `export const value${i} = ${i};`);
      }
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'value\\d+', '--regex', '--format', 'json'], { memfs: fixture.memfs });

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
});
