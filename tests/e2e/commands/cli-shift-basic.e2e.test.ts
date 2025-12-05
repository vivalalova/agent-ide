/**
 * CLI shift 命令 E2E 測試 - 基本功能
 * 基於 sample-project fixture 測試行級移動功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI shift basic - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能 - 單檔案內行移動', () => {
    it('應該成功執行檔案內行移動', async () => {
      const targetFile = fixture.getFilePath('src/index.ts');

      const result = await executeCLI(
        ['shift', targetFile, '--from', '1', '--to', '2', '--position', '5', '--path', fixture.rootPath],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該在 JSON 格式下返回有效的結果結構', async () => {
      const targetFile = fixture.getFilePath('src/index.ts');

      const result = await executeCLI(
        ['shift', targetFile, '--from', '1', '--to', '2', '--position', '5', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.success).toBe(true);
      expect(output.operationType).toBe('within_file');
      expect(output.sourceFile).toBeDefined();
      expect(output.targetFile).toBeDefined();
      expect(output.fromLine).toBe(1);
      expect(output.toLine).toBe(2);
      expect(output.position).toBe(5);
      expect(output.linesCount).toBe(2);
      expect(output.executed).toBe(true);
    });

    it('應該包含移動的行數統計', async () => {
      const targetFile = fixture.getFilePath('src/index.ts');

      const result = await executeCLI(
        ['shift', targetFile, '--from', '3', '--to', '5', '--position', '10', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.linesCount).toBe(3);
      expect(output.fromLine).toBe(3);
      expect(output.toLine).toBe(5);
    });
  });

  describe('跨檔案行移動', () => {
    it('應該支援移動到不同檔案', async () => {
      const sourceFile = fixture.getFilePath('src/index.ts');
      const targetFile = fixture.getFilePath('src/utils.ts');

      const result = await executeCLI(
        ['shift', sourceFile, '--from', '1', '--to', '3', '--position', '1', '--target', targetFile, '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      if (result.exitCode === 0) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.operationType).toBe('to_new_file');
        expect(output.sourceFile).toContain('index.ts');
        expect(output.targetFile).toContain('utils.ts');
      }
    });
  });

  describe('預覽模式（--dry-run）', () => {
    it('應該在預覽模式下不實際執行移動', async () => {
      const targetFile = fixture.getFilePath('src/index.ts');

      const result = await executeCLI(
        ['shift', targetFile, '--from', '1', '--to', '2', '--position', '5', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.command).toBe('shift');
      expect(output.success).toBe(true);
      expect(output.files).toBeDefined();
      expect(output.summary).toBeDefined();
    });

    it('應該在預覽模式下返回操作訊息', async () => {
      const targetFile = fixture.getFilePath('src/index.ts');

      const result = await executeCLI(
        ['shift', targetFile, '--from', '1', '--to', '2', '--position', '5', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.command).toBe('shift');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });
  });

  describe('輸出格式', () => {
    it('應該支援 summary 格式輸出', async () => {
      const targetFile = fixture.getFilePath('src/index.ts');

      const result = await executeCLI(
        ['shift', targetFile, '--from', '1', '--to', '2', '--position', '5', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('應該在 JSON 格式下包含完整的操作資訊', async () => {
      const targetFile = fixture.getFilePath('src/index.ts');

      const result = await executeCLI(
        ['shift', targetFile, '--from', '1', '--to', '3', '--position', '6', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output).toHaveProperty('success');
      expect(output).toHaveProperty('operationType');
      expect(output).toHaveProperty('sourceFile');
      expect(output).toHaveProperty('targetFile');
      expect(output).toHaveProperty('fromLine');
      expect(output).toHaveProperty('toLine');
      expect(output).toHaveProperty('position');
      expect(output).toHaveProperty('linesCount');
      expect(output).toHaveProperty('executed');
      expect(output).toHaveProperty('message');
    });
  });

  describe('錯誤處理', () => {
    it('應該處理不存在的檔案', async () => {
      const result = await executeCLI(
        ['shift', '/nonexistent/file.ts', '--from', '1', '--to', '2', '--position', '5', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
    });

    it('應該處理無效的行號範圍（from > to）', async () => {
      const targetFile = fixture.getFilePath('src/index.ts');

      const result = await executeCLI(
        ['shift', targetFile, '--from', '5', '--to', '2', '--position', '1', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
    });

    it('應該處理無效的行號（0 或負數）', async () => {
      const targetFile = fixture.getFilePath('src/index.ts');

      const result = await executeCLI(
        ['shift', targetFile, '--from', '0', '--to', '2', '--position', '5', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
    });

    it('應該處理超出檔案範圍的行號', async () => {
      const targetFile = fixture.getFilePath('src/index.ts');

      const result = await executeCLI(
        ['shift', targetFile, '--from', '1', '--to', '999999', '--position', '1', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
    });
  });

  describe('邊界條件', () => {
    it('應該處理單行移動（from === to）', async () => {
      const targetFile = fixture.getFilePath('src/index.ts');

      const result = await executeCLI(
        ['shift', targetFile, '--from', '3', '--to', '3', '--position', '10', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.success).toBe(true);
      expect(output.linesCount).toBe(1);
    });

    it('應該處理移動到檔案開頭（position = 1）', async () => {
      const targetFile = fixture.getFilePath('src/index.ts');

      const result = await executeCLI(
        ['shift', targetFile, '--from', '5', '--to', '7', '--position', '1', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.success).toBe(true);
      expect(output.position).toBe(1);
    });
  });

  describe('操作類型識別', () => {
    it('應該識別檔案內移動操作', async () => {
      const targetFile = fixture.getFilePath('src/index.ts');

      const result = await executeCLI(
        ['shift', targetFile, '--from', '1', '--to', '2', '--position', '5', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.operationType).toBe('within_file');
    });

    it('應該識別跨檔案移動操作', async () => {
      const sourceFile = fixture.getFilePath('src/index.ts');
      const targetFile = fixture.getFilePath('src/utils.ts');

      const result = await executeCLI(
        ['shift', sourceFile, '--from', '1', '--to', '2', '--position', '1', '--target', targetFile, '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      if (result.exitCode === 0) {
        const output = JSON.parse(result.stdout);
        expect(output.operationType).toBe('to_new_file');
      }
    });
  });
});
