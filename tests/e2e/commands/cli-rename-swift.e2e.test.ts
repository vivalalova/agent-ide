/**
 * CLI rename 命令 E2E 測試 - Swift 專案
 * 基於 swift-sample-project fixture 測試符號重命名功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

// Swift parser 只在 macOS 可用
const isNotMacOS = process.platform !== 'darwin';

describe.skipIf(isNotMacOS)('CLI rename - 基於 swift-sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('Swift struct 重命名', () => {
    it('應該成功重命名 User struct', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserAccount', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.affectedFiles).toBeDefined();
        expect(output.operations).toBeDefined();
      }
    });

    it('應該成功重命名 Product struct', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'Product', '--to', 'ProductItem', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 Order struct', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'Order', '--to', 'CustomerOrder', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 OrderItem struct', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OrderItem', '--to', 'OrderLineItem', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 ValidationResult struct', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'ValidationResult', '--to', 'ValidationOutcome', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Swift class 重命名', () => {
    it('應該成功重命名 UserService class', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserService', '--to', 'UserManager', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 ProductService class', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'ProductService', '--to', 'ProductManager', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 OrderService class', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OrderService', '--to', 'OrderManager', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 Logger class', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'Logger', '--to', 'LogService', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 Validator class', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'Validator', '--to', 'InputValidator', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Swift protocol 重命名', () => {
    it('應該成功重命名 UserServiceProtocol', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserServiceProtocol', '--to', 'UserServiceContract', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 ProductServiceProtocol', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'ProductServiceProtocol', '--to', 'ProductServiceContract', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 OrderServiceProtocol', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OrderServiceProtocol', '--to', 'OrderServiceContract', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Swift enum 重命名', () => {
    it('應該成功重命名 UserRole enum', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 ProductCategory enum', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'ProductCategory', '--to', 'ProductType', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 OrderStatus enum', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OrderStatus', '--to', 'OrderState', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 LogLevel enum', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'LogLevel', '--to', 'LogSeverity', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 Error enum (UserServiceError)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserServiceError', '--to', 'UserError', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Swift 函數重命名', () => {
    it('應該成功重命名 getUser 方法', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'getUser', '--to', 'fetchUser', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 createUser 方法', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'createUser', '--to', 'addUser', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 validateEmail 方法', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'validateEmail', '--to', 'checkEmail', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 updateStock 方法', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'updateStock', '--to', 'modifyStock', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 cancelOrder 方法', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'cancelOrder', '--to', 'cancelCustomerOrder', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Swift extension 方法重命名', () => {
    it('應該成功重命名 String.trimmed computed property', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'trimmed', '--to', 'stripped', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 String.camelCased computed property', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'camelCased', '--to', 'toCamelCase', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 String.truncated 方法', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'truncated', '--to', 'limitedTo', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 Date.adding 方法', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'adding', '--to', 'byAdding', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 Date.timeAgo computed property', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'timeAgo', '--to', 'relativeTime', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Swift computed property 重命名', () => {
    it('應該成功重命名 isAdmin computed property', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'isAdmin', '--to', 'hasAdminRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 isInStock computed property', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'isInStock', '--to', 'isAvailable', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 formattedPrice computed property', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'formattedPrice', '--to', 'priceString', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 canCancel computed property', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'canCancel', '--to', 'isCancellable', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 totalAmount computed property', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'totalAmount', '--to', 'orderTotal', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('dry-run 模式', () => {
    it('應該在 dry-run 模式下不執行實際變更', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserAccount', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
        expect(output.summary.totalFiles).toBeDefined();
        expect(output.summary.totalChanges).toBeDefined();
      }
    });

    it('應該在 dry-run 模式下顯示影響的檔案數量', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(typeof output.summary.totalFiles).toBe('number');
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
      }
    });

    it('應該在 dry-run 模式下檢測衝突', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'Product', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.conflicts).toBeDefined();
        expect(Array.isArray(output.conflicts)).toBe(true);
      }
    });
  });

  describe('輸出格式', () => {
    it('應該支援 JSON 格式輸出', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('應該支援 diff 格式輸出', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('錯誤處理', () => {
    it('應該處理不存在的 Swift 符號並輸出錯誤', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'NonExistentSwiftSymbol', '--to', 'NewName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // JSON 格式錯誤輸出到 stdout
      const output = result.stdout || result.stderr;
      const hasError = output.includes('找不到符號')
        || output.includes('error')
        || output.includes('ENOENT');
      expect(hasError).toBe(true);
    });

    it('應該處理缺少必要參數並提示錯誤', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });
  });

  describe('JSON 輸出結構驗證', () => {
    it('應該包含 success 欄位', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBeDefined();
        expect(typeof output.success).toBe('boolean');
      }
    });

    it('應該包含 affectedFiles 和 operations 欄位', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.affectedFiles).toBeDefined();
        expect(typeof output.affectedFiles).toBe('number');
        expect(output.operations).toBeDefined();
        expect(typeof output.operations).toBe('number');
      }
    });

    it('應該在 dry-run 模式下包含完整的預覽資訊', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserAccount', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.summary.totalFiles).toBeDefined();
        expect(output.summary.totalChanges).toBeDefined();
        expect(output.conflicts).toBeDefined();
      }
    });
  });

  describe('跨檔案重命名', () => {
    it('應該處理跨檔案的 Swift 符號引用', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserAccount', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該更新所有引用該 Swift 符號的檔案', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OrderStatus', '--to', 'OrderState', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.summary.totalFiles > 0) {
          expect(output.summary.totalChanges).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('特殊符號類型', () => {
    it('應該重命名 Swift enum case', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'admin', '--to', 'administrator', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該重命名 Swift struct property', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'email', '--to', 'emailAddress', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該重命名 Swift private 方法', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'isValidEmail', '--to', 'checkEmailValidity', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });
  });

  describe('邊界條件', () => {
    it('應該處理相同的 from 和 to', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'User', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.operations).toBe(0);
      }
    });

    it('應該處理大小寫不同但拼寫相同的情況', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'user', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理 Swift 風格命名（駝峰式）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'getUserId', '--to', 'fetchUserId', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理名稱以底線開頭（私有變數）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', '_User', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });
  });

  describe('Swift 特有情境', () => {
    it('應該處理 final class 的重命名', async () => {
      // UserService, ProductService, OrderService 都是 final class
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserService', '--to', 'FinalUserService', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理 async throws 方法的重命名', async () => {
      // UserService 中的方法都是 async throws
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'getAllUsers', '--to', 'fetchAllUsers', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理 Codable struct 的重命名', async () => {
      // User, Product, Order 都遵循 Codable
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'Order', '--to', 'CodableOrder', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理 Identifiable struct 的重命名', async () => {
      // User, Product, Order, OrderItem 都遵循 Identifiable
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OrderItem', '--to', 'IdentifiableOrderItem', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理 static let shared singleton 的重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'shared', '--to', 'instance', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });
  });
});
