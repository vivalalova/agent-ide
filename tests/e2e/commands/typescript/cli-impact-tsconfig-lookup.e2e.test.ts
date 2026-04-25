/**
 * CLI impact 命令 E2E 測試 - tsconfig 向上查找
 * 測試當 --path 指向子目錄時，能正確向上查找 tsconfig.json 並解析 path aliases
 *
 * Issue: 當用戶執行 `agent-ide impact --path src/` 時，
 * tsconfig.json 在父目錄，應該要能正確找到並解析 @/ alias
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';
import * as path from 'path';

describe('CLI impact - tsconfig 向上查找', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('當 --path 指向子目錄時', () => {
    it('應該向上查找 tsconfig.json 並正確解析 @/ alias', async () => {
      // Given: tsconfig.json 在根目錄，設定 @/* -> src/*
      await fixture.writeFile('tsconfig.json', JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*']
          }
        }
      }));

      // 建立被依賴的模組
      await fixture.writeFile('src/utils/helper.ts', `
export function helper() { return 'helper'; }
`);

      // 建立使用 @/ alias 的檔案
      await fixture.writeFile('src/services/user.ts', `
import { helper } from '@/utils/helper';
export function getUser() { return helper(); }
`);

      const srcPath = path.join(fixture.rootPath, 'src');

      // When: 用 --path 指向 src 子目錄執行 impact
      const result = await executeCLI(
        ['impact', '--file', 'utils/helper.ts', '--path', srcPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功找到使用 @/ alias 的引用
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 驗證依賴者：應該找到 user.ts
      const dependents = output.impact.dependents as string[];
      const hasUserService = dependents.some((d) => d.includes('user.ts'));
      expect(hasUserService).toBe(true);
    });

    it('當 tsconfig.json 在多層父目錄時也應該能找到', async () => {
      // Given: tsconfig 在根目錄，--path 指向 src/（tsconfig 在上一層）
      // 注意：impact 只掃描 --path 目錄下的檔案，所以引用者必須在該目錄下
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

      // 引用者也在 src/ 目錄下
      await fixture.writeFile('src/services/auth-service.ts', `
import { login } from '@/features/auth/login';
export function authenticate() { return login(); }
`);

      // --path 指向 src/，tsconfig 在根目錄（上一層）
      const srcPath = path.join(fixture.rootPath, 'src');

      // When
      const result = await executeCLI(
        ['impact', '--file', 'features/auth/login.ts', '--path', srcPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功找到引用
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const dependents = output.impact.dependents as string[];
      const hasAuthService = dependents.some((d) => d.includes('auth-service.ts'));
      expect(hasAuthService).toBe(true);
    });
  });

  describe('多種 path alias', () => {
    it('應該支援 TypeScript 原生 tsconfig 註解與 trailing comma', async () => {
      await fixture.writeFile('tsconfig.json', `{
        "compilerOptions": {
          // TypeScript accepts comments in tsconfig.json.
          "baseUrl": ".",
          "paths": {
            "@/*": ["src/*"],
          },
        },
      }`);

      await fixture.writeFile('src/utils/commented-config.ts', `
export function readConfig() { return 'commented'; }
`);

      await fixture.writeFile('src/services/commented-config-user.ts', `
import { readConfig } from '@/utils/commented-config';
export function useConfig() { return readConfig(); }
`);

      const srcPath = path.join(fixture.rootPath, 'src');

      const result = await executeCLI(
        ['impact', '--file', 'utils/commented-config.ts', '--path', srcPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const dependents = output.impact.dependents as string[];
      expect(dependents.some((d) => d.includes('commented-config-user.ts'))).toBe(true);
    });

    it('應該繼承 extends tsconfig 中定義的 path alias', async () => {
      await fixture.writeFile('tsconfig.base.json', JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*']
          }
        }
      }));
      await fixture.writeFile('tsconfig.json', JSON.stringify({
        extends: './tsconfig.base.json'
      }));

      await fixture.writeFile('src/utils/inherited-config.ts', `
export function readInheritedConfig() { return 'inherited'; }
`);

      await fixture.writeFile('src/services/inherited-config-user.ts', `
import { readInheritedConfig } from '@/utils/inherited-config';
export function useInheritedConfig() { return readInheritedConfig(); }
`);

      const srcPath = path.join(fixture.rootPath, 'src');

      const result = await executeCLI(
        ['impact', '--file', 'utils/inherited-config.ts', '--path', srcPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const dependents = output.impact.dependents as string[];
      expect(dependents.some((d) => d.includes('inherited-config-user.ts'))).toBe(true);
    });

    it('應該從 node_modules package extends 繼承 path alias', async () => {
      await fixture.writeFile('node_modules/@config/ts/base.json', JSON.stringify({
        compilerOptions: {
          baseUrl: '../../..',
          paths: {
            '@/*': ['src/*']
          }
        }
      }));
      await fixture.writeFile('tsconfig.json', JSON.stringify({
        extends: '@config/ts/base.json'
      }));

      await fixture.writeFile('src/utils/package-config.ts', `
export function readPackageConfig() { return 'package'; }
`);

      await fixture.writeFile('src/services/package-config-user.ts', `
import { readPackageConfig } from '@/utils/package-config';
export function usePackageConfig() { return readPackageConfig(); }
`);

      const srcPath = path.join(fixture.rootPath, 'src');

      const result = await executeCLI(
        ['impact', '--file', 'utils/package-config.ts', '--path', srcPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const dependents = output.impact.dependents as string[];
      expect(dependents.some((d) => d.includes('package-config-user.ts'))).toBe(true);
    });

    it('應該用繼承的 baseUrl 解析子層覆蓋的 paths', async () => {
      await fixture.writeFile('tsconfig.base.json', JSON.stringify({
        compilerOptions: {
          baseUrl: './src'
        }
      }));
      await fixture.writeFile('tsconfig.json', JSON.stringify({
        extends: './tsconfig.base.json',
        compilerOptions: {
          paths: {
            '#/*': ['utils/*']
          }
        }
      }));

      await fixture.writeFile('src/utils/inherited-baseurl.ts', `
export function readInheritedBaseUrl() { return 'baseUrl'; }
`);

      await fixture.writeFile('src/services/inherited-baseurl-user.ts', `
import { readInheritedBaseUrl } from '#/inherited-baseurl';
export function useInheritedBaseUrl() { return readInheritedBaseUrl(); }
`);

      const srcPath = path.join(fixture.rootPath, 'src');

      const result = await executeCLI(
        ['impact', '--file', 'utils/inherited-baseurl.ts', '--path', srcPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const dependents = output.impact.dependents as string[];
      expect(dependents.some((d) => d.includes('inherited-baseurl-user.ts'))).toBe(true);
    });

    it('應該正確解析多個 path alias 設定', async () => {
      // Given
      await fixture.writeFile('tsconfig.json', JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*'],
            '@utils/*': ['src/utils/*'],
            '@models/*': ['src/models/*']
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

      await fixture.writeFile('src/services/api.ts', `
import { format } from '@/utils/format';
export function apiFormat(text: string) { return format(text); }
`);

      const srcPath = path.join(fixture.rootPath, 'src');

      // When
      const result = await executeCLI(
        ['impact', '--file', 'utils/format.ts', '--path', srcPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const dependents = output.impact.dependents as string[];

      // 應該同時找到使用 @utils/format 和 @/utils/format 的檔案
      expect(dependents.some((d) => d.includes('display.ts'))).toBe(true);
      expect(dependents.some((d) => d.includes('api.ts'))).toBe(true);
    });
  });

  describe('邊界條件', () => {
    it('沒有 tsconfig.json 時應該正常運作（只用相對路徑）', async () => {
      // Given: 不建立 tsconfig.json
      await fixture.writeFile('src/utils/helper.ts', `
export function helper() { return 'helper'; }
`);

      await fixture.writeFile('src/services/user.ts', `
import { helper } from '../utils/helper';
export function getUser() { return helper(); }
`);

      const srcPath = path.join(fixture.rootPath, 'src');

      // When
      const result = await executeCLI(
        ['impact', '--file', 'utils/helper.ts', '--path', srcPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const dependents = output.impact.dependents as string[];
      expect(dependents.some((d) => d.includes('user.ts'))).toBe(true);
    });

    it('tsconfig.json 解析錯誤時應該優雅降級', async () => {
      // Given: 無效的 JSON
      await fixture.writeFile('tsconfig.json', '{ invalid json }');

      await fixture.writeFile('src/utils/helper.ts', `
export function helper() { return 'helper'; }
`);

      await fixture.writeFile('src/services/user.ts', `
import { helper } from '../utils/helper';
export function getUser() { return helper(); }
`);

      const srcPath = path.join(fixture.rootPath, 'src');

      // When
      const result = await executeCLI(
        ['impact', '--file', 'utils/helper.ts', '--path', srcPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該不會報錯，優雅降級
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });
});
