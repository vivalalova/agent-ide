/**
 * CLI move 命令 E2E 測試 - Glob Pattern 支援
 * 比照 Unix mv 行為支援 glob pattern
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - Glob Pattern 支援', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本 glob 移動', () => {
    it('應該支援 *.ts 移動多個檔案到目錄', async () => {
      // Given: 多個 .ts 檔案在同一目錄
      await fixture.writeFile('src/utils/a.ts', 'export const a = 1;');
      await fixture.writeFile('src/utils/b.ts', 'export const b = 2;');
      await fixture.writeFile('src/utils/c.ts', 'export const c = 3;');
      await fixture.writeFile('src/utils/keep.js', 'export const keep = 0;'); // 不應被移動

      // When: 使用 glob 移動
      const result = await executeCLI(
        [
          'move',
          'src/utils/*.ts',
          'src/helpers/',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      if (result.exitCode !== 0) {
        console.log('STDOUT:', result.stdout);
        console.log('STDERR:', result.stderr);
      }
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 驗證檔案已移動
      expect(await fixture.exists('src/helpers/a.ts')).toBe(true);
      expect(await fixture.exists('src/helpers/b.ts')).toBe(true);
      expect(await fixture.exists('src/helpers/c.ts')).toBe(true);

      // 原位置應該不存在
      expect(await fixture.exists('src/utils/a.ts')).toBe(false);
      expect(await fixture.exists('src/utils/b.ts')).toBe(false);
      expect(await fixture.exists('src/utils/c.ts')).toBe(false);

      // .js 檔案不應被移動
      expect(await fixture.exists('src/utils/keep.js')).toBe(true);
    });

    it('應該支援 **/*.ts 遞迴 glob', async () => {
      // Given: 巢狀目錄結構
      await fixture.writeFile('src/deep/level1/a.ts', 'export const a = 1;');
      await fixture.writeFile('src/deep/level1/level2/b.ts', 'export const b = 2;');

      // When: 使用遞迴 glob
      const result = await executeCLI(
        [
          'move',
          'src/deep/**/*.ts',
          'src/flat/',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 檔案應該被攤平到目標目錄
      expect(await fixture.exists('src/flat/a.ts')).toBe(true);
      expect(await fixture.exists('src/flat/b.ts')).toBe(true);
    });

    it('glob 無匹配時應報錯', async () => {
      // Given: 空目錄
      await fixture.writeFile('src/empty/.gitkeep', '');

      // When: glob 無匹配
      const result = await executeCLI(
        [
          'move',
          'src/empty/*.ts',
          'src/dest/',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該報錯
      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
    });
  });

  describe('Glob 移動與 import 更新', () => {
    it('移動後應更新所有 import', async () => {
      // Given: 有引用關係的檔案
      await fixture.writeFile('src/utils/helper.ts', `
export function helper() { return 'helper'; }
`);
      await fixture.writeFile('src/utils/format.ts', `
export function format() { return 'format'; }
`);
      await fixture.writeFile('src/app.ts', `
import { helper } from './utils/helper';
import { format } from './utils/format';
console.log(helper(), format());
`);

      // When: glob 移動
      const result = await executeCLI(
        [
          'move',
          'src/utils/*.ts',
          'src/lib/',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);

      // 驗證 import 已更新
      const appContent = await fixture.readFile('src/app.ts');
      expect(appContent).toContain('./lib/helper');
      expect(appContent).toContain('./lib/format');
      expect(appContent).not.toContain('./utils/helper');
      expect(appContent).not.toContain('./utils/format');
    });
  });

  describe('Glob 目標處理', () => {
    it('目標必須是目錄（以 / 結尾或已存在的目錄）', async () => {
      // Given
      await fixture.writeFile('src/utils/a.ts', 'export const a = 1;');
      await fixture.writeFile('src/utils/b.ts', 'export const b = 2;');

      // When: 目標不是目錄（多檔案移動到單一檔案路徑）
      const result = await executeCLI(
        [
          'move',
          'src/utils/*.ts',
          'src/single.ts',  // 錯誤：多檔案不能移動到單一檔案
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該報錯
      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
    });

    it('單一檔案匹配時可以重命名', async () => {
      // Given: 只有一個匹配
      await fixture.writeFile('src/only/single.ts', 'export const single = 1;');

      // When: 移動到新檔名
      const result = await executeCLI(
        [
          'move',
          'src/only/*.ts',
          'src/renamed.ts',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功（只有一個檔案時可重命名）
      expect(result.exitCode).toBe(0);
      expect(await fixture.exists('src/renamed.ts')).toBe(true);
      expect(await fixture.exists('src/only/single.ts')).toBe(false);
    });
  });

  describe('dry-run 模式', () => {
    it('dry-run 應該顯示所有將移動的檔案', async () => {
      // Given
      await fixture.writeFile('src/utils/a.ts', 'export const a = 1;');
      await fixture.writeFile('src/utils/b.ts', 'export const b = 2;');

      // When
      const result = await executeCLI(
        [
          'move',
          'src/utils/*.ts',
          'src/lib/',
          '--path', fixture.rootPath,
          '--dry-run',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);

      // 檔案不應實際移動
      expect(await fixture.exists('src/utils/a.ts')).toBe(true);
      expect(await fixture.exists('src/utils/b.ts')).toBe(true);
      expect(await fixture.exists('src/lib/a.ts')).toBe(false);
    });
  });
});
