/**
 * CLI shift 命令 E2E 測試
 * 使用 sample-project fixture 進行真實場景測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from '../../helpers/fixture-manager';
import { executeCLI } from '../../helpers/cli-executor';

describe('CLI shift - 基於 sample-project fixture', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  describe('單檔案內行移動', () => {
    it('應該能在同一檔案內移動行', async () => {
      const filePath = fixture.getFilePath('src/utils/formatter.ts');
      const originalContent = await fixture.readFile('src/utils/formatter.ts');
      const originalLines = originalContent.split('\n');

      // 移動第 2-3 行到第 1 行之前
      const result = await executeCLI([
        'shift',
        filePath,
        '--from', '2',
        '--to', '3',
        '--position', '1'
      ], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('行移動成功');

      // 驗證檔案內容已變更
      const newContent = await fixture.readFile('src/utils/formatter.ts');
      const newLines = newContent.split('\n');

      // 原本的第 2-3 行現在應該在第 1-2 行的位置
      expect(newLines[0]).toBe(originalLines[1]);
      expect(newLines[1]).toBe(originalLines[2]);
    });

    it('應該能移動多行到檔案末尾', async () => {
      const filePath = fixture.getFilePath('src/utils/array-utils.ts');
      const originalContent = await fixture.readFile('src/utils/array-utils.ts');
      const totalLines = originalContent.split('\n').length;

      // 移動第 1-2 行到檔案末尾
      const result = await executeCLI([
        'shift',
        filePath,
        '--from', '1',
        '--to', '2',
        '--position', String(totalLines + 1)
      ], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('行移動成功');
    });

    it('應該支援預覽模式（不實際修改檔案）', async () => {
      const filePath = fixture.getFilePath('src/utils/string-utils.ts');
      const originalContent = await fixture.readFile('src/utils/string-utils.ts');

      const result = await executeCLI([
        'shift',
        filePath,
        '--from', '5',
        '--to', '7',
        '--position', '1',
        '--preview'
      ], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('預覽');

      // 驗證檔案內容未變更
      const newContent = await fixture.readFile('src/utils/string-utils.ts');
      expect(newContent).toBe(originalContent);
    });
  });

  describe('跨檔案行移動', () => {
    it('應該能將行移動到另一個已存在的檔案', async () => {
      const sourceFile = fixture.getFilePath('src/utils/formatter.ts');
      const targetFile = fixture.getFilePath('src/utils/array-utils.ts');

      const sourceContent = await fixture.readFile('src/utils/formatter.ts');
      const targetContent = await fixture.readFile('src/utils/array-utils.ts');
      const sourceLines = sourceContent.split('\n');

      // 移動第 2-4 行到目標檔案的第 1 行之前
      const result = await executeCLI([
        'shift',
        sourceFile,
        '--from', '2',
        '--to', '4',
        '--target', targetFile,
        '--position', '1'
      ], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('行移動成功');

      // 驗證來源檔案已移除指定行
      const newSourceContent = await fixture.readFile('src/utils/formatter.ts');
      const newSourceLines = newSourceContent.split('\n');
      expect(newSourceLines.length).toBe(sourceLines.length - 3);

      // 驗證目標檔案已插入行
      const newTargetContent = await fixture.readFile('src/utils/array-utils.ts');
      const newTargetLines = newTargetContent.split('\n');
      expect(newTargetLines[0]).toBe(sourceLines[1]);
      expect(newTargetLines[1]).toBe(sourceLines[2]);
      expect(newTargetLines[2]).toBe(sourceLines[3]);
    });

    it('應該能移動到新檔案（自動生成檔名）', async () => {
      const sourceFile = fixture.getFilePath('src/utils/formatter.ts');
      const targetBase = fixture.getFilePath('src/utils/newfile');

      const result = await executeCLI([
        'shift',
        sourceFile,
        '--from', '1',
        '--to', '3',
        '--target', targetBase,
        '--position', '1'
      ], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('行移動成功');

      // 驗證新檔案已建立（帶有來源檔案的副檔名）
      const newFileExists = await fixture.fileExists('src/utils/newfile.ts');
      expect(newFileExists).toBe(true);
    });

    it('應該處理檔名衝突（自動加數字後綴）', async () => {
      const sourceFile = fixture.getFilePath('src/utils/formatter.ts');
      const targetBase = fixture.getFilePath('src/utils/newfile');

      // 第一次移動 - 建立 newfile.ts
      await executeCLI([
        'shift',
        sourceFile,
        '--from', '1',
        '--to', '2',
        '--target', targetBase,
        '--position', '1'
      ], { cwd: fixture.tempPath });

      // 第二次移動 - 應該建立 newfile01.ts
      const result2 = await executeCLI([
        'shift',
        sourceFile,
        '--from', '1',
        '--to', '2',
        '--target', targetBase,
        '--position', '1'
      ], { cwd: fixture.tempPath });

      expect(result2.exitCode).toBe(0);

      // 驗證兩個檔案都存在
      expect(await fixture.fileExists('src/utils/newfile.ts')).toBe(true);
      expect(await fixture.fileExists('src/utils/newfile01.ts')).toBe(true);

      // 第三次移動 - 應該建立 newfile02.ts
      const result3 = await executeCLI([
        'shift',
        sourceFile,
        '--from', '1',
        '--to', '2',
        '--target', targetBase,
        '--position', '1'
      ], { cwd: fixture.tempPath });

      expect(result3.exitCode).toBe(0);
      expect(await fixture.fileExists('src/utils/newfile02.ts')).toBe(true);
    });
  });

  describe('輸出格式測試', () => {
    it('應該支援 JSON 輸出格式', async () => {
      const filePath = fixture.getFilePath('src/utils/formatter.ts');

      const result = await executeCLI([
        'shift',
        filePath,
        '--from', '1',
        '--to', '2',
        '--position', '5',
        '--format', 'json'
      ], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.fromLine).toBe(1);
      expect(output.toLine).toBe(2);
      expect(output.position).toBe(5);
      expect(output.linesCount).toBe(2);
    });

    it('應該在 plain 格式顯示統計資訊', async () => {
      const filePath = fixture.getFilePath('src/utils/array-utils.ts');

      const result = await executeCLI([
        'shift',
        filePath,
        '--from', '1',
        '--to', '3',
        '--position', '10',
        '--format', 'plain'
      ], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('統計');
      expect(result.stdout).toContain('3 行');
    });
  });

  describe('錯誤處理測試', () => {
    it('應該拒絕無效的行號範圍（起始行 > 結束行）', async () => {
      const filePath = fixture.getFilePath('src/utils/formatter.ts');

      const result = await executeCLI([
        'shift',
        filePath,
        '--from', '10',
        '--to', '5',
        '--position', '1'
      ], { cwd: fixture.tempPath });

      const output = result.stdout + result.stderr;
      expect(output).toContain('失敗');
    });

    it('應該拒絕超出範圍的行號', async () => {
      const filePath = fixture.getFilePath('src/utils/formatter.ts');

      const result = await executeCLI([
        'shift',
        filePath,
        '--from', '1000',
        '--to', '2000',
        '--position', '1'
      ], { cwd: fixture.tempPath });

      const output = result.stdout + result.stderr;
      expect(output).toContain('失敗');
    });

    it('應該拒絕無效的插入位置（< 1）', async () => {
      const filePath = fixture.getFilePath('src/utils/formatter.ts');

      const result = await executeCLI([
        'shift',
        filePath,
        '--from', '1',
        '--to', '2',
        '--position', '0'
      ], { cwd: fixture.tempPath });

      const output = result.stdout + result.stderr;
      expect(output).toContain('失敗');
    });

    it('應該處理來源檔案不存在的錯誤', async () => {
      const filePath = fixture.getFilePath('src/nonexistent.ts');

      const result = await executeCLI([
        'shift',
        filePath,
        '--from', '1',
        '--to', '2',
        '--position', '1'
      ], { cwd: fixture.tempPath });

      const output = result.stdout + result.stderr;
      expect(output).toContain('失敗');
    });

    it('應該拒絕非數字的行號參數', async () => {
      const filePath = fixture.getFilePath('src/utils/formatter.ts');

      const result = await executeCLI([
        'shift',
        filePath,
        '--from', 'abc',
        '--to', 'def',
        '--position', '1'
      ], { cwd: fixture.tempPath });

      const output = result.stdout + result.stderr;
      expect(output).toContain('必須為有效數字');
    });
  });

  describe('邊界條件測試', () => {
    it('應該能移動單行（from = to）', async () => {
      const filePath = fixture.getFilePath('src/utils/formatter.ts');
      const originalContent = await fixture.readFile('src/utils/formatter.ts');

      const result = await executeCLI([
        'shift',
        filePath,
        '--from', '5',
        '--to', '5',
        '--position', '1'
      ], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('移動了 1 行');
    });

    it('應該處理移動到範圍內的情況（no-op）', async () => {
      const filePath = fixture.getFilePath('src/utils/formatter.ts');
      const originalContent = await fixture.readFile('src/utils/formatter.ts');

      // 移動第 5-10 行到第 7 行（位於範圍內）
      const result = await executeCLI([
        'shift',
        filePath,
        '--from', '5',
        '--to', '10',
        '--position', '7'
      ], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toMatch(/無需移動|成功/);
    });
  });
});
