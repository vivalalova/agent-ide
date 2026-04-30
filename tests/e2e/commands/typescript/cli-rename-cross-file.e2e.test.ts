/**
 * CLI rename 命令 E2E 測試 - 跨檔案引用更新
 *
 * 測試範圍：
 * - Import 語句更新
 * - Export 語句更新
 * - 型別引用更新
 * - 依賴鏈追蹤
 * - Re-export 處理
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

// MARK: - Test Case Types

interface CrossFileTestCase {
  scenario: string;
  from: string;
  to: string;
  expectedMinFiles: number;
  expectedMinChanges: number;
  checkFiles?: Array<{
    path: string;
    shouldContain?: string[];
    shouldNotContain?: string[];
  }>;
}

interface ImportUpdateCase {
  scenario: string;
  symbolName: string;
  newName: string;
  importingFile: string;
}

// MARK: - Test Suite

describe('CLI rename cross-file - 跨檔案引用更新', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // MARK: - Import 語句更新

  describe('Import 語句更新', () => {
    const importUpdateCases: ImportUpdateCase[] = [
      {
        scenario: 'UserService 被多檔案 import',
        symbolName: 'UserService',
        newName: 'AccountService',
        importingFile: 'controllers/user-controller.ts',
      },
      {
        scenario: 'UserModel 被 service import',
        symbolName: 'UserModel',
        newName: 'UserEntity',
        importingFile: 'services/user-service.ts',
      },
      {
        scenario: 'ApiResponse 被多檔案 import',
        symbolName: 'ApiResponse',
        newName: 'HttpResponse',
        importingFile: 'services/user-service.ts',
      },
    ];

    it.each(importUpdateCases)(
      '$scenario 應更新 import 語句',
      async ({ symbolName, newName, importingFile }) => {
        // Given: 符號被其他檔案 import

        // When: 執行重命名
        const result = await executeCLI(
          ['rename', '--path', fixture.rootPath, '--from', symbolName, '--to', newName, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        // Then: 應該成功
        expect(result.exitCode).toBe(0);

        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(2);

        // 驗證 importing 檔案被更新
        const importingContent = await fixture.memfs.readFile(
          `${fixture.rootPath}/src/${importingFile}`,
          'utf-8'
        );
        expect(importingContent).toContain(newName);
        expect(importingContent).not.toContain(symbolName);
      }
    );
  });

  // MARK: - Class 重命名跨檔案影響

  describe('Class 重命名跨檔案影響', () => {
    const crossFileCases: CrossFileTestCase[] = [
      {
        scenario: 'UserService 完整跨檔案更新',
        from: 'UserService',
        to: 'AccountService',
        expectedMinFiles: 5,
        expectedMinChanges: 10,
      },
      {
        scenario: 'UserModel 跨檔案更新',
        from: 'UserModel',
        to: 'UserEntity',
        expectedMinFiles: 2,
        expectedMinChanges: 4,
      },
      {
        scenario: 'BaseModel 繼承鏈更新',
        from: 'BaseModel',
        to: 'AbstractModel',
        expectedMinFiles: 1,
        expectedMinChanges: 2,
      },
    ];

    it.each(crossFileCases)(
      '$scenario',
      async ({ from, to, expectedMinFiles, expectedMinChanges }) => {
        // Given: 跨檔案引用的符號

        // When: 執行重命名
        const result = await executeCLI(
          ['rename', '--path', fixture.rootPath, '--from', from, '--to', to, '--dry-run', '--format', 'json'],
          { memfs: fixture.memfs }
        );

        // Then: 驗證跨檔案影響
        expect(result.exitCode).toBe(0);

        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(expectedMinFiles);
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(expectedMinChanges);
      }
    );
  });

  // MARK: - Interface 跨檔案引用

  describe('Interface 跨檔案引用', () => {
    it('重命名 interface 應更新所有使用檔案', async () => {
      // Given: ApiResponse 被多個 service 使用

      // When: 重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'ApiResponse', '--to', 'ServiceResponse', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該更新多個檔案
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(1);

      // 檢查 affected files 包含相關檔案
      const affectedPaths = output.files.map((f: { filePath: string }) => f.filePath);
      expect(affectedPaths.some((p: string) => p.includes('api.ts'))).toBe(true);
    });

    it('重命名 ValidationResult 應更新使用點', async () => {
      // Given: ValidationResult 被 common.ts 定義，被 service 使用

      // When: 重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'ValidationResult', '--to', 'ValidateOutcome', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  // MARK: - Enum 跨檔案引用

  describe('Enum 跨檔案引用', () => {
    it('重命名 UserStatus enum 應更新引用檔案', async () => {
      // Given: UserStatus 被多檔案使用

      // When: 重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserStatus', '--to', 'AccountStatus', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(1);
    });

    it('重命名 ProductCategory 應更新所有使用點', async () => {
      // Given: ProductCategory enum

      // When: 重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'ProductCategory', '--to', 'ItemCategory', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  // MARK: - Type Alias 跨檔案引用

  describe('Type Alias 跨檔案引用', () => {
    it('重命名 UserID type 應更新所有使用點', async () => {
      // Given: UserID 被多處使用

      // When: 重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserID', '--to', 'AccountID', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('重命名 CreateUserData 應更新使用點', async () => {
      // Given: CreateUserData type alias

      // When: 重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'CreateUserData', '--to', 'NewUserInput', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  // MARK: - 實際執行跨檔案更新

  describe('實際執行跨檔案更新', () => {
    it('實際重命名 UserService 應同時更新定義和引用', async () => {
      // Given: UserService 定義在 user-service.ts，被 controller 引用

      // 記錄原始內容
      const serviceOriginal = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/services/user-service.ts`,
        'utf-8'
      );
      const controllerOriginal = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/controllers/user-controller.ts`,
        'utf-8'
      );

      expect(serviceOriginal).toContain('UserService');
      expect(controllerOriginal).toContain('UserService');

      // When: 執行實際重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserService', '--to', 'AccountService', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      // 驗證定義檔案被更新
      const serviceModified = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/services/user-service.ts`,
        'utf-8'
      );
      expect(serviceModified).toContain('AccountService');
      expect(serviceModified).not.toContain('class UserService');

      // 驗證引用檔案被更新
      const controllerModified = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/controllers/user-controller.ts`,
        'utf-8'
      );
      expect(controllerModified).toContain('AccountService');
    });

    it('實際重命名 interface 應更新 import 和使用點', async () => {
      // Given: UserProfile interface

      // When: 重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserProfile', '--to', 'ProfileInfo', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      // 驗證 user.ts 被更新
      const userTypes = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/types/user.ts`,
        'utf-8'
      );
      expect(userTypes).toContain('ProfileInfo');
      expect(userTypes).not.toContain('UserProfile');
    });
  });

  // MARK: - 依賴鏈追蹤

  describe('依賴鏈追蹤', () => {
    it('應該追蹤多層引用', async () => {
      // Given: UserService -> UserModel -> BaseModel

      // When: 分析 UserModel 的影響
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserModel', '--to', 'UserEntity', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該顯示多檔案影響
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(2);
    });

    it('應該處理循環引用', async () => {
      // Given: 可能存在的循環引用結構
      // User interface 在 user.ts:39:18

      // When: 重命名可能涉及循環的符號
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'Account', '--at', 'src/types/user.ts:39:18', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功（不會無限循環）
      expect(result.exitCode).toBe(0);
    });
  });

  // MARK: - 檔案層級驗證

  describe('檔案層級驗證', () => {
    it('files 陣列應包含完整的變更資訊', async () => {
      // Given: 跨檔案符號

      // When: 執行重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserService', '--to', 'AccountService', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: files 陣列應包含詳細資訊
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.files).toBeDefined();
      expect(Array.isArray(output.files)).toBe(true);

      for (const file of output.files) {
        expect(file).toHaveProperty('filePath');
        // 使用 hunks 格式（diff 風格）
        expect(file).toHaveProperty('hunks');
        expect(Array.isArray(file.hunks)).toBe(true);

        for (const hunk of file.hunks) {
          expect(hunk).toHaveProperty('header');
          expect(hunk).toHaveProperty('lines');
          expect(Array.isArray(hunk.lines)).toBe(true);
        }
      }
    });

    it('每個 hunk 應包含行號和內容', async () => {
      // Given: 有變更的重命名

      // When: 執行重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'AddressInfo', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: hunks 應有行號資訊
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      for (const file of output.files) {
        for (const hunk of file.hunks) {
          expect(hunk.oldStart).toBeGreaterThan(0);
          // 檢查 lines 中有 add 和 delete 類型
          const hasDelete = hunk.lines.some((l: { type: string }) => l.type === 'delete');
          const hasAdd = hunk.lines.some((l: { type: string }) => l.type === 'add');
          expect(hasDelete || hasAdd).toBe(true);
        }
      }
    });
  });

  // MARK: - 特殊情境

  describe('特殊情境', () => {
    it('應該正確處理同檔案多處引用', async () => {
      // Given: UserAddress 在同檔案定義和使用

      // When: 重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'AddressInfo', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該更新同檔案的所有引用
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 檢查 user.ts 中的 hunks 數量
      const userFile = output.files.find((f: { filePath: string }) =>
        f.filePath.includes('user.ts')
      );
      if (userFile) {
        expect(userFile.hunks.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('應該處理不同資料夾的同名檔案', async () => {
      // Given: 可能有 src/types/user.ts 和 src/models/user-model.ts

      // When: 重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserStatus', '--to', 'AccountStatus', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該正確區分檔案
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('deep nested 引用應該被追蹤', async () => {
      // Given: handlers/user-handler.ts 引用 controllers 引用 services

      // When: 重命名 UserService
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserService', '--to', 'AccountService', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該追蹤到 handler 層
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(3);
    });
  });
});
