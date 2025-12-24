/**
 * CLI change-signature 命令 E2E 測試 - 路徑解析
 * 針對 commit 2080ce7 的 bug fix 進行 regression 測試
 *
 * 修復內容：file 參數應相對於 --path 指定的 projectRoot 解析，而非 process.cwd()
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI change-signature - 路徑解析測試', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('相對路徑解析', () => {
    it('file 參數應相對於 --path 解析而非 cwd', async () => {
      // Given: 在巢狀目錄創建測試檔案
      const content = `
function calculate(a: number, b: number): number {
  return a + b;
}

const result = calculate(1, 2);
`.trim();
      await fixture.writeFile('src/utils/math.ts', content);

      // When: 使用相對路徑（相對於 --path）
      const result = await executeCLI(
        [
          'change-signature',
          'src/utils/math.ts',  // 相對路徑，應相對於 --path
          'calculate',
          '-p', fixture.rootPath,
          '--reorder', 'b,a',
          '--format', 'json',
          '--dry-run'
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功找到並處理檔案
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.files.length).toBeGreaterThan(0);
    });

    it('絕對路徑應該仍然正常工作', async () => {
      // Given: 創建測試檔案
      const content = `
function add(x: number, y: number): number {
  return x + y;
}

add(1, 2);
`.trim();
      const absolutePath = `${fixture.rootPath}/src/absolute-test.ts`;
      await fixture.writeFile('src/absolute-test.ts', content);

      // When: 使用絕對路徑
      const result = await executeCLI(
        [
          'change-signature',
          absolutePath,  // 絕對路徑
          'add',
          '-p', fixture.rootPath,
          '--reorder', 'y,x',
          '--format', 'json',
          '--dry-run'
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('深層巢狀相對路徑應正確解析', async () => {
      // Given: 創建深層巢狀目錄結構
      const content = `
function deepFunction(first: string, second: string): string {
  return first + second;
}

deepFunction('a', 'b');
`.trim();
      await fixture.writeFile('src/modules/auth/helpers/validator.ts', content);

      // When: 使用深層相對路徑
      const result = await executeCLI(
        [
          'change-signature',
          'src/modules/auth/helpers/validator.ts',
          'deepFunction',
          '-p', fixture.rootPath,
          '--reorder', 'second,first',
          '--format', 'json',
          '--dry-run'
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('錯誤處理', () => {
    it('不存在的相對路徑應該報錯', async () => {
      // When: 使用不存在的相對路徑
      const result = await executeCLI(
        [
          'change-signature',
          'src/non-existent.ts',
          'someFunction',
          '-p', fixture.rootPath,
          '--reorder', 'b,a',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該失敗並報告錯誤
      expect(result.exitCode).toBe(1);
    });

    it('無效的函式名稱應該報錯', async () => {
      // Given
      await fixture.writeFile('src/test-func.ts', `
function realFunction(a: number): number {
  return a;
}
`.trim());

      // When: 使用不存在的函式名稱
      const result = await executeCLI(
        [
          'change-signature',
          'src/test-func.ts',
          'nonExistentFunction',
          '-p', fixture.rootPath,
          '--reorder', 'b,a',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(1);
    });
  });

  describe('dist/build 目錄排除', () => {
    it('應該排除 dist/ 目錄中的同名函式', async () => {
      // Given: 在 src/ 和 dist/ 都有同名函式
      const srcContent = `
export function sharedFunc(a: number, b: number): number {
  return a + b;
}

const r1 = sharedFunc(1, 2);
`.trim();

      const distContent = `
"use strict";
function sharedFunc(a, b) {
  return a + b;
}
exports.sharedFunc = sharedFunc;

const r1 = sharedFunc(1, 2);
`.trim();

      await fixture.writeFile('src/shared.ts', srcContent);
      await fixture.writeFile('dist/shared.js', distContent);

      // When: 執行 change-signature
      const result = await executeCLI(
        [
          'change-signature',
          'src/shared.ts',
          'sharedFunc',
          '-p', fixture.rootPath,
          '--reorder', 'b,a',
          '--format', 'json',
          '--dry-run'
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功，且只修改 src/ 不修改 dist/
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 確認沒有 dist/ 的檔案被修改
      const distFiles = output.files.filter((f: { filePath: string }) =>
        f.filePath.includes('/dist/')
      );
      expect(distFiles).toHaveLength(0);
    });

    it('應該排除 build/ 目錄', async () => {
      // Given
      const srcContent = `
function buildTest(x: number, y: number): number {
  return x - y;
}

buildTest(5, 3);
`.trim();

      await fixture.writeFile('src/build-test.ts', srcContent);
      await fixture.writeFile('build/build-test.js', 'function buildTest(x,y){return x-y;}');

      // When
      const result = await executeCLI(
        [
          'change-signature',
          'src/build-test.ts',
          'buildTest',
          '-p', fixture.rootPath,
          '--reorder', 'y,x',
          '--format', 'json',
          '--dry-run'
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const buildFiles = output.files.filter((f: { filePath: string }) =>
        f.filePath.includes('/build/')
      );
      expect(buildFiles).toHaveLength(0);
    });

    it('應該排除 coverage/ 目錄', async () => {
      // Given
      await fixture.writeFile('src/coverage-test.ts', `
function coverageFunc(a: string, b: string): string {
  return a + b;
}

coverageFunc('x', 'y');
`.trim());
      await fixture.writeFile('coverage/src/coverage-test.js', 'function coverageFunc(a,b){return a+b;}');

      // When
      const result = await executeCLI(
        [
          'change-signature',
          'src/coverage-test.ts',
          'coverageFunc',
          '-p', fixture.rootPath,
          '--reorder', 'b,a',
          '--format', 'json',
          '--dry-run'
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const coverageFiles = output.files.filter((f: { filePath: string }) =>
        f.filePath.includes('/coverage/')
      );
      expect(coverageFiles).toHaveLength(0);
    });
  });
});
