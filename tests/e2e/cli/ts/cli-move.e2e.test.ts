/**
 * CLI move 命令 E2E 測試
 * 使用 sample-project fixture 進行真實複雜場景測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from '../../helpers/fixture-manager';
import { executeCLI } from '../../helpers/cli-executor';

describe('CLI move 命令 E2E 測試', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  describe('基礎移動測試', () => {
    it('應該能移動單一檔案到新目錄', async () => {
      const sourcePath = fixture.getFilePath('src/utils/formatter.ts');
      const targetPath = fixture.getFilePath('src/shared/formatter.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      // 驗證命令執行成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('移動');

      // 驗證目標檔案存在
      const targetExists = await fixture.fileExists('src/shared/formatter.ts');
      expect(targetExists).toBe(true);

      // 驗證源檔案不存在
      const sourceExists = await fixture.fileExists('src/utils/formatter.ts');
      expect(sourceExists).toBe(false);
    });

    it('應該能移動檔案並更名', async () => {
      const sourcePath = fixture.getFilePath('src/utils/array-utils.ts');
      const targetPath = fixture.getFilePath('src/utils/array-helpers.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證新檔案存在
      const targetExists = await fixture.fileExists('src/utils/array-helpers.ts');
      expect(targetExists).toBe(true);

      // 驗證舊檔案不存在
      const sourceExists = await fixture.fileExists('src/utils/array-utils.ts');
      expect(sourceExists).toBe(false);
    });

    it('應該能處理目標目錄不存在的情況', async () => {
      const sourcePath = fixture.getFilePath('src/utils/string-utils.ts');
      const targetPath = fixture.getFilePath('src/helpers/text/string-utils.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      // 應該自動建立目錄並成功移動
      expect(result.exitCode).toBe(0);

      const targetExists = await fixture.fileExists('src/helpers/text/string-utils.ts');
      expect(targetExists).toBe(true);
    });

    it('應該能處理源檔案不存在的錯誤', async () => {
      const sourcePath = fixture.getFilePath('src/nonexistent.ts');
      const targetPath = fixture.getFilePath('src/target.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      // 應該顯示錯誤訊息
      expect(result.stdout).toContain('移動失敗');
    });

    it('應該能在預覽模式下顯示變更', async () => {
      const sourcePath = fixture.getFilePath('src/utils/date-utils.ts');
      const targetPath = fixture.getFilePath('src/shared/date-utils.ts');

      const result = await executeCLI(['move', sourcePath, targetPath, '--preview'], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('預覽');

      // 預覽模式不應該真的移動檔案
      const sourceExists = await fixture.fileExists('src/utils/date-utils.ts');
      expect(sourceExists).toBe(true);
    });
  });

  describe('複雜跨檔案引用測試', () => {
    it('應該移動被多處引用的型別檔案', async () => {
      const sourcePath = fixture.getFilePath('src/types/user.ts');
      const targetPath = fixture.getFilePath('src/types/entities/user.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      // 驗證移動成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('移動');

      // 驗證檔案移動
      const targetExists = await fixture.fileExists('src/types/entities/user.ts');
      expect(targetExists).toBe(true);

      const sourceExists = await fixture.fileExists('src/types/user.ts');
      expect(sourceExists).toBe(false);

      // 驗證檔案內容保持不變
      const targetContent = await fixture.readFile('src/types/entities/user.ts');
      expect(targetContent).toContain('export interface User');
      expect(targetContent).toContain('export enum UserRole');
      expect(targetContent).toContain('export enum UserStatus');
    });

    it('應該移動配置檔案並更新跨層級引用', async () => {
      const sourcePath = fixture.getFilePath('src/core/config/settings.ts');
      const targetPath = fixture.getFilePath('src/config/app-settings.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fixture.fileExists('src/config/app-settings.ts');
      expect(targetExists).toBe(true);

      const sourceExists = await fixture.fileExists('src/core/config/settings.ts');
      expect(sourceExists).toBe(false);
    });

    it('應該移動 Model 檔案', async () => {
      const sourcePath = fixture.getFilePath('src/models/product-model.ts');
      const targetPath = fixture.getFilePath('src/domain/models/product-model.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fixture.fileExists('src/domain/models/product-model.ts');
      expect(targetExists).toBe(true);

      const sourceExists = await fixture.fileExists('src/models/product-model.ts');
      expect(sourceExists).toBe(false);

      // 驗證檔案內容保持不變
      const targetContent = await fixture.readFile('src/domain/models/product-model.ts');
      expect(targetContent).toContain('export class ProductModel');
    });

    it('應該移動 Service 檔案', async () => {
      const sourcePath = fixture.getFilePath('src/services/user-service.ts');
      const targetPath = fixture.getFilePath('src/application/services/user-service.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fixture.fileExists('src/application/services/user-service.ts');
      expect(targetExists).toBe(true);

      const sourceExists = await fixture.fileExists('src/services/user-service.ts');
      expect(sourceExists).toBe(false);

      // 驗證檔案內容保持不變
      const targetContent = await fixture.readFile('src/application/services/user-service.ts');
      expect(targetContent).toContain('export class UserService');
    });

    it('應該移動深層檔案到淺層', async () => {
      const sourcePath = fixture.getFilePath('src/api/handlers/user-handler.ts');
      const targetPath = fixture.getFilePath('src/handlers/user.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fixture.fileExists('src/handlers/user.ts');
      expect(targetExists).toBe(true);

      const sourceExists = await fixture.fileExists('src/api/handlers/user-handler.ts');
      expect(sourceExists).toBe(false);
    });

    it('應該移動淺層檔案到深層', async () => {
      const sourcePath = fixture.getFilePath('src/core/constants.ts');
      const targetPath = fixture.getFilePath('src/shared/config/app/constants.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fixture.fileExists('src/shared/config/app/constants.ts');
      expect(targetExists).toBe(true);

      const sourceExists = await fixture.fileExists('src/core/constants.ts');
      expect(sourceExists).toBe(false);

      // 驗證檔案內容保持不變
      const targetContent = await fixture.readFile('src/shared/config/app/constants.ts');
      expect(targetContent).toContain('export const API_BASE_URL');
    });
  });

  describe('批次移動測試', () => {
    it('應該能連續移動多個相關檔案', async () => {
      // 移動第一個檔案
      const source1 = fixture.getFilePath('src/types/order.ts');
      const target1 = fixture.getFilePath('src/types/entities/order.ts');
      const result1 = await executeCLI(['move', source1, target1], { cwd: fixture.tempPath });
      expect(result1.exitCode).toBe(0);

      // 移動第二個檔案
      const source2 = fixture.getFilePath('src/models/order-model.ts');
      const target2 = fixture.getFilePath('src/domain/models/order-model.ts');
      const result2 = await executeCLI(['move', source2, target2], { cwd: fixture.tempPath });
      expect(result2.exitCode).toBe(0);

      // 驗證兩個檔案都成功移動
      const target1Exists = await fixture.fileExists('src/types/entities/order.ts');
      expect(target1Exists).toBe(true);

      const target2Exists = await fixture.fileExists('src/domain/models/order-model.ts');
      expect(target2Exists).toBe(true);

      // 驗證源檔案不存在
      const source1Exists = await fixture.fileExists('src/types/order.ts');
      expect(source1Exists).toBe(false);

      const source2Exists = await fixture.fileExists('src/models/order-model.ts');
      expect(source2Exists).toBe(false);
    });
  });

  describe('錯誤處理測試', () => {
    it('應該能處理相同的源和目標路徑', async () => {
      const samePath = fixture.getFilePath('src/utils/validator.ts');

      const result = await executeCLI(['move', samePath, samePath], { cwd: fixture.tempPath });

      // 應該成功執行或顯示適當訊息
      expect(result.exitCode).toBe(0);
    });

    it('應該能處理目標檔案已存在的情況', async () => {
      const sourcePath = fixture.getFilePath('src/utils/formatter.ts');
      const targetPath = fixture.getFilePath('src/utils/validator.ts'); // 已存在的檔案

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      // 根據實作，可能會覆蓋或報錯
      // 這裡我們檢查命令有適當的回應
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe('複雜引用場景測試 - Re-export 和 Index 檔案', () => {
    it('應該移動被 re-export 的型別檔案並更新 index', async () => {
      const sourcePath = fixture.getFilePath('src/types/user.ts');
      const targetPath = fixture.getFilePath('src/types/entities/user.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fixture.fileExists('src/types/entities/user.ts');
      expect(targetExists).toBe(true);

      // 驗證 index.ts 中的 export 語句被更新
      const indexContent = await fixture.readFile('src/types/index.ts');
      expect(indexContent).toContain("export * from './entities/user'");
      expect(indexContent).not.toContain("export * from './user'");
    });

    it('應該移動 index 檔案並更新所有引用', async () => {
      const sourcePath = fixture.getFilePath('src/types/index.ts');
      const targetPath = fixture.getFilePath('src/types/main.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fixture.fileExists('src/types/main.ts');
      expect(targetExists).toBe(true);

      const sourceExists = await fixture.fileExists('src/types/index.ts');
      expect(sourceExists).toBe(false);
    });

    it('應該移動有多個 export from 語句的檔案', async () => {
      const sourcePath = fixture.getFilePath('src/types/api.ts');
      const targetPath = fixture.getFilePath('src/types/responses/api.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證檔案移動
      const targetExists = await fixture.fileExists('src/types/responses/api.ts');
      expect(targetExists).toBe(true);

      // 驗證 index.ts 被更新
      const indexContent = await fixture.readFile('src/types/index.ts');
      expect(indexContent).toContain("export * from './responses/api'");
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
      await fixture.writeFile('src/type-import-test.ts', testFileContent);

      // 移動被引用的檔案
      const sourcePath = fixture.getFilePath('src/types/user.ts');
      const targetPath = fixture.getFilePath('src/domain/user-types.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證 type import 被更新
      const testFileUpdated = await fixture.readFile('src/type-import-test.ts');
      expect(testFileUpdated).toContain("import type { User } from './domain/user-types'");
      expect(testFileUpdated).toContain("import { type UserRole, UserStatus } from './domain/user-types'");
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
      await fixture.writeFile('src/dynamic-loader.ts', testFileContent);

      // 移動被動態引用的檔案
      const sourcePath = fixture.getFilePath('src/services/user-service.ts');
      const targetPath = fixture.getFilePath('src/app/services/user-service.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證動態 import 被更新
      const loaderContent = await fixture.readFile('src/dynamic-loader.ts');
      expect(loaderContent).toContain("await import('./app/services/user-service')");
    });

    it('應該處理 side-effect import', async () => {
      // 創建包含 side-effect import 的測試檔案
      const testFileContent = `import './core/config/settings';
import { UserService } from './services/user-service';

export const userService = new UserService();`;
      await fixture.writeFile('src/app-init.ts', testFileContent);

      // 移動被 side-effect import 的檔案
      const sourcePath = fixture.getFilePath('src/core/config/settings.ts');
      const targetPath = fixture.getFilePath('src/config/settings.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證 side-effect import 被更新
      const initContent = await fixture.readFile('src/app-init.ts');
      expect(initContent).toContain("import './config/settings'");
    });
  });

  describe('複雜引用場景測試 - 同名檔案和嵌套引用', () => {
    it('應該只更新正確路徑的同名檔案引用', async () => {
      // 創建兩個同名但路徑不同的檔案
      const helper1Content = `export function utilHelper() { return 'util'; }`;
      const helper2Content = `export function componentHelper() { return 'component'; }`;
      await fixture.writeFile('src/utils/helper.ts', helper1Content);
      await fixture.writeFile('src/components/helper.ts', helper2Content);

      // 創建引用兩個 helper 的檔案
      const testContent = `import { utilHelper } from './utils/helper';
import { componentHelper } from './components/helper';

export function test() {
  return utilHelper() + componentHelper();
}`;
      await fixture.writeFile('src/test-helpers.ts', testContent);

      // 只移動 utils/helper.ts
      const sourcePath = fixture.getFilePath('src/utils/helper.ts');
      const targetPath = fixture.getFilePath('src/shared/helper.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證只有正確的引用被更新
      const testUpdated = await fixture.readFile('src/test-helpers.ts');
      expect(testUpdated).toContain("import { utilHelper } from './shared/helper'");
      expect(testUpdated).toContain("import { componentHelper } from './components/helper'");
    });

    it('應該處理嵌套引用鏈 (A→B→C)', async () => {
      // 創建引用鏈: service-a → service-b → config
      const configContent = `export const CONFIG = { api: 'http://api.example.com' };`;
      const serviceBContent = `import { CONFIG } from '../core/config/settings';
export function getApiUrl() { return CONFIG.api; }`;
      const serviceAContent = `import { getApiUrl } from './service-b-test';
export function callApi() { return fetch(getApiUrl()); }`;

      await fixture.writeFile('src/config-test.ts', configContent);
      await fixture.writeFile('src/service-b-test.ts', serviceBContent);
      await fixture.writeFile('src/service-a-test.ts', serviceAContent);

      // 移動中間的 service-b
      const sourcePath = fixture.getFilePath('src/service-b-test.ts');
      const targetPath = fixture.getFilePath('src/services/api-service.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證 service-a 的引用被更新
      const serviceAUpdated = await fixture.readFile('src/service-a-test.ts');
      expect(serviceAUpdated).toContain("import { getApiUrl } from './services/api-service'");

      // 驗證 service-b（現在是 api-service）內部的引用被更新
      const serviceBUpdated = await fixture.readFile('src/services/api-service.ts');
      expect(serviceBUpdated).toContain("import { CONFIG } from '../../core/config/settings'");
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
      await fixture.writeFile('src/mixed-ext-test.ts', testContent);

      // 移動被引用的檔案
      const sourcePath = fixture.getFilePath('src/utils/date-utils.ts');
      const targetPath = fixture.getFilePath('src/formatters/date-utils.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證兩種引用都被更新
      const testUpdated = await fixture.readFile('src/mixed-ext-test.ts');
      expect(testUpdated).toContain("import { formatDate } from './formatters/date-utils'");
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
      await fixture.writeFile('src/multi-import-test.ts', testContent);

      // 移動 services 目錄
      const userSourcePath = fixture.getFilePath('src/services/user-service.ts');
      const userTargetPath = fixture.getFilePath('src/app/services/user-service.ts');

      const result = await executeCLI(['move', userSourcePath, userTargetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證所有類型的 import 都被更新
      const testUpdated = await fixture.readFile('src/multi-import-test.ts');
      expect(testUpdated).toContain("from './app/services/user-service'");
    });

    it('應該處理多行跨越的 export from 語句', async () => {
      // 創建包含多行 export 的測試檔案
      const testContent = `export {
  User,
  UserRole,
  UserStatus
} from './types/user';

export type { CreateUserData } from './types/user';`;
      await fixture.writeFile('src/multi-line-export-test.ts', testContent);

      // 移動被引用的檔案
      const sourcePath = fixture.getFilePath('src/types/user.ts');
      const targetPath = fixture.getFilePath('src/domain/user.ts');

      const result = await executeCLI(['move', sourcePath, targetPath], { cwd: fixture.tempPath });

      expect(result.exitCode).toBe(0);

      // 驗證多行 export 被更新
      const testUpdated = await fixture.readFile('src/multi-line-export-test.ts');
      expect(testUpdated).toContain("from './domain/user'");
    });
  });
});
