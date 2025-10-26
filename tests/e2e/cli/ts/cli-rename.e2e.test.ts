/**
 * CLI rename E2E 測試
 * 使用 sample-project fixture 進行真實複雜場景測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from '../../helpers/fixture-manager';
import { executeCLI } from '../../helpers/cli-executor';

describe('CLI rename E2E 測試', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  describe('基礎重命名功能', () => {
    it('應該能重命名 User interface（跨多檔案引用）', async () => {
      // User interface 被多個檔案引用：user-model.ts、user-service.ts、user-controller.ts 等
      const result = await executeCLI([
        'rename',
        '--symbol', 'User',
        '--new-name', 'Person',
        '--type', 'interface',
        '--path', fixture.tempPath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義檔案
      expect(await fixture.assertFileContains('src/types/user.ts', 'export interface Person {')).toBe(true);
      expect(await fixture.assertFileNotContains('src/types/user.ts', 'export interface User {')).toBe(true);

      // 驗證引用檔案
      expect(await fixture.assertFileContains('src/models/user-model.ts', 'import { Person')).toBe(true);
      expect(await fixture.assertFileContains('src/services/user-service.ts', 'import { Person')).toBe(true);
    });

    it('應該能重命名 UserService class', async () => {
      const result = await executeCLI([
        'rename',
        '--symbol', 'UserService',
        '--new-name', 'PersonService',
        '--type', 'class',
        '--path', fixture.tempPath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義
      expect(await fixture.assertFileContains('src/services/user-service.ts', 'export class PersonService')).toBe(true);
      expect(await fixture.assertFileNotContains('src/services/user-service.ts', 'export class UserService')).toBe(true);

      // 驗證引用（在 controller 中）
      expect(await fixture.assertFileContains('src/controllers/user-controller.ts', 'import { PersonService')).toBe(true);
    });

    it('應該能重命名 UserRole enum', async () => {
      const result = await executeCLI([
        'rename',
        '--symbol', 'UserRole',
        '--new-name', 'PersonRole',
        '--type', 'enum',
        '--path', fixture.tempPath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義
      expect(await fixture.assertFileContains('src/types/user.ts', 'export enum PersonRole')).toBe(true);

      // 驗證引用（可能在同一行 import 中）
      expect(await fixture.assertFileContains('src/models/user-model.ts', 'PersonRole')).toBe(true);
      expect(await fixture.assertFileContains('src/services/user-service.ts', 'PersonRole')).toBe(true);
    });

    it('應該處理找不到符號的錯誤', async () => {
      const result = await executeCLI([
        'rename',
        '--symbol', 'NonExistentSymbol',
        '--new-name', 'NewName',
        '--path', fixture.tempPath
      ]);

      const output = result.stdout + result.stderr;
      expect(output).toContain('找不到符號');
    });
  });

  describe('複雜場景測試', () => {
    it('應該能重命名跨多層目錄的 ApiResponse type', async () => {
      // ApiResponse 在 types/api.ts 定義，被 services/、controllers/ 引用
      const result = await executeCLI([
        'rename',
        '--symbol', 'ApiResponse',
        '--new-name', 'ApiResult',
        '--type', 'interface',
        '--path', fixture.tempPath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義
      expect(await fixture.assertFileContains('src/types/api.ts', 'export interface ApiResult')).toBe(true);

      // 驗證 services 層引用
      expect(await fixture.assertFileContains('src/services/user-service.ts', 'ApiResult')).toBe(true);

      // 驗證泛型使用
      expect(await fixture.assertFileContains('src/services/user-service.ts', 'ApiResult<User>')).toBe(true);
    });

    it('應該能重命名 BaseModel class（影響所有子類別）', async () => {
      const result = await executeCLI([
        'rename',
        '--symbol', 'BaseModel',
        '--new-name', 'AbstractModel',
        '--type', 'class',
        '--path', fixture.tempPath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義
      expect(await fixture.assertFileContains('src/models/base-model.ts', 'export abstract class AbstractModel')).toBe(true);

      // 驗證繼承
      expect(await fixture.assertFileContains('src/models/user-model.ts', 'extends AbstractModel')).toBe(true);
      expect(await fixture.assertFileContains('src/models/product-model.ts', 'extends AbstractModel')).toBe(true);
      expect(await fixture.assertFileContains('src/models/order-model.ts', 'extends AbstractModel')).toBe(true);
    });

    it('應該能重命名類別方法（內外部引用）', async () => {
      // UserModel.validate() 被內部和外部呼叫
      const result = await executeCLI([
        'rename',
        '--symbol', 'validate',
        '--new-name', 'check',
        '--type', 'function',
        '--path', fixture.tempPath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義
      expect(await fixture.assertFileContains('src/models/user-model.ts', 'check():')).toBe(true);

      // 驗證外部呼叫（UserService 中）
      expect(await fixture.assertFileContains('src/services/user-service.ts', '.check()')).toBe(true);
    });

    it('應該能重命名複合型別 CreateUserData', async () => {
      const result = await executeCLI([
        'rename',
        '--symbol', 'CreateUserData',
        '--new-name', 'UserCreationData',
        '--type', 'type',
        '--path', fixture.tempPath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義（使用 Omit）
      expect(await fixture.assertFileContains('src/types/user.ts', 'export type UserCreationData')).toBe(true);

      // 驗證引用
      expect(await fixture.assertFileContains('src/services/user-service.ts', 'UserCreationData')).toBe(true);
    });

    it('應該能重命名被 re-export 的符號', async () => {
      // types/index.ts 可能 re-export 其他型別
      const result = await executeCLI([
        'rename',
        '--symbol', 'UserStatus',
        '--new-name', 'AccountStatus',
        '--type', 'enum',
        '--path', fixture.tempPath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證原始定義
      expect(await fixture.assertFileContains('src/types/user.ts', 'export enum AccountStatus')).toBe(true);

      // 驗證所有引用都更新
      expect(await fixture.assertFileContains('src/models/user-model.ts', 'AccountStatus')).toBe(true);
    });
  });

  describe('驗證機制測試', () => {
    it('應該驗證所有修改的檔案', async () => {
      await executeCLI([
        'rename',
        '--symbol', 'UserProfile',
        '--new-name', 'PersonProfile',
        '--type', 'interface',
        '--path', fixture.tempPath
      ]);

      const modifiedFiles = await fixture.getModifiedFiles();
      expect(modifiedFiles.length).toBeGreaterThan(0);

      // 至少應該修改定義檔案
      expect(modifiedFiles.some(f => f.includes('types/user.ts'))).toBe(true);
    });

    it('應該保持檔案完整性（無語法錯誤）', async () => {
      await executeCLI([
        'rename',
        '--symbol', 'UserAddress',
        '--new-name', 'PersonAddress',
        '--type', 'interface',
        '--path', fixture.tempPath
      ]);

      // 讀取修改後的檔案，確保仍然是有效的 TypeScript
      const content = await fixture.readFile('src/types/user.ts');
      expect(content).toBeTruthy();
      expect(content).toContain('export interface PersonAddress');

      // 確保沒有語法錯誤的標記（如孤立的 interface 關鍵字）
      expect(content.match(/^interface\s+$/m)).toBeNull();
    });

    it('應該支援 preview 模式（不實際修改檔案）', async () => {
      const originalContent = await fixture.readFile('src/types/user.ts');

      const result = await executeCLI([
        'rename',
        '--symbol', 'UserID',
        '--new-name', 'PersonID',
        '--preview',
        '--path', fixture.tempPath
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('預覽');

      // 驗證檔案未被修改
      const currentContent = await fixture.readFile('src/types/user.ts');
      expect(currentContent).toBe(originalContent);
    });
  });
});
