/**
 * CLI 輸出契約測試
 *
 * 1. call-hierarchy outgoing 項目：method call 帶 `receiver`，free call 不帶。
 * 2. 非 JSON 格式下，進度訊息（outputProgress）一律走 stderr；stdout 只含
 *    最終結果（json 格式下 stdout 須是合法 JSON；json 格式本身完全不輸出進度訊息，
 *    見 command-utils.ts outputProgress：`format !== Json` 才寫 stderr）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI 輸出契約 - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('call-hierarchy outgoing receiver 欄位', () => {
    beforeEach(async () => {
      await fixture.writeFile(
        'src/output-contract/ch-mixed.ts',
        [
          'export function freeFn(): number {',
          '  return 1;',
          '}',
          '',
          'export class Helper {',
          '  method(): number {',
          '    return 2;',
          '  }',
          '}',
          '',
          'export function mixedCalls(): number {',
          '  const helper = new Helper();',
          '  return helper.method() + freeFn();',
          '}',
          ''
        ].join('\n')
      );
    });

    it('method call 項目帶 receiver，free call 項目無 receiver 欄位（json 格式）', async () => {
      const result = await executeCLI(
        [
          'call-hierarchy', 'mixedCalls',
          '--at', 'src/output-contract/ch-mixed.ts:11:17',
          '--direction', 'outgoing',
          '--path', fixture.rootPath, '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const methodCallItem = output.outgoing.find((item: { callee: string }) => item.callee === 'method');
      const freeCallItem = output.outgoing.find((item: { callee: string }) => item.callee === 'freeFn');

      expect(methodCallItem).toBeDefined();
      expect(methodCallItem.receiver).toBe('helper');

      expect(freeCallItem).toBeDefined();
      expect(Object.prototype.hasOwnProperty.call(freeCallItem, 'receiver')).toBe(false);
    });

    it('summary 格式輸出含 `<receiver>.<callee>`', async () => {
      const result = await executeCLI(
        [
          'call-hierarchy', 'mixedCalls',
          '--at', 'src/output-contract/ch-mixed.ts:11:17',
          '--direction', 'outgoing',
          '--path', fixture.rootPath, '--format', 'summary'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('helper.method');
    });
  });

  describe('非 JSON 模式進度訊息走 stderr、stdout 只含結果', () => {
    it('cycles --format summary：stdout 不含「循環依賴分析」，stderr 含', async () => {
      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('循環依賴分析');
      expect(result.stderr).toContain('循環依賴分析');
    });

    it('cycles --format json：stdout 可 JSON.parse 且不含進度文字', async () => {
      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      expect(result.stdout).not.toContain('循環依賴分析');
    });

    it('find-references --format summary：stdout 不含查找進度文字，stderr 含', async () => {
      const result = await executeCLI(
        ['find-references', 'validateEmail', '--at', 'src/utils/validator.ts:8:17', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('🔍 查找符號引用: validateEmail...');
      expect(result.stderr).toContain('🔍 查找符號引用: validateEmail...');
    });

    it('find-references --format json：stdout 可 JSON.parse 且不含進度文字', async () => {
      const result = await executeCLI(
        ['find-references', 'validateEmail', '--at', 'src/utils/validator.ts:8:17', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      expect(result.stdout).not.toContain('🔍 查找符號引用');
    });

    it('move --dry-run --format diff：stdout 不含移動進度文字，stderr 含', async () => {
      const source = 'src/utils/date-utils.ts';
      const target = 'src/utils/date-utils-moved.ts';
      const progressText = `   ${source}   ${target}`;

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain(progressText);
      expect(result.stderr).toContain(progressText);
    });

    it('move --dry-run --format json：stdout 可 JSON.parse 且不含移動進度文字', async () => {
      const source = 'src/utils/date-utils.ts';
      const target = 'src/utils/date-utils-moved.ts';
      const progressText = `   ${source}   ${target}`;

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      expect(result.stdout).not.toContain(progressText);
    });
  });
});
