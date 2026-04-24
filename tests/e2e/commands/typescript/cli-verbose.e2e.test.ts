/**
 * CLI --verbose 旗標 E2E 測試
 * 驗證 verbose 模式輸出 indexing/cache 診斷資訊，且不污染 stdout
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI --verbose - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('verbose 模式輸出', () => {
    it('Given --verbose flag + search 命令，when 執行，then stderr 含 [indexer] 標記', async () => {
      const result = await executeCLI(
        ['--verbose', 'search', 'UserService', '--path', fixture.rootPath],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch(/\[indexer\]/);
    });

    it('Given --verbose flag + find-references 命令，when 執行，then stderr 含 cache 相關資訊', async () => {
      const result = await executeCLI(
        ['--verbose', 'find-references', 'UserService', '--path', fixture.rootPath],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      // cache disabled（test env）或 cache MISS 皆含 [cache] 標記
      expect(result.stderr).toMatch(/\[cache\]/);
    });

    it('Given --verbose flag，when 執行，then stdout 仍為有效 JSON（不污染 stdout）', async () => {
      const result = await executeCLI(
        ['--verbose', 'search', 'UserService', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('search');
      expect(output.success).toBe(true);
      expect(Array.isArray(output.results)).toBe(true);
      expect(output.results.some((item: { content: string }) => item.content.includes('UserService'))).toBe(true);
    });
  });

  describe('正常模式（無 --verbose）', () => {
    it('Given 無 --verbose flag，when 執行 search 命令，then stderr 不含 [indexer] / [cache] 標記', async () => {
      const result = await executeCLI(
        ['search', 'UserService', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toMatch(/\[indexer\]/);
      expect(result.stderr).not.toMatch(/\[cache\]/);
    });
  });
});
