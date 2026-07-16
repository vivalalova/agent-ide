/**
 * deadcode 命令 E2E 測試
 * 基於 deadcode-autofix fixture
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode - 基於 deadcode-autofix fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('deadcode-autofix');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該產生正確的 diff 預覽', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      // diff 格式應該包含刪除標記
      expect(result.stdout).toContain('-');
      // 應該提示加上 --apply 才會實際刪除
      expect(result.stdout).toContain('--apply');
    });

    it('應該輸出 JSON 格式預覽', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('deadcode-removal');
      expect(output.success).toBe(true);
      expect(output.files).toBeDefined();
      expect(output.previewOnly).toBe(true);
      expect(output.applied).toBe(false);
      expect(output.mode).toBe('preview');
    });

    it('應該檢測到 deadcode.ts 中的 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      // 檢查 fileSummaries 中是否包含 deadcode.ts
      const hasDeadcodeFile = output.files?.some((file: { filePath: string }) =>
        file.filePath.includes('deadcode.ts')
      );
      expect(hasDeadcodeFile).toBe(true);
    });
  });

  describe('dry-run 行為', () => {
    it('--dry-run 模式不應修改檔案', async () => {
      // 讀取原始內容
      const originalContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/deadcode.ts`,
        'utf-8'
      );

      // 執行 dry-run
      await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run'],
        { memfs: fixture.memfs }
      );

      // 檔案應該沒有變動
      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/deadcode.ts`,
        'utf-8'
      );
      expect(afterContent).toBe(originalContent);
    });

    it('預設應該只預覽 dead code，不修改檔案', async () => {
      const originalContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/deadcode.ts`,
        'utf-8'
      );
      expect(originalContent).toContain('unusedFunction');

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.previewOnly).toBe(true);
      expect(output.applied).toBe(false);
      expect(output.mode).toBe('preview');

      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/deadcode.ts`,
        'utf-8'
      );
      expect(afterContent).toBe(originalContent);
    });

    it('--apply 應該實際刪除 dead code', async () => {
      // 讀取原始內容，確認包含 unusedFunction
      const originalContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/deadcode.ts`,
        'utf-8'
      );
      expect(originalContent).toContain('unusedFunction');

      // 執行實際刪除（需明確 --apply）
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.previewOnly).toBe(false);
      expect(output.applied).toBe(true);
      expect(output.mode).toBe('apply');

      // 檔案應該被修改
      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/deadcode.ts`,
        'utf-8'
      );

      // unusedFunction 應該被刪除
      expect(afterContent).not.toContain('function unusedFunction');
    });

    it('--dry-run 應該覆蓋 --apply，不修改檔案', async () => {
      const originalContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/deadcode.ts`,
        'utf-8'
      );

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--apply', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.previewOnly).toBe(true);
      expect(output.applied).toBe(false);
      expect(output.mode).toBe('preview');

      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/deadcode.ts`,
        'utf-8'
      );
      expect(afterContent).toBe(originalContent);
    });
  });

  describe('排除機制', () => {
    it('--exclude 應該排除指定符號', async () => {
      // 不排除 unusedFunction
      const resultWithout = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );
      const outputWithout = JSON.parse(resultWithout.stdout);

      // 排除 unusedFunction
      const resultWith = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--exclude', 'unusedFunction', '--format', 'json'],
        { memfs: fixture.memfs }
      );
      const outputWith = JSON.parse(resultWith.stdout);

      // 排除後應該有較少的 files 或 hunks
      const countHunks = (output: { files?: Array<{ hunks?: unknown[] }> }) =>
        output.files?.reduce((sum, f) => sum + (f.hunks?.length ?? 0), 0) ?? 0;

      expect(countHunks(outputWith)).toBeLessThanOrEqual(countHunks(outputWithout));
    });

    it('--apply 且所有 dead code 被排除時 JSON 應保留 apply mode', async () => {
      const result = await executeCLI(
        [
          'deadcode',
          '--path', fixture.rootPath,
          '--apply',
          '--exclude',
          'unusedFunction',
          'helperFunction',
          'UnusedClass',
          'unusedVariable',
          'UnusedInterface',
          'UnusedType',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.files?.length ?? 0).toBe(0);
      expect(output.previewOnly).toBe(false);
      // M9（audit-fix-m9-deadcode-apply-zero）：零 removals 時 applied 不得綁死 willApply，
      // 實際未寫入任何變更 → applied 應為 false；mode 仍保留 'apply' 表示這是 apply 模式的執行
      expect(output.applied).toBe(false);
      expect(output.mode).toBe('apply');
    });
  });

  describe('main 符號保護', () => {
    it('main 函式不應該被刪除', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--apply'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      // main.ts 中的 main 函式應該保留
      const content = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/main.ts`,
        'utf-8'
      );
      expect(content).toContain('function main');
    });
  });

  describe('錯誤處理', () => {
    it('無效路徑應該回報錯誤', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', '/non/existent/path'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      // 錯誤訊息可能在 stdout 或 stderr
      const output = result.stdout + result.stderr;
      expect(output).toContain('不存在');
    });
  });

  describe('無 dead code 情境', () => {
    it('沒有 dead code 時應正常結束', async () => {
      // 先刪除所有 dead code
      await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--apply'],
        { memfs: fixture.memfs }
      );

      // 再次執行應該沒有東西可刪
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      // 應該顯示沒有 dead code 或 files 為空
      const output = JSON.parse(result.stdout);
      expect(output.files?.length ?? 0).toBe(0);
    });

    it('--apply 在沒有 dead code 時 JSON 應保留 apply mode', async () => {
      // 先刪除所有 dead code
      await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--apply'],
        { memfs: fixture.memfs }
      );

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.files?.length ?? 0).toBe(0);
      expect(output.previewOnly).toBe(false);
      // M9（audit-fix-m9-deadcode-apply-zero）：同上，零 removals 時 applied 應為 false
      expect(output.applied).toBe(false);
      expect(output.mode).toBe('apply');
    });
  });

  describe('summary 摘要', () => {
    it('應該顯示刪除統計', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
      expect(output.summary.totalChanges).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GitHub #32 Bug 4 - JSDoc 和註解刪除', () => {
    it('刪除 dead code 時應該一併刪除 JSDoc 註解', async () => {
      const originalContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/deadcode.ts`,
        'utf-8'
      );

      expect(originalContent).toContain('function unusedFunction');
      expect(originalContent).toContain('@param x 輸入參數');
      expect(originalContent).toContain('@returns 計算結果');

      const result = await executeCLI(['deadcode', '--path', fixture.rootPath, '--apply'], { memfs: fixture.memfs });
      expect(result.exitCode).toBe(0);

      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/deadcode.ts`,
        'utf-8'
      );

      expect(afterContent).not.toContain('function unusedFunction');
      expect(afterContent).not.toContain('@param x 輸入參數');
      expect(afterContent).not.toContain('@returns 計算結果');
      expect(afterContent).not.toContain('未使用的函式 - 應該被刪除');
    });

    it('刪除 dead code 時不應留下孤立的 JSDoc', async () => {
      const result = await executeCLI(['deadcode', '--path', fixture.rootPath, '--apply'], { memfs: fixture.memfs });
      expect(result.exitCode).toBe(0);

      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/deadcode.ts`,
        'utf-8'
      );

      const lines = afterContent.split('\n');
      let foundFirstJsDoc = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('/**')) {
          if (!foundFirstJsDoc) {
            foundFirstJsDoc = true;
            while (i < lines.length && !lines[i].trim().endsWith('*/')) {
              i++;
            }
            continue;
          }

          let endIndex = i;
          while (endIndex < lines.length && !lines[endIndex].trim().endsWith('*/')) {
            endIndex++;
          }

          let nextLineIndex = endIndex + 1;
          while (nextLineIndex < lines.length && lines[nextLineIndex].trim() === '') {
            nextLineIndex++;
          }

          const nextLine = lines[nextLineIndex]?.trim() || '';
          const isDeclaration =
            nextLine.includes('function ') ||
            nextLine.includes('class ') ||
            nextLine.includes('const ') ||
            nextLine.includes('let ') ||
            nextLine.includes('interface ') ||
            nextLine.includes('type ') ||
            nextLine.includes('export ') ||
            nextLine.startsWith('@');

          expect(isDeclaration).toBe(true);
        }
      }
    });
  });
});
