/**
 * deadcode 命令 E2E 測試 - 邊界條件和編譯產物排除
 * 針對 commit 9e1b028 的 bug fixes 進行 regression 測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode - 邊界條件測試', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('deadcode-test');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('編譯產物目錄排除（防止行號越界錯誤）', () => {
    it('應該自動排除 public/ 目錄中的編譯產物', async () => {
      // Given: 在 public/ 目錄創建模擬編譯產物（壓縮過的 JS，可能有 0-based 行號問題）
      const compiledContent = '"use strict";var t=function(){return"compiled"};module.exports={t:t};';
      await fixture.writeFile('public/compiled.js', compiledContent);
      await fixture.writeFile('public/assets/main.js', compiledContent);

      // When: 執行 deadcode 檢測
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功執行且不處理 public/ 目錄
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 確認沒有 public/ 目錄的檔案被處理
      const publicFiles = output.files.filter((f: { filePath: string }) =>
        f.filePath.includes('/public/')
      );
      expect(publicFiles).toHaveLength(0);
    });

    it('應該自動排除 .next/ 目錄（Next.js 編譯產物）', async () => {
      // Given: 創建 .next/ 目錄結構
      const compiledChunk = '(self.webpackChunk=self.webpackChunk||[]).push([[888],{123:function(t){t.exports={}}}]);';
      await fixture.writeFile('.next/static/chunks/main.js', compiledChunk);
      await fixture.writeFile('.next/server/pages/index.js', compiledChunk);

      // When
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const nextFiles = output.files.filter((f: { filePath: string }) =>
        f.filePath.includes('/.next/')
      );
      expect(nextFiles).toHaveLength(0);
    });

    it('應該自動排除 .nuxt/ 目錄（Nuxt.js 編譯產物）', async () => {
      // Given
      await fixture.writeFile('.nuxt/dist/server/index.js', 'module.exports={};');

      // When
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const nuxtFiles = output.files.filter((f: { filePath: string }) =>
        f.filePath.includes('/.nuxt/')
      );
      expect(nuxtFiles).toHaveLength(0);
    });

    it('應該自動排除 out/ 目錄（Next.js static export）', async () => {
      // Given
      await fixture.writeFile('out/_next/static/chunks/main.js', '"use strict";');

      // When
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const outFiles = output.files.filter((f: { filePath: string }) =>
        f.filePath.includes('/out/')
      );
      expect(outFiles).toHaveLength(0);
    });
  });

  describe('空檔案和邊界行號處理', () => {
    it('應該正確處理空檔案', async () => {
      // Given: 創建空的 TypeScript 檔案
      await fixture.writeFile('src/empty.ts', '');

      // When
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功執行，不崩潰
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該正確處理只有空白的檔案', async () => {
      // Given
      await fixture.writeFile('src/whitespace-only.ts', '   \n\n   \n');

      // When
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該正確處理單行檔案', async () => {
      // Given: 單行檔案（lines.length = 1）
      await fixture.writeFile('src/single-line.ts', 'export const singleLineUnused = 42;');

      // When
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--include-exports'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('Import 解析邊界條件', () => {
    it('應該正確處理沒有 named imports 的 import 語句', async () => {
      // Given: 只有 side-effect import（沒有 namedImports）
      await fixture.writeFile('src/side-effect-import.ts', `
import './some-module';
import 'polyfill';

const unused = 123;
`);

      // When
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 不應該因為 undefined namedImports 而崩潰
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該正確處理 namespace import', async () => {
      // Given: namespace import（* as）
      await fixture.writeFile('src/namespace-import.ts', `
import * as utils from './utils';

const unused = 456;
`);

      // When
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該正確處理 default import', async () => {
      // Given
      await fixture.writeFile('src/default-import.ts', `
import defaultExport from './module';

const unused = 789;
`);

      // When
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('大量檔案處理（效能邊界）', () => {
    it('應該能處理包含多種目錄結構的專案', async () => {
      // Given: 創建複雜的目錄結構，包含應排除和不應排除的目錄
      await fixture.writeFile('src/valid.ts', 'export const valid = 1;');
      await fixture.writeFile('lib/utils.ts', 'export const util = 2;');
      await fixture.writeFile('dist/compiled.js', '"use strict";'); // 應排除
      await fixture.writeFile('build/output.js', '"use strict";'); // 應排除
      await fixture.writeFile('coverage/lcov.info', 'TN:'); // 應排除

      // When
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 確認排除目錄的檔案沒有被處理
      const excludedPaths = output.files.filter((f: { filePath: string }) =>
        f.filePath.includes('/dist/') ||
        f.filePath.includes('/build/') ||
        f.filePath.includes('/coverage/')
      );
      expect(excludedPaths).toHaveLength(0);
    });
  });
});
