/**
 * CLI move-member 命令 JS E2E 測試
 * 基於 js-project fixture 測試 JavaScript 成員移動功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member - JavaScript 專案', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('移動結果驗證', () => {
    it('應該成功移動 JS 函式到目標檔案', async () => {
      await fixture.writeFile('src/move-source.js', [
        'export function toMove() {',
        '  return "moved";',
        '}',
        '',
        'export function stay() {',
        '  return "stay";',
        '}',
      ].join('\n'));
      await fixture.writeFile('src/move-target.js', 'export function existing() {}\n');

      // toMove 在第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/move-source.js')}:1`, fixture.getFilePath('src/move-target.js'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/move-target.js'), 'utf-8') as string;
      expect(targetContent).toContain('toMove');
      expect(targetContent).toContain('existing');
    });

    it('移動後來源檔案不再包含被移動的函式', async () => {
      await fixture.writeFile('src/remove-source.js', [
        'export function toRemove() {',
        '  return "removed";',
        '}',
        '',
        'export function keep() {',
        '  return "keep";',
        '}',
      ].join('\n'));
      await fixture.writeFile('src/remove-target.js', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/remove-source.js')}:1`, fixture.getFilePath('src/remove-target.js'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/remove-source.js'), 'utf-8') as string;
      expect(sourceContent).not.toContain('toRemove');
      expect(sourceContent).toContain('keep');
    });

    it('應該移動 JS async function 並保留 async 關鍵字', async () => {
      await fixture.writeFile('src/async-source.js', [
        'export async function fetchData(url) {',
        '  return url;',
        '}',
        '',
        'export function sync() {',
        '  return "sync";',
        '}',
      ].join('\n'));
      await fixture.writeFile('src/async-target.js', '');

      // fetchData 在第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/async-source.js')}:1`, fixture.getFilePath('src/async-target.js'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/async-target.js'), 'utf-8') as string;
      expect(targetContent).toContain('async');
      expect(targetContent).toContain('fetchData');
    });
  });

  describe('跨檔案成員依賴', () => {
    it('移動依賴同檔案 sibling export 的函式，目標檔產生對應 import', async () => {
      await fixture.writeFile('src/math-source.js', [
        'export function add(a, b) {',
        '  return a + b;',
        '}',
        '',
        'export function double(x) {',
        '  return add(x, x);',
        '}',
      ].join('\n'));
      await fixture.writeFile('src/math-target.js', '');

      // double 在第 5 行，依賴 add（第 1 行）
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/math-source.js')}:5`, fixture.getFilePath('src/math-target.js'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/math-target.js'), 'utf-8') as string;
      // double 被移到目標
      expect(targetContent).toContain('double');
      // 目標應有 import add 語句
      expect(targetContent).toMatch(/import\s*\{[^}]*add[^}]*\}\s*from/);
    });

    it('多個 consumer 引用被移動成員，所有 import 都更新', async () => {
      await fixture.writeFile('src/shared-fn.js', [
        'export function shared() {',
        '  return "shared";',
        '}',
      ].join('\n'));
      await fixture.writeFile('src/consumer-a.js', [
        'import { shared } from \'./shared-fn.js\';',
        'export const a = shared();',
      ].join('\n'));
      await fixture.writeFile('src/consumer-b.js', [
        'import { shared } from \'./shared-fn.js\';',
        'export const b = shared();',
      ].join('\n'));
      await fixture.writeFile('src/new-home.js', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/shared-fn.js')}:1`, fixture.getFilePath('src/new-home.js'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // totalFiles 應包含 new-home + shared-fn + consumer-a + consumer-b
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(3);

      const consumerA = await fixture.memfs.readFile(fixture.getFilePath('src/consumer-a.js'), 'utf-8') as string;
      const consumerB = await fixture.memfs.readFile(fixture.getFilePath('src/consumer-b.js'), 'utf-8') as string;
      // import 路徑應指向新位置
      expect(consumerA).toMatch(/from ['"].*new-home/);
      expect(consumerB).toMatch(/from ['"].*new-home/);
    });

    it('移動一個成員不影響 consumer 中對其他成員的 import', async () => {
      await fixture.writeFile('src/multi-export.js', [
        'export function A() { return "A"; }',
        '',
        'export function B() { return "B"; }',
        '',
        'export function C() { return "C"; }',
      ].join('\n'));
      await fixture.writeFile('src/multi-consumer.js', [
        'import { A, B, C } from \'./multi-export.js\';',
        'export const result = A() + B() + C();',
      ].join('\n'));
      await fixture.writeFile('src/move-target-2.js', 'export function existing() {}\n');

      // B 在第 3 行，移動 B 到 target
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/multi-export.js')}:3`, fixture.getFilePath('src/move-target-2.js'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const consumerContent = await fixture.memfs.readFile(fixture.getFilePath('src/multi-consumer.js'), 'utf-8') as string;
      // B 的 import 應路由到 move-target-2
      expect(consumerContent).toMatch(/from ['"].*move-target-2/);
      // A、C 的 import 應仍指向 multi-export
      expect(consumerContent).toMatch(/from ['"].*multi-export/);
    });
  });

  describe('JSDoc 保留', () => {
    it('移動帶有 JSDoc 的 JS 函式，目標檔保留文件註解', async () => {
      await fixture.writeFile('src/documented.js', [
        '/**',
        ' * Formats a greeting message.',
        ' * @param {string} name - The person name',
        ' * @returns {string} A greeting string',
        ' */',
        'export function greet(name) {',
        '  return `Hello, ${name}!`;',
        '}',
        '',
        'export function farewell(name) {',
        '  return `Goodbye, ${name}!`;',
        '}',
      ].join('\n'));
      await fixture.writeFile('src/greetings.js', '');

      // greet 在第 6 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/documented.js')}:6`, fixture.getFilePath('src/greetings.js'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/greetings.js'), 'utf-8') as string;
      expect(targetContent).toContain('greet');
      // JSDoc 應保留在目標檔案中
      expect(targetContent).toContain('Formats a greeting');

      const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/documented.js'), 'utf-8') as string;
      // JSDoc 應從來源移除（非複製）
      expect(sourceContent).not.toContain('Formats a greeting');
    });
  });

  describe('名稱衝突偵測', () => {
    it('目標檔已有同名函式時應報錯', async () => {
      await fixture.writeFile('src/conflict-source.js', [
        'export function duplicate() {',
        '  return "source version";',
        '}',
      ].join('\n'));
      await fixture.writeFile('src/conflict-target.js', [
        'export function duplicate() {',
        '  return "target version";',
        '}',
      ].join('\n'));

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/conflict-source.js')}:1`, fixture.getFilePath('src/conflict-target.js'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
    });

    it('目標檔成員名稱不衝突時應正常移動（對照組）', async () => {
      await fixture.writeFile('src/no-conflict-source.js', [
        'export function foo() { return "foo"; }',
      ].join('\n'));
      await fixture.writeFile('src/no-conflict-target.js', [
        'export function bar() { return "bar"; }',
      ].join('\n'));

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/no-conflict-source.js')}:1`, fixture.getFilePath('src/no-conflict-target.js'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/no-conflict-target.js'), 'utf-8') as string;
      expect(targetContent).toContain('foo');
      expect(targetContent).toContain('bar');
    });
  });

  describe('--keep-reexport 實際行為', () => {
    it('--keep-reexport 後來源檔案應包含 re-export 語句', async () => {
      await fixture.writeFile('src/reexport-source.js', [
        'export function moved() {',
        '  return "I moved";',
        '}',
        '',
        'export function stays() {',
        '  return "I stay";',
        '}',
      ].join('\n'));
      await fixture.writeFile('src/reexport-target.js', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/reexport-source.js')}:1`, fixture.getFilePath('src/reexport-target.js'),
          '-p', fixture.rootPath, '--keep-reexport', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/reexport-source.js'), 'utf-8') as string;
      // 來源檔案應有 re-export 語句
      expect(sourceContent).toMatch(/export\s*\{[^}]*moved[^}]*\}\s*from/);

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/reexport-target.js'), 'utf-8') as string;
      expect(targetContent).toContain('moved');
    });
  });

  describe('邊界條件', () => {
    it('移動來源檔案的唯一 export 後，來源檔案不含該函式', async () => {
      await fixture.writeFile('src/single-export.js', [
        'export function only() {',
        '  return "only one";',
        '}',
      ].join('\n'));
      await fixture.writeFile('src/single-target.js', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/single-export.js')}:1`, fixture.getFilePath('src/single-target.js'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/single-export.js'), 'utf-8') as string;
      expect(sourceContent).not.toContain('function only');

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/single-target.js'), 'utf-8') as string;
      expect(targetContent).toContain('only');
    });

    it('consumer 引用唯一 export，移動後 consumer import 路徑更新', async () => {
      await fixture.writeFile('src/sole.js', 'export function sole() {}\n');
      await fixture.writeFile('src/sole-consumer.js', [
        'import { sole } from \'./sole.js\';',
        'sole();',
      ].join('\n'));
      await fixture.writeFile('src/sole-dest.js', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/sole.js')}:1`, fixture.getFilePath('src/sole-dest.js'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const consumerContent = await fixture.memfs.readFile(fixture.getFilePath('src/sole-consumer.js'), 'utf-8') as string;
      expect(consumerContent).toMatch(/from ['"].*sole-dest/);
    });

    it('移動多行 const 物件後目標檔包含完整定義', async () => {
      await fixture.writeFile('src/config-source.js', [
        'export const CONFIG = {',
        '  host: \'localhost\',',
        '  port: 3000,',
        '  debug: true,',
        '};',
        '',
        'export const OTHER = \'other\';',
      ].join('\n'));
      await fixture.writeFile('src/config-dest.js', '');

      // CONFIG 在第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/config-source.js')}:1`, fixture.getFilePath('src/config-dest.js'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/config-dest.js'), 'utf-8') as string;
      expect(targetContent).toContain('CONFIG');
      expect(targetContent).toContain('localhost');
      expect(targetContent).toContain('port: 3000');

      const configSourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/config-source.js'), 'utf-8') as string;
      // CONFIG 應從來源移除
      expect(configSourceContent).not.toContain('const CONFIG');
      // OTHER 應留在來源
      expect(configSourceContent).toContain('OTHER');
    });
  });

  describe('輸出結構驗證', () => {
    it('JSON 輸出應包含 command 和 summary 欄位', async () => {
      await fixture.writeFile('src/out-source.js', 'export function fn() {}\n');
      await fixture.writeFile('src/out-target.js', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/out-source.js')}:1`, fixture.getFilePath('src/out-target.js'),
          '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
      expect(typeof output.summary.totalFiles).toBe('number');
    });

    it('diff 格式輸出不為空', async () => {
      await fixture.writeFile('src/diff-source.js', 'export function diffFn() {}\n');
      await fixture.writeFile('src/diff-target.js', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/diff-source.js')}:1`, fixture.getFilePath('src/diff-target.js'),
          '-p', fixture.rootPath, '--dry-run', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      // diff 格式應包含新增/刪除行標記
      expect(result.stdout).toMatch(/^[+-]/m);
      expect(result.stdout).toContain('diffFn');
    });
  });

  describe('使用 fixture 現有成員', () => {
    it('應該移動 fixture 中 utils.js 的 formatName 函式', async () => {
      await fixture.writeFile('src/format-target.js', '');

      // formatName 在 utils.js 第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/utils.js')}:1`, fixture.getFilePath('src/format-target.js'),
          '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });
});
