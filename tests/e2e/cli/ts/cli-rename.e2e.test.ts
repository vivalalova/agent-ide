/**
 * CLI rename E2E 測試
 * 使用 sample-project fixture 進行真實複雜場景測試
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetFixtures, getFixturePath } from '../../helpers/fixture-manager';
import * as path from 'path';
import * as fs from 'fs/promises';
import { executeCLI } from '../../helpers/cli-executor';

describe('CLI rename E2E 測試', () => {
  const fixturePath = getFixturePath('sample-project');

  beforeEach(async () => {
    await resetFixtures();
  });


  describe('基礎重命名功能', () => {
    it('應該能重命名 User interface（跨多檔案引用）', async () => {
      // User interface 被多個檔案引用：user-model.ts、user-service.ts、user-controller.ts 等
      const result = await executeCLI([
        'rename',
        '--symbol', 'User',
        '--new-name', 'Person',
        '--type', 'interface',
        '--path', fixturePath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義檔案
      const userTypeContent = await fs.readFile(path.join(fixturePath, 'src/types/user.ts'), 'utf-8');
      expect(userTypeContent).toContain('export interface Person {');
      expect(userTypeContent).not.toContain('export interface User {');

      // 驗證引用檔案
      const userModelContent = await fs.readFile(path.join(fixturePath, 'src/models/user-model.ts'), 'utf-8');
      expect(userModelContent).toContain('import { Person');

      const userServiceContent = await fs.readFile(path.join(fixturePath, 'src/services/user-service.ts'), 'utf-8');
      expect(userServiceContent).toContain('import { Person');
    });

    it('應該能重命名 UserService class', async () => {
      const result = await executeCLI([
        'rename',
        '--symbol', 'UserService',
        '--new-name', 'PersonService',
        '--type', 'class',
        '--path', fixturePath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義
      const userServiceContent = await fs.readFile(path.join(fixturePath, 'src/services/user-service.ts'), 'utf-8');
      expect(userServiceContent).toContain('export class PersonService');
      expect(userServiceContent).not.toContain('export class UserService');

      // 驗證引用（在 controller 中）
      const userControllerContent = await fs.readFile(path.join(fixturePath, 'src/controllers/user-controller.ts'), 'utf-8');
      expect(userControllerContent).toContain('import { PersonService');
    });

    it('應該能重命名 UserRole enum', async () => {
      const result = await executeCLI([
        'rename',
        '--symbol', 'UserRole',
        '--new-name', 'PersonRole',
        '--type', 'enum',
        '--path', fixturePath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義
      const userTypeContent = await fs.readFile(path.join(fixturePath, 'src/types/user.ts'), 'utf-8');
      expect(userTypeContent).toContain('export enum PersonRole');

      // 驗證引用（可能在同一行 import 中）
      const userModelContent = await fs.readFile(path.join(fixturePath, 'src/models/user-model.ts'), 'utf-8');
      expect(userModelContent).toContain('PersonRole');

      const userServiceContent = await fs.readFile(path.join(fixturePath, 'src/services/user-service.ts'), 'utf-8');
      expect(userServiceContent).toContain('PersonRole');
    });

    it('應該處理找不到符號的錯誤', async () => {
      const result = await executeCLI([
        'rename',
        '--symbol', 'NonExistentSymbol',
        '--new-name', 'NewName',
        '--path', fixturePath
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
        '--path', fixturePath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義
      const apiTypeContent = await fs.readFile(path.join(fixturePath, 'src/types/api.ts'), 'utf-8');
      expect(apiTypeContent).toContain('export interface ApiResult');

      // 驗證 services 層引用
      const userServiceContent = await fs.readFile(path.join(fixturePath, 'src/services/user-service.ts'), 'utf-8');
      expect(userServiceContent).toContain('ApiResult');

      // 驗證泛型使用
      expect(userServiceContent).toContain('ApiResult<User>');
    });

    it('應該能重命名 BaseModel class（影響所有子類別）', async () => {
      const result = await executeCLI([
        'rename',
        '--symbol', 'BaseModel',
        '--new-name', 'AbstractModel',
        '--type', 'class',
        '--path', fixturePath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義
      const baseModelContent = await fs.readFile(path.join(fixturePath, 'src/models/base-model.ts'), 'utf-8');
      expect(baseModelContent).toContain('export abstract class AbstractModel');

      // 驗證繼承
      const userModelContent = await fs.readFile(path.join(fixturePath, 'src/models/user-model.ts'), 'utf-8');
      expect(userModelContent).toContain('extends AbstractModel');

      const productModelContent = await fs.readFile(path.join(fixturePath, 'src/models/product-model.ts'), 'utf-8');
      expect(productModelContent).toContain('extends AbstractModel');

      const orderModelContent = await fs.readFile(path.join(fixturePath, 'src/models/order-model.ts'), 'utf-8');
      expect(orderModelContent).toContain('extends AbstractModel');
    });

    it('應該能重命名類別方法（內外部引用）', async () => {
      // UserModel.validate() 被內部和外部呼叫
      const result = await executeCLI([
        'rename',
        '--symbol', 'validate',
        '--new-name', 'check',
        '--type', 'function',
        '--path', fixturePath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義
      const userModelContent = await fs.readFile(path.join(fixturePath, 'src/models/user-model.ts'), 'utf-8');
      expect(userModelContent).toContain('check():');

      // 驗證外部呼叫（UserService 中）
      const userServiceContent = await fs.readFile(path.join(fixturePath, 'src/services/user-service.ts'), 'utf-8');
      expect(userServiceContent).toContain('.check()');
    });

    it('應該能重命名複合型別 CreateUserData', async () => {
      const result = await executeCLI([
        'rename',
        '--symbol', 'CreateUserData',
        '--new-name', 'UserCreationData',
        '--type', 'type',
        '--path', fixturePath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義（使用 Omit）
      const userTypeContent = await fs.readFile(path.join(fixturePath, 'src/types/user.ts'), 'utf-8');
      expect(userTypeContent).toContain('export type UserCreationData');

      // 驗證引用
      const userServiceContent = await fs.readFile(path.join(fixturePath, 'src/services/user-service.ts'), 'utf-8');
      expect(userServiceContent).toContain('UserCreationData');
    });

    it('應該能重命名被 re-export 的符號', async () => {
      // types/index.ts 可能 re-export 其他型別
      const result = await executeCLI([
        'rename',
        '--symbol', 'UserStatus',
        '--new-name', 'AccountStatus',
        '--type', 'enum',
        '--path', fixturePath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證原始定義
      const userTypeContent = await fs.readFile(path.join(fixturePath, 'src/types/user.ts'), 'utf-8');
      expect(userTypeContent).toContain('export enum AccountStatus');

      // 驗證所有引用都更新
      const userModelContent = await fs.readFile(path.join(fixturePath, 'src/models/user-model.ts'), 'utf-8');
      expect(userModelContent).toContain('AccountStatus');
    });
  });

  describe('驗證機制測試', () => {
    it('應該驗證所有修改的檔案', async () => {
      const result = await executeCLI([
        'rename',
        '--symbol', 'UserProfile',
        '--new-name', 'PersonProfile',
        '--type', 'interface',
        '--path', fixturePath
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義檔案被修改
      const userTypeContent = await fs.readFile(path.join(fixturePath, 'src/types/user.ts'), 'utf-8');
      expect(userTypeContent).toContain('PersonProfile');
    });

    it('應該保持檔案完整性（無語法錯誤）', async () => {
      await executeCLI([
        'rename',
        '--symbol', 'UserAddress',
        '--new-name', 'PersonAddress',
        '--type', 'interface',
        '--path', fixturePath
      ]);

      // 讀取修改後的檔案，確保仍然是有效的 TypeScript
      const content = await fs.readFile(path.join(fixturePath, 'src/types/user.ts'), 'utf-8');
      expect(content).toBeTruthy();
      expect(content).toContain('export interface PersonAddress');

      // 確保沒有語法錯誤的標記（如孤立的 interface 關鍵字）
      expect(content.match(/^interface\s+$/m)).toBeNull();
    });

    it('應該支援 preview 模式（不實際修改檔案）', async () => {
      const originalContent = await fs.readFile(path.join(fixturePath, 'src/types/user.ts'), 'utf-8');

      const result = await executeCLI([
        'rename',
        '--symbol', 'UserID',
        '--new-name', 'PersonID',
        '--preview',
        '--path', fixturePath
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('預覽');

      // 驗證檔案未被修改
      const currentContent = await fs.readFile(path.join(fixturePath, 'src/types/user.ts'), 'utf-8');
      expect(currentContent).toBe(originalContent);
    });
  });
});
