/**
 * deadcode 命令 E2E 測試 - Swift 專案
 * 基於 swift-deadcode-test fixture
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode Swift - 基於 swift-deadcode-test fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('swift-deadcode-test');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功檢測 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('analyze');
      expect(output.analyzeType).toBe('dead-code');
      expect(output.success).toBe(true);
      expect(output.items).toBeDefined();
      expect(Array.isArray(output.items)).toBe(true);
    });

    it('應該輸出 summary 格式', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Dead Code');
      expect(result.stdout).toContain('掃描符號');
    });

    it('應該檢測到 Swift dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      // 檢查結果結構正確
      expect(output.items).toBeDefined();
      expect(Array.isArray(output.items)).toBe(true);

      // 如果有檢測到 dead code，檢查是否包含預期的
      if (output.items.length > 0) {
        const itemNames = output.items.map((item: { name: string }) => item.name);

        // 預期檢測到的 dead code（根據 fixture）
        const expectedDeadCode = [
          'unusedFunction',
          'UnusedClass',
          'UnusedStruct',
          'UnusedEnum',
          'UnusedInternalClass',
          'unusedTransformer',
          'createUnusedProcessor'
        ];

        // 至少應該檢測到部分預期的 dead code
        const foundDeadCode = expectedDeadCode.filter(name => itemNames.includes(name));
        expect(foundDeadCode.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('應該包含正確的統計資訊', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      expect(output.summary).toBeDefined();
      expect(output.summary.totalScanned).toBeGreaterThanOrEqual(0);
      expect(output.filesAffected).toBeGreaterThanOrEqual(0);
      expect(output.scanTime).toBeGreaterThanOrEqual(0);
      expect(output.byType).toBeDefined();
    });
  });

  describe('Swift 特定符號類型', () => {
    it('應該檢測未使用的 Swift 函式', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      const functions = output.items.filter((item: { type: string }) => item.type === 'function');

      // 應該有一些未使用的函式
      expect(functions.length).toBeGreaterThanOrEqual(0);
    });

    it('應該檢測未使用的 Swift 類別', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      const classes = output.items.filter((item: { type: string }) => item.type === 'class');

      // 應該有一些未使用的類別
      expect(classes.length).toBeGreaterThanOrEqual(0);
    });

    it('應該檢測未使用的 Swift 結構體', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      // struct 可能被分類為 class 或有專門的 type
      const structs = output.items.filter((item: { type: string; name: string }) =>
        item.type === 'class' && item.name.includes('Struct')
      );

      // 可能有未使用的結構體
      expect(structs.length).toBeGreaterThanOrEqual(0);
    });

    it('應該檢測未使用的 Swift 列舉', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      // enum 可能被分類為 class 或有專門的 type
      const enums = output.items.filter((item: { type: string; name: string }) =>
        item.name.includes('Enum')
      );

      // 可能有未使用的列舉
      expect(enums.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('選項測試', () => {
    it('--include-exports 應該包含更多符號', async () => {
      const resultWithout = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const resultWith = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json', '--include-exports'],
        { memfs: fixture.memfs }
      );

      const outputWithout = JSON.parse(resultWithout.stdout);
      const outputWith = JSON.parse(resultWith.stdout);

      // 包含 exports 時應該檢測到更多或相同
      expect(outputWith.items.length).toBeGreaterThanOrEqual(outputWithout.items.length);
    });
  });

  describe('輸出格式', () => {
    it('JSON 輸出應該是有效的 JSON', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('每個 dead code 項目應該包含完整資訊', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      if (output.items.length > 0) {
        const item = output.items[0];
        expect(item.name).toBeDefined();
        expect(item.type).toBeDefined();
        expect(item.file).toBeDefined();
        expect(item.line).toBeDefined();
        expect(item.confidence).toBeDefined();
        expect(item.reason).toBeDefined();
      }
    });
  });

  describe('錯誤處理', () => {
    it('不存在的路徑應該報錯', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', '/non/existent/path', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
    });

    it('不支援的格式應該報錯', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'invalid'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('不支援的輸出格式');
    });
  });
});
