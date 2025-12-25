/**
 * CLI move 命令 E2E 測試 - tsconfig 向上查找
 * 測試當 --path 指向子目錄時，能正確向上查找 tsconfig.json 並解析 path aliases
 *
 * Issue: 當用戶執行 `agent-ide move --path src/` 時，
 * tsconfig.json 在父目錄，應該要能正確找到並解析 @/ alias
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';
import * as path from 'path';

describe('CLI move - tsconfig 向上查找', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('alias 路徑解析', () => {
    it('當 --path 指向子目錄時，應該向上查找 tsconfig.json 並正確解析 @/ alias', async () => {
      // Given: 建立使用 @/ alias 的檔案結構
      // tsconfig.json 在根目錄，設定 @/* -> src/*
      await fixture.writeFile('tsconfig.json', JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*']
          }
        }
      }));

      // 建立 src 目錄結構
      await fixture.writeFile('src/utils/helper.ts', `
export function helper() { return 'helper'; }
`);

      await fixture.writeFile('src/services/user.ts', `
import { helper } from '@/utils/helper';
export function getUser() { return helper(); }
`);

      const source = path.join(fixture.rootPath, 'src/utils/helper.ts');
      const target = path.join(fixture.rootPath, 'src/lib/helper.ts');
      const srcPath = path.join(fixture.rootPath, 'src');

      // When: 用 --path 指向 src 子目錄執行移動
      const result = await executeCLI(
        ['move', source, target, '--path', srcPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功找到使用 @/ alias 的引用
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 應該識別到 user.ts 中使用 @/utils/helper 的引用
      const userServiceFile = output.files?.find(
        (f: { filePath: string }) => f.filePath.includes('user.ts')
      );
      expect(userServiceFile).toBeDefined();
    });

    it('當 tsconfig.json 在多層父目錄時也應該能找到', async () => {
      // Given: tsconfig 在根目錄，source 在 src/features/auth 深層目錄
      await fixture.writeFile('tsconfig.json', JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*']
          }
        }
      }));

      await fixture.writeFile('src/features/auth/login.ts', `
export function login() { return true; }
`);

      await fixture.writeFile('src/services/auth-service.ts', `
import { login } from '@/features/auth/login';
export function authenticate() { return login(); }
`);

      const source = path.join(fixture.rootPath, 'src/features/auth/login.ts');
      const target = path.join(fixture.rootPath, 'src/features/auth/handlers/login.ts');
      const deepPath = path.join(fixture.rootPath, 'src/features/auth');

      // When: 用 --path 指向深層子目錄
      const result = await executeCLI(
        ['move', source, target, '--path', deepPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該正確更新 @/ alias import 路徑', async () => {
      // Given: 完整的 alias 設定
      await fixture.writeFile('tsconfig.json', JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*'],
            '@utils/*': ['src/utils/*']
          }
        }
      }));

      await fixture.writeFile('src/utils/format.ts', `
export function format(s: string) { return s.trim(); }
`);

      await fixture.writeFile('src/components/display.ts', `
import { format } from '@utils/format';
export function display(text: string) { return format(text); }
`);

      const source = path.join(fixture.rootPath, 'src/utils/format.ts');
      const target = path.join(fixture.rootPath, 'src/lib/format.ts');
      const srcPath = path.join(fixture.rootPath, 'src');

      // When
      const result = await executeCLI(
        ['move', source, target, '--path', srcPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該識別到 @utils/format 的引用並計算正確的更新
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 檢查是否有針對 display.ts 的更新
      const displayFile = output.files?.find(
        (f: { filePath: string }) => f.filePath.includes('display.ts')
      );
      expect(displayFile).toBeDefined();
    });
  });

  describe('向上查找邊界條件', () => {
    it('沒有 tsconfig.json 時應該正常運作（只用相對路徑）', async () => {
      // Given: 不建立 tsconfig.json
      await fixture.writeFile('src/utils/helper.ts', `
export function helper() { return 'helper'; }
`);

      await fixture.writeFile('src/services/user.ts', `
import { helper } from '../utils/helper';
export function getUser() { return helper(); }
`);

      const source = path.join(fixture.rootPath, 'src/utils/helper.ts');
      const target = path.join(fixture.rootPath, 'src/lib/helper.ts');

      // When
      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功並更新相對路徑
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('tsconfig.json 解析錯誤時應該優雅降級', async () => {
      // Given: 無效的 JSON
      await fixture.writeFile('tsconfig.json', '{ invalid json }');

      await fixture.writeFile('src/utils/helper.ts', `
export function helper() { return 'helper'; }
`);

      const source = path.join(fixture.rootPath, 'src/utils/helper.ts');
      const target = path.join(fixture.rootPath, 'src/lib/helper.ts');

      // When
      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該不會報錯，優雅降級
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });
});
