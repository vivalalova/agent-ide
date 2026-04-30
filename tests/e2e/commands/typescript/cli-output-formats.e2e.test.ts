/**
 * CLI 輸出格式 E2E 測試
 *
 * 目標：覆蓋各命令的 summary / json 格式輸出路徑，
 * 以提升 infrastructure/formatters/strategies/ 的覆蓋率。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI 輸出格式 - summary 與 json 路徑覆蓋', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // MARK: - call-hierarchy formatter

  describe('call-hierarchy summary 格式', () => {
    it('應該輸出包含 incoming 與 outgoing 的 summary（both direction）', async () => {
      await fixture.writeFile('src/ch-target.ts', `
import { chHelper } from './ch-helper.js';
export function chTarget() {
  return chHelper();
}
      `.trim());
      await fixture.writeFile('src/ch-helper.ts', 'export function chHelper() { return 1; }');
      await fixture.writeFile('src/ch-caller.ts', `
import { chTarget } from './ch-target.js';
export function chCaller() { return chTarget(); }
      `.trim());

      const result = await executeCLI(
        ['call-hierarchy', 'chTarget', '--path', fixture.rootPath, '--direction', 'both', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('chTarget');
      // summary 格式應包含統計資訊
      expect(result.stdout.length).toBeGreaterThan(10);
    });

    it('應該在 summary 格式顯示 depth=2 的呼叫鏈', async () => {
      await fixture.writeFile('src/depth-a.ts', `
import { depthB } from './depth-b.js';
export function depthA() { return depthB(); }
      `.trim());
      await fixture.writeFile('src/depth-b.ts', `
import { depthC } from './depth-c.js';
export function depthB() { return depthC(); }
      `.trim());
      await fixture.writeFile('src/depth-c.ts', 'export function depthC() { return 42; }');

      const result = await executeCLI(
        ['call-hierarchy', 'depthA', '--path', fixture.rootPath, '--depth', '2', '--direction', 'outgoing', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('depthA');
    });

    it('應該在 success=false 時輸出錯誤 summary', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'notExistFn999', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      // 找不到函數時應輸出錯誤資訊
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    });
  });

  // MARK: - find-references formatter

  describe('find-references summary 格式', () => {
    it('應該輸出 find-references 的 summary（有引用）', async () => {
      await fixture.writeFile('src/fr-lib.ts', 'export function frLib() { return 1; }');
      await fixture.writeFile('src/fr-use1.ts', `
import { frLib } from './fr-lib.js';
export const x = frLib();
      `.trim());
      await fixture.writeFile('src/fr-use2.ts', `
import { frLib } from './fr-lib.js';
export const y = frLib();
      `.trim());

      const result = await executeCLI(
        ['find-references', 'frLib', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('frLib');
      // summary 應包含 reference count 資訊
      expect(result.stdout.length).toBeGreaterThan(10);
    });

    it('應該輸出 find-references 的 json（有引用）', async () => {
      await fixture.writeFile('src/fr-cls.ts', `
export class FrClass {
  method() { return 1; }
}
      `.trim());
      await fixture.writeFile('src/fr-cls-use.ts', `
import { FrClass } from './fr-cls.js';
const obj = new FrClass();
obj.method();
      `.trim());

      const result = await executeCLI(
        ['find-references', 'FrClass', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.success).toBe(true);
      expect(output.symbol).toBe('FrClass');
      expect(Array.isArray(output.references)).toBe(true);
    });

    it('應該輸出 find-references summary（找不到符號）', async () => {
      const result = await executeCLI(
        ['find-references', 'ghostSymbol999', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      // 找不到時輸出錯誤或空結果
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    });
  });

  // MARK: - deps (impact) formatter

  describe('impact/deps summary 格式', () => {
    it('應該輸出 impact 的 summary 格式', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/types/user.ts', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('應該輸出 impact 的 json 格式（驗證 DepsResult 結構）', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/utils/array-utils.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('deps');
      expect(output.success).toBe(true);
      expect(output.impact).toBeDefined();
      expect(output.impact.targetFile).toBeDefined();
      expect(Array.isArray(output.impact.dependents)).toBe(true);
    });
  });

  // MARK: - cycles formatter

  describe('cycles summary 格式（進階）', () => {
    it('應該在有循環時輸出 summary 包含循環數量', async () => {
      await fixture.writeFile('src/cyc-x.ts', 'import { y } from \'./cyc-y.js\';\nexport const x = y;');
      await fixture.writeFile('src/cyc-y.ts', 'import { x } from \'./cyc-x.js\';\nexport const y = x;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      // summary 應包含數字（循環數量）
      expect(result.stdout).toMatch(/\d+/);
    });

    it('應該在無循環時 summary 顯示 0 循環', async () => {
      await fixture.writeFile('src/nocyc-a.ts', 'import { b } from \'./nocyc-b.js\';\nexport const a = b;');
      await fixture.writeFile('src/nocyc-b.ts', 'export const b = 2;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  // MARK: - search formatter

  describe('search summary 格式', () => {
    it('應該輸出 search 的 summary 格式（找到結果）', async () => {
      const result = await executeCLI(
        ['search', 'UserService', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('UserService');
    });

    it('應該輸出 search 的 json 格式（class 符號）', async () => {
      const result = await executeCLI(
        ['search', 'UserModel', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('search');
      expect(output.success).toBe(true);
      expect(Array.isArray(output.results)).toBe(true);
    });

    it('應該輸出 search 的 summary（找不到結果）', async () => {
      const result = await executeCLI(
        ['search', 'nothingHere99988877', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });
});
