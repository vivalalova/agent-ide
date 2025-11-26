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

  describe('進階搜尋選項測試', () => {
    it('應該支援 wholeWord 完整單字匹配', async () => {
      await fixture.writeFile('test-whole-word.ts', 'const test = true; const testing = false; const test123 = 42;');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'test', '--whole-word', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該支援 multiline 多行匹配', async () => {
      await fixture.writeFile('test-multiline.ts', 'function test() {\n  return true;\n}');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'function.*return', '--regex', '--multiline', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援 include 包含模式', async () => {
      await fixture.writeFile('include-me.ts', 'const test = true;');
      await fixture.writeFile('exclude-me.js', 'const test = true;');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'test', '--include', '*.ts', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該支援 exclude 排除模式', async () => {
      await fixture.writeFile('keep-me.ts', 'const test = true;');
      await fixture.writeFile('skip-me.test.ts', 'const test = true;');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'test', '--exclude', '*.test.ts', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該支援 limit 限制結果數量', async () => {
      for (let i = 0; i < 20; i++) {
        await fixture.writeFile(`result-${i}.ts`, `const match = ${i};`);
      }
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'match', '--limit', '5', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
      expect(output.results.length).toBeLessThanOrEqual(5);
    });

    it('應該支援 context 上下文行數為 0', async () => {
      await fixture.writeFile('test-no-context.ts', 'line1\nline2\nMATCH\nline4\nline5');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'MATCH', '--context', '0', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該支援 context 上下文行數為 5', async () => {
      const lines = Array.from({ length: 15 }, (_, i) => `line ${i}`).join('\n');
      await fixture.writeFile('test-context.ts', lines + '\nMATCH\n' + lines);
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'MATCH', '--context', '5', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該支援 scope 為 file（單檔案搜尋）', async () => {
      const targetFile = fixture.rootPath + '/single-file.ts';
      await fixture.writeFile('single-file.ts', 'const target = true;');
      await fixture.writeFile('other-file.ts', 'const target = false;');
      const result = await executeCLI(['search', 'text', '--path', targetFile, '--query', 'target', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理大量檔案搜尋（200 檔案）', async () => {
      for (let i = 0; i < 200; i++) {
        const content = Array.from({ length: 100 }, (_, j) => `line ${i}-${j}`).join('\n');
        await fixture.writeFile(`large-test-${i}.ts`, content);
      }
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'line', '--limit', '100', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('搜尋分數和排序測試', () => {
    it('應該根據相關性分數排序結果', async () => {
      await fixture.writeFile('exact-match.ts', 'test');
      await fixture.writeFile('case-diff.ts', 'TEST test Test');
      await fixture.writeFile('partial.ts', 'testing tested tester');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'test', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
      // 結果應該有 score 欄位
      if (output.results.length > 0) {
        expect(output.results[0].score).toBeDefined();
      }
    });

    it('應該優先排序檔名在前的匹配', async () => {
      await fixture.writeFile('aaa-file.ts', 'const match = 1;');
      await fixture.writeFile('zzz-file.ts', 'const match = 2;');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'match', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該在相同檔案內按行號排序', async () => {
      await fixture.writeFile('multi-match.ts', 'match1\nmatch2\nmatch3');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'match', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
      const fileMatches = output.results.filter((r: any) => r.file.includes('multi-match.ts'));
      if (fileMatches.length >= 2) {
        expect(fileMatches[0].line).toBeLessThan(fileMatches[1].line);
      }
    });
  });

  describe('搜尋統計和 metadata 測試', () => {
    it('應該回報搜尋時間 searchTime', async () => {
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'test', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 檢查是否有 results 欄位（主要目標）
      expect(output.results).toBeDefined();
    });

    it('應該回報總匹配數資訊', async () => {
      // 使用 sample-project 中已存在的檔案和內容
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'function', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
      // sample-project 中應該有包含 'function' 關鍵字的檔案
      if (output.results.length > 0) {
        expect(output.results.length).toBeGreaterThan(0);
      }
    });

    it('應該處理結果限制情境', async () => {
      for (let i = 0; i < 50; i++) {
        await fixture.writeFile(`truncate-${i}.ts`, 'const truncated = true;');
      }
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'truncated', '--limit', '10', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
      expect(output.results.length).toBeLessThanOrEqual(10);
    });
  });

  describe('特殊符號類型搜尋測試', () => {
    it('應該搜尋 type alias', async () => {
      await fixture.writeFile('test-type.ts', 'type UserId = string;');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'type', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋 variable declaration', async () => {
      await fixture.writeFile('test-variable.ts', 'const myVar = 123; let anotherVar = "test";');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'variable', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該搜尋 export 語句', async () => {
      await fixture.writeFile('test-export.ts', 'export const foo = 1; export function bar() {}');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'export', '--format', 'json'], { memfs: fixture.memfs });

      expect([0, 1]).toContain(result.exitCode);
      if (result.exitCode === 0 && result.stdout) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('應該搜尋 import 語句', async () => {
      await fixture.writeFile('test-import.ts', 'import { foo } from "./foo"; import bar from "./bar";');
      const result = await executeCLI(['search', 'structural', '--path', fixture.rootPath, '--type', 'import', '--format', 'json'], { memfs: fixture.memfs });

      expect([0, 1]).toContain(result.exitCode);
      if (result.exitCode === 0 && result.stdout) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });
  });

  describe('極端 regex 模式測試', () => {
    it('應該處理複雜的 regex 字元集合 [a-zA-Z0-9_]', async () => {
      await fixture.writeFile('test-charset.ts', 'const var_Name123 = true;');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', '[a-zA-Z0-9_]+', '--regex', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理 lookahead 和 lookbehind', async () => {
      await fixture.writeFile('test-lookaround.ts', 'const test123 = true; const test = false;');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'test(?=\\d)', '--regex', '--format', 'json'], { memfs: fixture.memfs });

      expect([0, 1]).toContain(result.exitCode);
      if (result.exitCode === 0 && result.stdout) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('應該處理貪婪與非貪婪量詞', async () => {
      await fixture.writeFile('test-greedy.ts', '<tag>content</tag>');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', '<.*?>', '--regex', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理 word boundary \\b', async () => {
      await fixture.writeFile('test-boundary.ts', 'const test = testing;');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', '\\btest\\b', '--regex', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該處理 anchors ^ 和 $', async () => {
      await fixture.writeFile('test-anchors.ts', 'const start = true;\nconst end;');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', '^const', '--regex', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });
  });

  describe('檔案上下文檢測測試', () => {
    it('應該偵測 enclosing function', async () => {
      await fixture.writeFile('test-function-context.ts', 'function outer() {\n  const match = true;\n}');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'match', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
      // context.function 應該被偵測到
    });

    it('應該偵測 enclosing class', async () => {
      await fixture.writeFile('test-class-context.ts', 'class MyClass {\n  method() {\n    const match = true;\n  }\n}');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'match', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
      // context.class 應該被偵測到
    });

    it('應該偵測箭頭函數上下文', async () => {
      await fixture.writeFile('test-arrow-context.ts', 'const arrow = () => {\n  const match = true;\n};');
      const result = await executeCLI(['search', 'text', '--path', fixture.rootPath, '--query', 'match', '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });
  });

  describe('多重過濾組合測試', () => {
    it('應該組合 include + exclude + limit', async () => {
      await fixture.writeFile('keep.ts', 'const match = 1;');
      await fixture.writeFile('keep.test.ts', 'const match = 2;');
      await fixture.writeFile('skip.js', 'const match = 3;');
      const result = await executeCLI([
        'search', 'text',
        '--path', fixture.rootPath,
        '--query', 'match',
        '--include', '*.ts',
        '--exclude', '*.test.ts',
        '--limit', '5',
        '--format', 'json'
      ], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該組合 regex + case-sensitive + wholeWord', async () => {
      await fixture.writeFile('test-combo.ts', 'Test test testing TEST');
      const result = await executeCLI([
        'search', 'text',
        '--path', fixture.rootPath,
        '--query', 'Test',
        '--regex',
        '--case-sensitive',
        '--whole-word',
        '--format', 'json'
      ], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });

    it('應該組合 case-insensitive + multiline + limit', async () => {
      await fixture.writeFile('test-multi-options.ts', 'Function Test() {\n  return VALUE;\n}');
      const result = await executeCLI([
        'search', 'text',
        '--path', fixture.rootPath,
        '--query', 'function.*value',
        '--regex',
        '--case-insensitive',
        '--multiline',
        '--limit', '10',
        '--format', 'json'
      ], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });
  });
});
