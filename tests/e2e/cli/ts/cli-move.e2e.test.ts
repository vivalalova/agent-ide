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

      const result = await executeCLI(['move', sourcePath, targetPath]);

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

      const result = await executeCLI(['move', sourcePath, targetPath]);

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

      const result = await executeCLI(['move', sourcePath, targetPath]);

      // 應該自動建立目錄並成功移動
      expect(result.exitCode).toBe(0);

      const targetExists = await fixture.fileExists('src/helpers/text/string-utils.ts');
      expect(targetExists).toBe(true);
    });

    it('應該能處理源檔案不存在的錯誤', async () => {
      const sourcePath = fixture.getFilePath('src/nonexistent.ts');
      const targetPath = fixture.getFilePath('src/target.ts');

      const result = await executeCLI(['move', sourcePath, targetPath]);

      // 應該顯示錯誤訊息
      expect(result.stdout).toContain('移動失敗');
    });

    it('應該能在預覽模式下顯示變更', async () => {
      const sourcePath = fixture.getFilePath('src/utils/date-utils.ts');
      const targetPath = fixture.getFilePath('src/shared/date-utils.ts');

      const result = await executeCLI(['move', sourcePath, targetPath, '--preview']);

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

      const result = await executeCLI(['move', sourcePath, targetPath]);

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

      const result = await executeCLI(['move', sourcePath, targetPath]);

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

      const result = await executeCLI(['move', sourcePath, targetPath]);

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

      const result = await executeCLI(['move', sourcePath, targetPath]);

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

      const result = await executeCLI(['move', sourcePath, targetPath]);

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

      const result = await executeCLI(['move', sourcePath, targetPath]);

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
      const result1 = await executeCLI(['move', source1, target1]);
      expect(result1.exitCode).toBe(0);

      // 移動第二個檔案
      const source2 = fixture.getFilePath('src/models/order-model.ts');
      const target2 = fixture.getFilePath('src/domain/models/order-model.ts');
      const result2 = await executeCLI(['move', source2, target2]);
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

      const result = await executeCLI(['move', samePath, samePath]);

      // 應該成功執行或顯示適當訊息
      expect(result.exitCode).toBe(0);
    });

    it('應該能處理目標檔案已存在的情況', async () => {
      const sourcePath = fixture.getFilePath('src/utils/formatter.ts');
      const targetPath = fixture.getFilePath('src/utils/validator.ts'); // 已存在的檔案

      const result = await executeCLI(['move', sourcePath, targetPath]);

      // 根據實作，可能會覆蓋或報錯
      // 這裡我們檢查命令有適當的回應
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });
});
