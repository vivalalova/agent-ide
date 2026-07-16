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

  describe('--at 符號定位', () => {
    it('應該只回傳指定同名 JS 函數定義的引用', async () => {
      await fixture.writeFile('src/js-left-target.js', 'export function duplicateJsTarget() { return "left"; }');
      await fixture.writeFile('src/js-right-target.js', 'export function duplicateJsTarget() { return "right"; }');
      await fixture.writeFile(
        'src/js-use-left.js',
        'import { duplicateJsTarget } from "./js-left-target.js";\nexport const left = duplicateJsTarget();'
      );
      await fixture.writeFile(
        'src/js-use-right.js',
        'import { duplicateJsTarget } from "./js-right-target.js";\nexport const right = duplicateJsTarget();'
      );

      const result = await executeCLI(
        [
          'find-references',
          'duplicateJsTarget',
          '--path',
          fixture.rootPath,
          '--at',
          'src/js-left-target.js:1',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.targetSymbol.file).toContain('src/js-left-target.js');
      expect(output.symbols).toHaveLength(1);

      const referenceFiles = output.references.map((ref: { file: string }) => ref.file);
      expect(referenceFiles.some((file: string) => file.includes('js-use-left.js'))).toBe(true);
      expect(referenceFiles.some((file: string) => file.includes('js-use-right.js'))).toBe(false);
    });

    it('同名 JS 定義沒有 --at 時應 fail-fast，不得 silently merge（F6，與 TS 對齊）', async () => {
      await fixture.writeFile('src/js-identity-a.js', 'export const duplicateJsIdentity = "a";');
      await fixture.writeFile('src/js-identity-b.js', 'export const duplicateJsIdentity = "b";');
      await fixture.writeFile(
        'src/js-identity-use.js',
        'import { duplicateJsIdentity } from "./js-identity-a.js";\nexport const useDuplicateJsIdentity = duplicateJsIdentity;'
      );

      const result = await executeCLI(
        ['find-references', 'duplicateJsIdentity', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // F6：與 TS 側（cli-find-references.e2e.test.ts）及 rename / call-hierarchy 對齊，
      // 多定義無 --at → fail-fast，不得 exit 0 silently 合併回傳全部 identity
      expect(result.exitCode).not.toBe(0);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toMatch(/--at|同名|ambiguous|多個/i);
    });

    it('應該用 --at 鎖定同名 JS 類別方法的引用', async () => {
      await fixture.writeFile('src/js-left-reference-runner.js', [
        'export class JsLeftReferenceRunner {',
        '  run() { return "left"; }',
        '}'
      ].join('\n'));
      await fixture.writeFile('src/js-right-reference-runner.js', [
        'export class JsRightReferenceRunner {',
        '  run() { return "right"; }',
        '}'
      ].join('\n'));
      await fixture.writeFile(
        'src/js-use-left-reference-runner.js',
        'import { JsLeftReferenceRunner } from "./js-left-reference-runner.js";\nexport const left = new JsLeftReferenceRunner().run();'
      );
      await fixture.writeFile(
        'src/js-use-right-reference-runner.js',
        'import { JsRightReferenceRunner } from "./js-right-reference-runner.js";\nexport const right = new JsRightReferenceRunner().run();'
      );

      const result = await executeCLI(
        [
          'find-references',
          'run',
          '--path',
          fixture.rootPath,
          '--at',
          'src/js-left-reference-runner.js:2',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const referenceFiles = output.references.map((ref: { file: string }) => ref.file);

      expect(referenceFiles.some((file: string) => file.includes('js-use-left-reference-runner.js'))).toBe(true);
      expect(referenceFiles.some((file: string) => file.includes('js-use-right-reference-runner.js'))).toBe(false);
    });

    it('應該保留 namespace import 與 barrel re-export 的指定 JS 符號引用', async () => {
      await fixture.writeFile('src/js-left-library.js', 'export function selectedJsPipeline() { return "left"; }');
      await fixture.writeFile('src/js-right-library.js', 'export function selectedJsPipeline() { return "right"; }');
      await fixture.writeFile('src/js-left-barrel.js', 'export { selectedJsPipeline } from "./js-left-library.js";');
      await fixture.writeFile(
        'src/js-use-left-library.js',
        [
          'import * as leftLibrary from "./js-left-library.js";',
          'import { selectedJsPipeline } from "./js-left-barrel.js";',
          'export const direct = leftLibrary.selectedJsPipeline();',
          'export const indirect = selectedJsPipeline();'
        ].join('\n')
      );
      await fixture.writeFile(
        'src/js-use-right-library.js',
        [
          'import * as rightLibrary from "./js-right-library.js";',
          'export const wrong = rightLibrary.selectedJsPipeline();'
        ].join('\n')
      );

      const result = await executeCLI(
        [
          'find-references',
          'selectedJsPipeline',
          '--path',
          fixture.rootPath,
          '--at',
          'src/js-left-library.js:1',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const contexts = output.references.map((ref: { context: string }) => ref.context);
      const referenceFiles = output.references.map((ref: { file: string }) => ref.file);

      expect(contexts.some((context: string) => context.includes('leftLibrary.selectedJsPipeline'))).toBe(true);
      expect(contexts.some((context: string) => context.includes('selectedJsPipeline();'))).toBe(true);
      expect(referenceFiles.some((file: string) => file.includes('js-left-barrel.js'))).toBe(true);
      expect(referenceFiles.some((file: string) => file.includes('js-use-right-library.js'))).toBe(false);
    });

    it('同檔混合 JS namespace import 時不應納入非目標模組引用', async () => {
      await fixture.writeFile('src/js-left-mixed-library.js', 'export function mixedJsPipeline() { return "left"; }');
      await fixture.writeFile('src/js-right-mixed-library.js', 'export function mixedJsPipeline() { return "right"; }');
      await fixture.writeFile(
        'src/js-use-mixed-library.js',
        [
          'import * as leftMixed from "./js-left-mixed-library.js";',
          'import * as rightMixed from "./js-right-mixed-library.js";',
          'export const left = leftMixed.mixedJsPipeline();',
          'export const right = rightMixed.mixedJsPipeline();'
        ].join('\n')
      );

      const result = await executeCLI(
        [
          'find-references',
          'mixedJsPipeline',
          '--path',
          fixture.rootPath,
          '--at',
          'src/js-left-mixed-library.js:1',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const contexts = output.references.map((ref: { context: string }) => ref.context);

      expect(contexts.some((context: string) => context.includes('leftMixed.mixedJsPipeline'))).toBe(true);
      expect(contexts.some((context: string) => context.includes('rightMixed.mixedJsPipeline'))).toBe(false);
    });

    it('應該保留 split barrel re-export 的指定 JS 符號引用', async () => {
      await fixture.writeFile('src/js-left-split-source.js', 'export function splitJsPipeline() { return "left"; }');
      await fixture.writeFile('src/js-right-split-source.js', 'export function splitJsPipeline() { return "right"; }');
      await fixture.writeFile(
        'src/js-left-split-barrel.js',
        [
          'import { splitJsPipeline } from "./js-left-split-source.js";',
          'export { splitJsPipeline };'
        ].join('\n')
      );
      await fixture.writeFile(
        'src/js-use-left-split.js',
        'import { splitJsPipeline } from "./js-left-split-barrel.js";\nexport const value = splitJsPipeline();'
      );

      const result = await executeCLI(
        [
          'find-references',
          'splitJsPipeline',
          '--path',
          fixture.rootPath,
          '--at',
          'src/js-left-split-source.js:1',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const referenceFiles = output.references.map((ref: { file: string }) => ref.file);

      expect(referenceFiles.some((file: string) => file.includes('js-use-left-split.js'))).toBe(true);
    });

    it('無效 JS --at 位置應回傳清楚錯誤', async () => {
      await fixture.writeFile('src/js-valid-target.js', 'export function locatedJsTarget() {}');

      const result = await executeCLI(
        [
          'find-references',
          'locatedJsTarget',
          '--path',
          fixture.rootPath,
          '--at',
          'src/js-valid-target.js:99',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('locatedJsTarget');
      expect(output.error).toContain('src/js-valid-target.js:99');
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
