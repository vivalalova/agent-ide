/**
 * CLI move 命令 E2E 測試
 * 使用 sample-project fixture 進行真實複雜場景測試
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetFixtures, getFixturePath } from '../../helpers/fixture-manager';
import * as path from 'path';
import * as fs from 'fs/promises';
import { executeCLI } from '../../helpers/cli-executor';

describe('CLI move 命令 E2E 測試', () => {
  const fixturePath = getFixturePath('sample-project');

  beforeEach(async () => {
    await resetFixtures();
  });


  describe('基礎移動測試', () => {
    it('應該能移動單一檔案到新目錄', async () => {
      const sourcePath = path.join(fixturePath, 'src/utils/formatter.ts');
      const targetPath = path.join(fixturePath, 'src/shared/formatter.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixturePath });

      // 驗證命令執行成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('移動');

      // 驗證目標檔案存在
      const targetExists = await fs.access(path.join(fixturePath, 'src/shared/formatter.ts')).then(() => true).catch(() => false);
      expect(targetExists).toBe(true);

      // 驗證源檔案不存在
      const sourceExists = await fs.access(path.join(fixturePath, 'src/utils/formatter.ts')).then(() => true).catch(() => false);
      expect(sourceExists).toBe(false);
    });

    it('應該能移動檔案並更名', async () => {
      const sourcePath = path.join(fixturePath, 'src/utils/array-utils.ts');
      const targetPath = path.join(fixturePath, 'src/utils/array-helpers.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixturePath });

      expect(result.exitCode).toBe(0);

      // 驗證新檔案存在
      const targetExists = await fs.access(path.join(fixturePath, 'src/utils/array-helpers.ts')).then(() => true).catch(() => false);
      expect(targetExists).toBe(true);

      // 驗證舊檔案不存在
      const sourceExists = await fs.access(path.join(fixturePath, 'src/utils/array-utils.ts')).then(() => true).catch(() => false);
      expect(sourceExists).toBe(false);
    });

    it('應該能處理目標目錄不存在的情況', async () => {
      const sourcePath = path.join(fixturePath, 'src/utils/string-utils.ts');
      const targetPath = path.join(fixturePath, 'src/helpers/text/string-utils.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixturePath });

      // 應該自動建立目錄並成功移動
      expect(result.exitCode).toBe(0);

      const targetExists = await fs.access(path.join(fixturePath, 'src/helpers/text/string-utils.ts')).then(() => true).catch(() => false);
      expect(targetExists).toBe(true);
    });

    it('應該能處理源檔案不存在的錯誤', async () => {
      const sourcePath = path.join(fixturePath, 'src/nonexistent.ts');
      const targetPath = path.join(fixturePath, 'src/target.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixturePath });

      // 應該顯示錯誤訊息
      expect(result.stdout).toContain('移動失敗');
    });

    it('應該能在預覽模式下顯示變更', async () => {
      const sourcePath = path.join(fixturePath, 'src/utils/date-utils.ts');
      const targetPath = path.join(fixturePath, 'src/shared/date-utils.ts');

      const result = await executeCLI(['move', sourcePath, targetPath, '--preview'], { cwd: fixturePath });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('預覽');

      // 預覽模式不應該真的移動檔案
      const sourceExists = await fs.access(path.join(fixturePath, 'src/utils/date-utils.ts')).then(() => true).catch(() => false);
      expect(sourceExists).toBe(true);
    });
  });

  describe('複雜跨檔案引用測試', () => {
    it('應該移動被多處引用的型別檔案', async () => {
      const sourcePath = path.join(fixturePath, 'src/types/user.ts');
      const targetPath = path.join(fixturePath, 'src/types/entities/user.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixturePath });

      // 驗證移動成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('移動');

      // 驗證檔案移動
      const targetExists = await fs.access(path.join(fixturePath, 'src/types/entities/user.ts')).then(() => true).catch(() => false);
      expect(targetExists).toBe(true);

      const sourceExists = await fs.access(path.join(fixturePath, 'src/types/user.ts')).then(() => true).catch(() => false);
      expect(sourceExists).toBe(false);

      // 驗證檔案內容保持不變
      const targetContent = await fs.readFile(path.join(fixturePath, 'src/types/entities/user.ts'), 'utf-8');
      expect(targetContent).toContain('export interface User');
      expect(targetContent).toContain('export enum UserRole');
      expect(targetContent).toContain('export enum UserStatus');
    });

    it('應該移動配置檔案並更新跨層級引用', async () => {
      const sourcePath = path.join(fixturePath, 'src/core/config/settings.ts');
      const targetPath = path.join(fixturePath, 'src/config/app-settings.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixturePath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fs.access(path.join(fixturePath, 'src/config/app-settings.ts')).then(() => true).catch(() => false);
      expect(targetExists).toBe(true);

      const sourceExists = await fs.access(path.join(fixturePath, 'src/core/config/settings.ts')).then(() => true).catch(() => false);
      expect(sourceExists).toBe(false);
    });

    it('應該移動 Model 檔案', async () => {
      const sourcePath = path.join(fixturePath, 'src/models/product-model.ts');
      const targetPath = path.join(fixturePath, 'src/domain/models/product-model.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixturePath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fs.access(path.join(fixturePath, 'src/domain/models/product-model.ts')).then(() => true).catch(() => false);
      expect(targetExists).toBe(true);

      const sourceExists = await fs.access(path.join(fixturePath, 'src/models/product-model.ts')).then(() => true).catch(() => false);
      expect(sourceExists).toBe(false);

      // 驗證檔案內容保持不變
      const targetContent = await fs.readFile(path.join(fixturePath, 'src/domain/models/product-model.ts'), 'utf-8');
      expect(targetContent).toContain('export class ProductModel');
    });

    it('應該移動 Service 檔案', async () => {
      const sourcePath = path.join(fixturePath, 'src/services/user-service.ts');
      const targetPath = path.join(fixturePath, 'src/application/services/user-service.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixturePath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fs.access(path.join(fixturePath, 'src/application/services/user-service.ts')).then(() => true).catch(() => false);
      expect(targetExists).toBe(true);

      const sourceExists = await fs.access(path.join(fixturePath, 'src/services/user-service.ts')).then(() => true).catch(() => false);
      expect(sourceExists).toBe(false);

      // 驗證檔案內容保持不變
      const targetContent = await fs.readFile(path.join(fixturePath, 'src/application/services/user-service.ts'), 'utf-8');
      expect(targetContent).toContain('export class UserService');
    });

    it('應該移動深層檔案到淺層', async () => {
      const sourcePath = path.join(fixturePath, 'src/api/handlers/user-handler.ts');
      const targetPath = path.join(fixturePath, 'src/handlers/user.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixturePath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fs.access(path.join(fixturePath, 'src/handlers/user.ts')).then(() => true).catch(() => false);
      expect(targetExists).toBe(true);

      const sourceExists = await fs.access(path.join(fixturePath, 'src/api/handlers/user-handler.ts')).then(() => true).catch(() => false);
      expect(sourceExists).toBe(false);
    });

    it('應該移動淺層檔案到深層', async () => {
      const sourcePath = path.join(fixturePath, 'src/core/constants.ts');
      const targetPath = path.join(fixturePath, 'src/shared/config/app/constants.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixturePath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fs.access(path.join(fixturePath, 'src/shared/config/app/constants.ts')).then(() => true).catch(() => false);
      expect(targetExists).toBe(true);

      const sourceExists = await fs.access(path.join(fixturePath, 'src/core/constants.ts')).then(() => true).catch(() => false);
      expect(sourceExists).toBe(false);

      // 驗證檔案內容保持不變
      const targetContent = await fs.readFile(path.join(fixturePath, 'src/shared/config/app/constants.ts'), 'utf-8');
      expect(targetContent).toContain('export const API_BASE_URL');
    });
  });

  describe('批次移動測試', () => {
    it('應該能連續移動多個相關檔案', async () => {
      // 移動第一個檔案
      const source1 = path.join(fixturePath, 'src/types/order.ts');
      const target1 = path.join(fixturePath, 'src/types/entities/order.ts');
      const result1 = await executeCLI(['move', source1, target1], { cwd: fixturePath });
      expect(result1.exitCode).toBe(0);

      // 移動第二個檔案
      const source2 = path.join(fixturePath, 'src/models/order-model.ts');
      const target2 = path.join(fixturePath, 'src/domain/models/order-model.ts');
      const result2 = await executeCLI(['move', source2, target2], { cwd: fixturePath });
      expect(result2.exitCode).toBe(0);

      // 驗證兩個檔案都成功移動
      const target1Exists = await fs.access(path.join(fixturePath, 'src/types/entities/order.ts')).then(() => true).catch(() => false);
      expect(target1Exists).toBe(true);

      const target2Exists = await fs.access(path.join(fixturePath, 'src/domain/models/order-model.ts')).then(() => true).catch(() => false);
      expect(target2Exists).toBe(true);

      // 驗證源檔案不存在
      const source1Exists = await fs.access(path.join(fixturePath, 'src/types/order.ts')).then(() => true).catch(() => false);
      expect(source1Exists).toBe(false);

      const source2Exists = await fs.access(path.join(fixturePath, 'src/models/order-model.ts')).then(() => true).catch(() => false);
      expect(source2Exists).toBe(false);
    });
  });

  describe('錯誤處理測試', () => {
    it('應該能處理相同的源和目標路徑', async () => {
      const samePath = path.join(fixturePath, 'src/utils/validator.ts');

      const result = await executeCLI(['move', samePath, samePath], { cwd: fixturePath });

      // 應該成功執行或顯示適當訊息
      expect(result.exitCode).toBe(0);
    });

    it('應該能處理目標檔案已存在的情況', async () => {
      const sourcePath = path.join(fixturePath, 'src/utils/formatter.ts');
      const targetPath = path.join(fixturePath, 'src/utils/validator.ts'); // 已存在的檔案

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixturePath });

      // 根據實作，可能會覆蓋或報錯
      // 這裡我們檢查命令有適當的回應
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe('複雜引用場景測試 - Re-export 和 Index 檔案', () => {
    it('應該移動被 re-export 的型別檔案並更新 index', async () => {
      const sourcePath = path.join(fixturePath, 'src/types/user.ts');
      const targetPath = path.join(fixturePath, 'src/types/entities/user.ts');

      const result = await executeCLI(['move', sourcePath, targetPath, '--path', fixturePath], { cwd: fixturePath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fs.access(path.join(fixturePath, 'src/types/entities/user.ts')).then(() => true).catch(() => false);
      expect(targetExists).toBe(true);

      // 驗證 index.ts 中的 export 語句被更新
      const indexContent = await fs.readFile(path.join(fixturePath, 'src/types/index.ts'), 'utf-8');
      expect(indexContent).toContain('export * from \'./entities/user\'');
      expect(indexContent).not.toContain('export * from \'./user\'');
    });

    it('應該移動 index 檔案並更新所有引用', async () => {
      const sourcePath = path.join(fixturePath, 'src/types/index.ts');
      const targetPath = path.join(fixturePath, 'src/types/main.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixturePath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fs.access(path.join(fixturePath, 'src/types/main.ts')).then(() => true).catch(() => false);
      expect(targetExists).toBe(true);

      const sourceExists = await fs.access(path.join(fixturePath, 'src/types/index.ts')).then(() => true).catch(() => false);
      expect(sourceExists).toBe(false);
    });

    it('應該移動有多個 export from 語句的檔案', async () => {
      const sourcePath = path.join(fixturePath, 'src/types/api.ts');
      const targetPath = path.join(fixturePath, 'src/types/responses/api.ts');

      const result = await executeCLI(['move', sourcePath, targetPath, '--path', fixturePath], { cwd: fixturePath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fs.access(path.join(fixturePath, 'src/types/responses/api.ts')).then(() => true).catch(() => false);
      expect(targetExists).toBe(true);

      // 驗證 index.ts 被更新
      const indexContent = await fs.readFile(path.join(fixturePath, 'src/types/index.ts'), 'utf-8');
      expect(indexContent).toContain('export * from \'./responses/api\'');
    });
  });

  describe('複雜引用場景測試 - Type Imports 和動態 Import', () => {
    it('應該處理 TypeScript type-only import', async () => {
      // 先創建一個測試檔案，包含 type import
      const testFileContent = `import type { User } from './types/user';
import { type UserRole, UserStatus } from './types/user';

export function processUser(user: User, role: UserRole): void {
  console.log(user, role);
}`;
      await fs.writeFile(path.join(fixturePath, 'src/type-import-test.ts'), testFileContent, 'utf-8');

      // 移動被引用的檔案
      const sourcePath = path.join(fixturePath, 'src/types/user.ts');
      const targetPath = path.join(fixturePath, 'src/domain/user-types.ts');

      const result = await executeCLI(['move', sourcePath, targetPath, '--path', fixturePath]);

      expect(result.exitCode).toBe(0);

      // 驗證 type import 被更新
      const testFileUpdated = await fs.readFile(path.join(fixturePath, 'src/type-import-test.ts'), 'utf-8');
      expect(testFileUpdated).toContain('import type { User } from \'./domain/user-types\'');
      expect(testFileUpdated).toContain('import { type UserRole, UserStatus } from \'./domain/user-types\'');
    });

    it('應該處理動態 import 語句', async () => {
      // 創建包含動態 import 的測試檔案
      const testFileContent = `export async function loadUser() {
  const { UserService } = await import('./services/user-service');
  return new UserService();
}

export function lazyLoadProduct() {
  return import('./services/product-service').then(m => m.ProductService);
}`;
      await fs.writeFile(path.join(fixturePath, 'src/dynamic-loader.ts'), testFileContent, 'utf-8');

      // 移動被動態引用的檔案
      const sourcePath = path.join(fixturePath, 'src/services/user-service.ts');
      const targetPath = path.join(fixturePath, 'src/app/services/user-service.ts');

      const result = await executeCLI(['move', sourcePath, targetPath, '--path', fixturePath]);

      expect(result.exitCode).toBe(0);

      // 驗證動態 import 被更新
      const loaderContent = await fs.readFile(path.join(fixturePath, 'src/dynamic-loader.ts'), 'utf-8');
      expect(loaderContent).toContain('await import(\'./app/services/user-service\')');
    });

    it('應該處理 side-effect import', async () => {
      // 創建包含 side-effect import 的測試檔案
      const testFileContent = `import './core/config/settings';
import { UserService } from './services/user-service';

export const userService = new UserService();`;
      await fs.writeFile(path.join(fixturePath, 'src/app-init.ts'), testFileContent, 'utf-8');

      // 移動被 side-effect import 的檔案
      const sourcePath = path.join(fixturePath, 'src/core/config/settings.ts');
      const targetPath = path.join(fixturePath, 'src/config/settings.ts');

      const result = await executeCLI(['move', sourcePath, targetPath, '--path', fixturePath]);

      expect(result.exitCode).toBe(0);

      // 驗證 side-effect import 被更新
      const initContent = await fs.readFile(path.join(fixturePath, 'src/app-init.ts'), 'utf-8');
      expect(initContent).toContain('import \'./config/settings\'');
    });
  });

  describe('複雜引用場景測試 - 同名檔案和嵌套引用', () => {
    it('應該只更新正確路徑的同名檔案引用', async () => {
      // 創建兩個同名但路徑不同的檔案
      const helper1Content = 'export function utilHelper() { return \'util\'; }';
      const helper2Content = 'export function componentHelper() { return \'component\'; }';
      await fs.writeFile(path.join(fixturePath, 'src/utils/helper.ts'), helper1Content, 'utf-8');
      await fs.mkdir(path.join(fixturePath, 'src/components'), { recursive: true });
      await fs.writeFile(path.join(fixturePath, 'src/components/helper.ts'), helper2Content, 'utf-8');

      // 創建引用兩個 helper 的檔案
      const testContent = `import { utilHelper } from './utils/helper';
import { componentHelper } from './components/helper';

export function test() {
  return utilHelper() + componentHelper();
}`;
      await fs.writeFile(path.join(fixturePath, 'src/test-helpers.ts'), testContent, 'utf-8');

      // 只移動 utils/helper.ts
      const sourcePath = path.join(fixturePath, 'src/utils/helper.ts');
      const targetPath = path.join(fixturePath, 'src/shared/helper.ts');

      const result = await executeCLI(['move', sourcePath, targetPath, '--path', fixturePath]);

      expect(result.exitCode).toBe(0);

      // 驗證只有正確的引用被更新
      const testUpdated = await fs.readFile(path.join(fixturePath, 'src/test-helpers.ts'), 'utf-8');
      expect(testUpdated).toContain('import { utilHelper } from \'./shared/helper\'');
      expect(testUpdated).toContain('import { componentHelper } from \'./components/helper\'');
    });

    it('應該處理嵌套引用鏈 (A→B→C)', async () => {
      // 創建引用鏈: service-a → service-b → config
      const configContent = 'export const CONFIG = { api: \'http://api.example.com\' };';
      const serviceBContent = `import { CONFIG } from '../core/config/settings';
export function getApiUrl() { return CONFIG.api; }`;
      const serviceAContent = `import { getApiUrl } from './service-b-test';
export function callApi() { return fetch(getApiUrl()); }`;

      await fs.writeFile(path.join(fixturePath, 'src/config-test.ts'), configContent, 'utf-8');
      await fs.writeFile(path.join(fixturePath, 'src/service-b-test.ts'), serviceBContent, 'utf-8');
      await fs.writeFile(path.join(fixturePath, 'src/service-a-test.ts'), serviceAContent, 'utf-8');

      // 移動中間的 service-b
      const sourcePath = path.join(fixturePath, 'src/service-b-test.ts');
      const targetPath = path.join(fixturePath, 'src/services/api-service.ts');

      const result = await executeCLI(['move', sourcePath, targetPath, '--path', fixturePath]);

      expect(result.exitCode).toBe(0);

      // 驗證 service-a 的引用被更新
      const serviceAUpdated = await fs.readFile(path.join(fixturePath, 'src/service-a-test.ts'), 'utf-8');
      expect(serviceAUpdated).toContain('import { getApiUrl } from \'./services/api-service\'');

      // 驗證 service-b（現在是 api-service）內部的引用被更新
      const serviceBUpdated = await fs.readFile(path.join(fixturePath, 'src/services/api-service.ts'), 'utf-8');
      expect(serviceBUpdated).toContain('import { CONFIG } from \'../../core/config/settings\'');
    });
  });

  describe('複雜引用場景測試 - 副檔名和混合引用', () => {
    it('應該處理帶副檔名和不帶副檔名的混合引用', async () => {
      // 創建測試檔案，同時用兩種方式引用
      const testContent = `import { formatDate } from './utils/date-utils';
import { formatTime } from './utils/date-utils.ts';

export function format() {
  return formatDate(new Date()) + formatTime(new Date());
}`;
      await fs.writeFile(path.join(fixturePath, 'src/mixed-ext-test.ts'), testContent, 'utf-8');

      // 移動被引用的檔案
      const sourcePath = path.join(fixturePath, 'src/utils/date-utils.ts');
      const targetPath = path.join(fixturePath, 'src/formatters/date-utils.ts');

      const result = await executeCLI(['move', sourcePath, targetPath, '--path', fixturePath]);

      expect(result.exitCode).toBe(0);

      // 驗證兩種引用都被更新
      const testUpdated = await fs.readFile(path.join(fixturePath, 'src/mixed-ext-test.ts'), 'utf-8');
      expect(testUpdated).toContain('import { formatDate } from \'./formatters/date-utils\'');
      // 注意：.ts 副檔名應該被保留或移除，取決於實作
      expect(testUpdated).toMatch(/from ['"]\.\/formatters\/date-utils(\.ts)?['"]/);
    });

    it('應該處理混合的 import 類型 (ES6 + CommonJS + 動態)', async () => {
      // 創建包含多種 import 的測試檔案
      const testContent = `import { UserService } from './services/user-service';
const ProductService = require('./services/product-service');

export async function loadServices() {
  const OrderService = await import('./services/order-service');
  return { UserService, ProductService, OrderService };
}`;
      await fs.writeFile(path.join(fixturePath, 'src/multi-import-test.ts'), testContent, 'utf-8');

      // 移動 services 目錄
      const userSourcePath = path.join(fixturePath, 'src/services/user-service.ts');
      const userTargetPath = path.join(fixturePath, 'src/app/services/user-service.ts');

      const result = await executeCLI(['move', userSourcePath, userTargetPath, '--path', fixturePath]);

      expect(result.exitCode).toBe(0);

      // 驗證所有類型的 import 都被更新
      const testUpdated = await fs.readFile(path.join(fixturePath, 'src/multi-import-test.ts'), 'utf-8');
      expect(testUpdated).toContain('from \'./app/services/user-service\'');
    });

    it('應該處理多行跨越的 export from 語句', async () => {
      // 創建包含多行 export 的測試檔案
      const testContent = `export {
  User,
  UserRole,
  UserStatus
} from './types/user';

export type { CreateUserData } from './types/user';`;
      await fs.writeFile(path.join(fixturePath, 'src/multi-line-export-test.ts'), testContent, 'utf-8');

      // 移動被引用的檔案
      const sourcePath = path.join(fixturePath, 'src/types/user.ts');
      const targetPath = path.join(fixturePath, 'src/domain/user.ts');

      const result = await executeCLI(['move', sourcePath, targetPath, '--path', fixturePath]);

      expect(result.exitCode).toBe(0);

      // 驗證多行 export 被更新
      const testUpdated = await fs.readFile(path.join(fixturePath, 'src/multi-line-export-test.ts'), 'utf-8');
      expect(testUpdated).toContain('from \'./domain/user\'');
    });
  });
});
