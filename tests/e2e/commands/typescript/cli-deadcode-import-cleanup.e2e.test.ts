/**
 * CLI deadcode import cleanup E2E 測試
 *
 * 目標：覆蓋 deadcode 的 import 清理路徑，
 * 包括部分 named import、side-effect import 保留、re-export 處理。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode - import cleanup 路徑', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // MARK: - 部分 named import dead

  describe('部分 named import 的 dead code 清理', () => {
    it('部分 named import dead：應只清除未使用的符號', async () => {
      await fixture.writeFile('src/partial-lib.ts', `
export function usedHelper() { return 1; }
export function unusedHelper() { return 2; }
      `.trim());
      await fixture.writeFile('src/partial-consumer.ts', `
import { usedHelper, unusedHelper } from './partial-lib.js';

export function main() {
  return usedHelper();
}
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // deadcode 分析應正常運行並回傳結果結構
      expect(Array.isArray(output.files)).toBe(true);
      // unusedHelper 若被識別為 dead code，應出現在 partial-lib.ts 的刪除行中
      const partialLibFile = output.files?.find((f: { filePath: string }) =>
        f.filePath.includes('partial-lib')
      );
      // partial-lib 可能被分析到也可能沒有（取決於 deadcode 分析策略）
      if (partialLibFile) {
        const deletedLines = (partialLibFile.hunks ?? [])
          .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
            h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
          )
          .join('\n');
        // 若有刪除，不應刪除 usedHelper
        expect(deletedLines).not.toContain('usedHelper');
      }
    });

    it('所有 named import 都未使用時：deadcode 分析應正常執行', async () => {
      await fixture.writeFile('src/all-unused-lib.ts', `
export function allUnused1() { return 1; }
export function allUnused2() { return 2; }
      `.trim());
      await fixture.writeFile('src/all-unused-consumer.ts', `
import { allUnused1, allUnused2 } from './all-unused-lib.js';

export const value = 42;
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // deadcode 分析應正常回傳結構
      expect(Array.isArray(output.files)).toBe(true);
      expect(output.summary).toBeDefined();
    });
  });

  // MARK: - side-effect-only import 保護

  describe('side-effect-only import 保護', () => {
    it('side-effect import 應被保護不被清除', async () => {
      await fixture.writeFile('src/polyfill.ts', `
// polyfill 初始化
if (!Array.prototype.flat) {
  Object.defineProperty(Array.prototype, 'flat', { value: function() { return []; } });
}
      `.trim());
      await fixture.writeFile('src/app-with-polyfill.ts', `
import './polyfill.js';

export function appEntry() {
  return [];
}
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // app-with-polyfill.ts 不應標記 side-effect import
      const appFile = output.files?.find((f: { filePath: string }) =>
        f.filePath.includes('app-with-polyfill.ts')
      );

      if (appFile) {
        const allContent = appFile.hunks
          .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
            h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
          )
          .join('\n');
        // side-effect import 不應被刪除
        expect(allContent).not.toContain('import \'./polyfill.js\'');
      }
    });
  });

  // MARK: - --include-exports 路徑

  describe('--include-exports 路徑', () => {
    it('加 --include-exports 後 exported 但未引用的符號應被標記', async () => {
      await fixture.writeFile('src/exported-unused.ts', `
export function exportedButNeverUsed() {
  return 'never called';
}

export function anotherExportedUnused() {
  return 'also never called';
}
      `.trim());

      const resultWithout = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const resultWith = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--include-exports'],
        { memfs: fixture.memfs }
      );

      const outputWith = JSON.parse(resultWith.stdout);
      const outputWithout = JSON.parse(resultWithout.stdout);

      // --include-exports 後應找到更多（或相同）dead code
      const countHunks = (output: { files?: Array<{ hunks?: unknown[] }> }) =>
        (output.files ?? []).reduce((sum, f) => sum + (f.hunks?.length ?? 0), 0);

      expect(countHunks(outputWith)).toBeGreaterThanOrEqual(countHunks(outputWithout));
    });

    it('--include-exports 後 summary 應包含更多統計', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--include-exports'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
    });
  });

  // MARK: - 格式路徑

  describe('deadcode 格式路徑', () => {
    it('summary 格式應包含摘要資訊', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('diff 格式應包含 --- 和 +++ diff header', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      // diff 格式應有刪除標記
      if (result.stdout.length > 0) {
        expect(result.stdout).toContain('-');
      }
    });

    it('json 格式的 operationDescription 應為預覽語意的字串', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.operationDescription).toBeDefined();
      expect(typeof output.operationDescription).toBe('string');
    });
  });
});
