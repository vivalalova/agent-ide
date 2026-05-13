/**
 * CLI change-signature 命令 E2E 測試 - 空 changeset 與錯誤分類
 *
 * 涵蓋 task: fix-change-signature-absolute-path
 * - reorder no-op 必須輸出「無實質變更」且 exit 0
 * - 函式不存在 → exit 1 + 「找不到函式」
 * - 檔案不存在 → exit 1 + 「檔案不存在」
 * - 有效 swap → dry-run 輸出 signature 變更 description
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';
import * as path from 'path';

describe('CLI change-signature - 空 changeset 與錯誤分類', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('reorder no-op（無實質變更）', () => {
    it('單參 createUser reorder "data" → exit 0、輸出含「無實質變更」且不得殘留 Summary 0 changes', async () => {
      const filePath = path.join(fixture.rootPath, 'src/services/user-service.ts');

      const result = await executeCLI(
        [
          'change-signature',
          '--file', filePath,
          '--function', 'createUser',
          '--path', fixture.rootPath,
          '--reorder', 'data',
          '--dry-run'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/無實質變更/);
      expect(result.stdout).not.toMatch(/Summary:\s*0 files,\s*0 changes/);
    });

    it('三參 truncate reorder 原順序 → exit 0、JSON 含 noop 標示', async () => {
      const filePath = path.join(fixture.rootPath, 'src/utils/string-utils.ts');

      const result = await executeCLI(
        [
          'change-signature',
          '--file', filePath,
          '--function', 'truncate',
          '--path', fixture.rootPath,
          '--reorder', 'str,maxLength,suffix',
          '--dry-run',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.noop).toBe(true);
      expect(output.message).toMatch(/無實質變更/);
    });
  });

  describe('函式不存在', () => {
    it('exit 1、JSON error 含「找不到函式」', async () => {
      const filePath = path.join(fixture.rootPath, 'src/services/user-service.ts');

      const result = await executeCLI(
        [
          'change-signature',
          '--file', filePath,
          '--function', 'nonExistentFunc',
          '--path', fixture.rootPath,
          '--reorder', 'a,b',
          '--dry-run',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).not.toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toMatch(/找不到函式/);
    });
  });

  describe('檔案不存在', () => {
    it('exit 1、JSON error 含「檔案不存在」', async () => {
      const filePath = path.join(fixture.rootPath, 'src/does-not-exist.ts');

      const result = await executeCLI(
        [
          'change-signature',
          '--file', filePath,
          '--function', 'anyFn',
          '--path', fixture.rootPath,
          '--reorder', 'a,b',
          '--dry-run',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).not.toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toMatch(/檔案不存在/);
    });
  });

  describe('有效 reorder（dry-run signature description）', () => {
    it('truncate swap maxLength,str,suffix → dry-run 輸出 Changed signature 行', async () => {
      const filePath = path.join(fixture.rootPath, 'src/utils/string-utils.ts');

      const result = await executeCLI(
        [
          'change-signature',
          '--file', filePath,
          '--function', 'truncate',
          '--path', fixture.rootPath,
          '--reorder', 'maxLength,str,suffix',
          '--dry-run'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Changed signature of truncate.*maxLength.*str.*suffix/);
    });

    it('truncate swap → JSON 含 signatureChange 欄位且 files 不空', async () => {
      const filePath = path.join(fixture.rootPath, 'src/utils/string-utils.ts');

      const result = await executeCLI(
        [
          'change-signature',
          '--file', filePath,
          '--function', 'truncate',
          '--path', fixture.rootPath,
          '--reorder', 'maxLength,str,suffix',
          '--dry-run',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.signatureChange).toBeDefined();
      expect(output.signatureChange.name).toBe('truncate');
      expect(output.signatureChange.before).toMatch(/str.*maxLength.*suffix/);
      expect(output.signatureChange.after).toMatch(/maxLength.*str.*suffix/);
      expect(Array.isArray(output.files)).toBe(true);
      expect(output.files.length).toBeGreaterThan(0);
    });
  });
});
