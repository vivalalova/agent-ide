/**
 * CLI change-signature 命令 JS E2E 測試
 * 基於 js-project fixture 測試 JavaScript 函式簽章修改功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as ts from 'typescript';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI change-signature - JavaScript 專案', () => {
  let fixture: FixtureContext;

  function expectValidJavaScript(sourceText: string): void {
    const sourceFile = ts.createSourceFile('generated.js', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    expect(sourceFile.parseDiagnostics).toEqual([]);
  }

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('參數重排序 - 基本功能', () => {
    it('應該成功重排序 JS 函數的兩個參數', async () => {
      await fixture.writeFile('src/test-reorder.js', [
        'function calculate(a, b) {',
        '  return a - b;',
        '}',
        'const result = calculate(10, 5);',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-reorder.js'), 'calculate',
          '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.command).toBe('refactor');
      expect(output.files.length).toBeGreaterThan(0);
    });

    it('應該成功重排序三個參數', async () => {
      await fixture.writeFile('src/test-reorder-three.js', [
        'function format(prefix, value, suffix) {',
        '  return prefix + value + suffix;',
        '}',
        'const text = format(\'[\', 42, \']\');',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-reorder-three.js'), 'format',
          '-p', fixture.rootPath, '--reorder', 'value,prefix,suffix', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該更新所有呼叫點的參數順序', async () => {
      await fixture.writeFile('src/test-reorder-calls.js', [
        'function add(x, y) {',
        '  return x + y;',
        '}',
        'const a = add(1, 2);',
        'const b = add(3, 4);',
        'const c = add(5, 6);',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-reorder-calls.js'), 'add',
          '-p', fixture.rootPath, '--reorder', 'y,x', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.totalChanges).toBeGreaterThanOrEqual(3);
    });

    it('應該使用 fixture 中的 formatName 函數進行重排序', async () => {
      // formatName(first, last) 在 src/utils.js 第 1 行
      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/utils.js'), 'formatName',
          '-p', fixture.rootPath, '--reorder', 'last,first', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('新增參數', () => {
    it('應該成功新增有預設值的參數（JS 無 type）', async () => {
      await fixture.writeFile('src/test-add-param.js', [
        'function greet(name) {',
        '  return \'Hello, \' + name;',
        '}',
        'const msg = greet(\'World\');',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-add-param.js'), 'greet',
          '-p', fixture.rootPath, '--add', 'greeting=Hello', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該成功新增多個參數', async () => {
      await fixture.writeFile('src/test-add-multi.js', [
        'function log(message) {',
        '  console.log(message);',
        '}',
        'log(\'test\');',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-add-multi.js'), 'log',
          '-p', fixture.rootPath, '--add', 'level=info', '--add', 'timestamp=true', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該支援 explicit call-site value 並產生有效 JS 語法', async () => {
      await fixture.writeFile('src/test-add-call-site-value.js', [
        'const runtimeLevel = getRuntimeLevel();',
        'function log(message) {',
        '  console.log(message);',
        '}',
        'log(\'test\');',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-add-call-site-value.js'), 'log',
          '-p', fixture.rootPath,
          '--add', 'level=\'info\'',
          '--call-site-value', 'level=runtimeLevel',
          '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const updatedContent = await fixture.memfs.readFile(fixture.getFilePath('src/test-add-call-site-value.js'), 'utf-8') as string;
      expect(updatedContent).toContain('function log(message, level = \'info\')');
      expect(updatedContent).toContain('log(\'test\', runtimeLevel);');
      expectValidJavaScript(updatedContent);
    });

    it('應該拒絕 JS 目標中的 TypeScript-only call-site expression', async () => {
      const originalContent = [
        'const runtimeLevel = getRuntimeLevel();',
        'function log(message) {',
        '  console.log(message);',
        '}',
        'log(\'test\');',
      ].join('\n');
      await fixture.writeFile('src/test-invalid-call-site-expression.js', originalContent);

      const filePath = fixture.getFilePath('src/test-invalid-call-site-expression.js');
      const result = await executeCLI(
        ['change-signature', filePath, 'log',
          '-p', fixture.rootPath,
          '--add', 'level=\'info\'',
          '--call-site-value', 'level=runtimeLevel as string',
          '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('JavaScript');
      expect(await fixture.memfs.readFile(filePath, 'utf-8')).toBe(originalContent);
    });

    it('應該拒絕 JS 目標中不能作為 parameter default 的 expression', async () => {
      const originalContent = [
        'function log(message) {',
        '  console.log(message);',
        '}',
        'log(\'test\');',
      ].join('\n');
      await fixture.writeFile('src/test-invalid-default-expression.js', originalContent);

      const filePath = fixture.getFilePath('src/test-invalid-default-expression.js');
      const result = await executeCLI(
        ['change-signature', filePath, 'log',
          '-p', fixture.rootPath,
          '--add', 'level=await getLevel()',
          '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('default');
      expect(await fixture.memfs.readFile(filePath, 'utf-8')).toBe(originalContent);
    });
  });

  describe('刪除參數', () => {
    it('應該成功刪除未使用的參數', async () => {
      await fixture.writeFile('src/test-remove-param.js', [
        'function process(data, unused) {',
        '  return data.toUpperCase();',
        '}',
        'const result = process(\'test\', 123);',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-remove-param.js'), 'process',
          '-p', fixture.rootPath, '--remove', 'unused', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('重命名參數', () => {
    it('應該成功重命名 JS 函數參數', async () => {
      await fixture.writeFile('src/test-rename-param.js', [
        'function fn(oldName) {',
        '  return oldName;',
        '}',
        'const r = fn(42);',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-rename-param.js'), 'fn',
          '-p', fixture.rootPath, '--rename', 'oldName:newName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('class 方法', () => {
    it('應該處理 JS class 方法的簽章修改', async () => {
      await fixture.writeFile('src/test-class-method.js', [
        'class Calculator {',
        '  add(a, b) {',
        '    return a + b;',
        '  }',
        '}',
        'const calc = new Calculator();',
        'const result = calc.add(1, 2);',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-class-method.js'), 'add',
          '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('Arrow Function', () => {
    it('應該處理 JS arrow function 的簽章修改', async () => {
      await fixture.writeFile('src/test-arrow.js', [
        'const multiply = (x, y) => x * y;',
        'const result = multiply(3, 4);',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-arrow.js'), 'multiply',
          '-p', fixture.rootPath, '--reorder', 'y,x', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('Async Function', () => {
    it('應該處理 JS async function 的簽章修改', async () => {
      await fixture.writeFile('src/test-async.js', [
        'async function fetchData(url, timeout) {',
        '  return url;',
        '}',
        'const data = await fetchData(\'/api\', 5000);',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-async.js'), 'fetchData',
          '-p', fixture.rootPath, '--reorder', 'timeout,url', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('跨檔案呼叫', () => {
    it('應該更新跨檔案的呼叫點', async () => {
      // createUser(firstName, lastName, email) 在 service.js 被 api.js 呼叫
      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/service.js'), 'createUser',
          '-p', fixture.rootPath, '--reorder', 'email,firstName,lastName', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // api.js 引用 createUser，應產生跨檔案更新
      expect(output.summary.totalChanges).toBeGreaterThanOrEqual(1);
    });
  });

  describe('輸出格式', () => {
    it('應該支援 JSON 格式輸出', async () => {
      await fixture.writeFile('src/test-format-json.js', [
        'function fn(a, b) { return a + b; }',
        'const x = fn(1, 2);',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-format-json.js'), 'fn',
          '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援 summary 格式輸出', async () => {
      await fixture.writeFile('src/test-format-summary.js', [
        'function fn(a, b) { return a + b; }',
        'const x = fn(1, 2);',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-format-summary.js'), 'fn',
          '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
    });

    it('應該支援 diff 格式輸出', async () => {
      await fixture.writeFile('src/test-format-diff.js', [
        'function fn(a, b) { return a + b; }',
        'const x = fn(1, 2);',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-format-diff.js'), 'fn',
          '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^[+-]/m);
    });
  });

  describe('dry-run 模式', () => {
    it('--dry-run 不應修改檔案', async () => {
      const originalContent = [
        'function calc(a, b) {',
        '  return a - b;',
        '}',
        'const result = calc(10, 5);',
      ].join('\n');
      await fixture.writeFile('src/test-dry-run.js', originalContent);

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-dry-run.js'), 'calc',
          '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const fileContent = await fixture.memfs.readFile(fixture.getFilePath('src/test-dry-run.js'), 'utf-8');
      expect(fileContent).toBe(originalContent);
    });
  });

  describe('錯誤處理', () => {
    it('應該處理不存在的函式', async () => {
      await fixture.writeFile('src/test-nonexistent.js', 'const x = 1;');

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-nonexistent.js'), 'nonExistent',
          '-p', fixture.rootPath, '--reorder', 'a,b', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(false);
      }
    });

    it('應該處理無效的參數名稱', async () => {
      await fixture.writeFile('src/test-invalid-param.js', [
        'function test(a) {',
        '  return a;',
        '}',
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-invalid-param.js'), 'test',
          '-p', fixture.rootPath, '--reorder', 'x,y', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(false);
      }
    });

    it('應該處理缺少操作參數', async () => {
      await fixture.writeFile('src/test-no-op.js', 'function test(a) { return a; }');

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/test-no-op.js'), 'test', '-p', fixture.rootPath],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr || result.stdout).toBeTruthy();
    });
  });
});
