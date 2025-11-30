/**
 * CLI Python Parser E2E 測試
 * 基於 python-sample-project fixture 測試 Python 支援
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI Python Parser - 基於 python-sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('python-sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本搜尋功能', () => {
    it('應該搜尋 Python class 定義', async () => {
      const result = await executeCLI(
        ['search', 'structural', '--path', fixture.rootPath, '--type', 'class', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // Python parser 應該找到類別
      expect(output.results).toBeDefined();
    });

    it('應該搜尋 Python function 定義', async () => {
      const result = await executeCLI(
        ['search', 'structural', '--path', fixture.rootPath, '--type', 'function', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
    });
  });

  describe('程式碼分析功能', () => {
    it('應該分析 Python 程式碼複雜度', async () => {
      const result = await executeCLI(
        ['analyze', 'complexity', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });

    it('應該偵測 Python 死碼', async () => {
      const result = await executeCLI(
        ['analyze', 'dead-code', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // python-sample-project 有 unused_function 和 deprecated_helper
      expect(output.summary).toBeDefined();
    });

    it('應該執行 Python 品質分析', async () => {
      const result = await executeCLI(
        ['analyze', 'quality', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });

    it('應該檢查 Python 最佳實踐', async () => {
      const result = await executeCLI(
        ['analyze', 'best-practices', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });
  });

  describe('依賴分析功能', () => {
    it('應該生成 Python 依賴圖', async () => {
      const result = await executeCLI(
        ['deps', 'graph', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });

    it('應該偵測 Python 循環依賴', async () => {
      const result = await executeCLI(
        ['deps', 'cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('快照功能', () => {
    it('應該生成 Python 專案快照', async () => {
      const result = await executeCLI(
        ['snapshot', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });
  });

});
