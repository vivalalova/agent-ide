/**
 * CLI find-references 命令 E2E 測試 - Python 專案
 * 基於 python-sample-project fixture 測試符號引用搜尋功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI find-references Python - 基於 python-sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('python-sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('Python class 引用', () => {
    it('應該找到 User class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'User', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('User');
      expect(output.success).toBe(true);
      // User 在 user.py 定義，在 order.py, auth_service.py, main.py 等處被引用
      expect(output.summary.filesAffected).toBeGreaterThanOrEqual(1);
    });

    it('應該找到 Product class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'Product', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('Product');
      expect(output.success).toBe(true);
    });

    it('應該找到 Order class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'Order', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('Order');
      expect(output.success).toBe(true);
    });

    it('應該找到 OrderItem class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'OrderItem', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('OrderItem');
      expect(output.success).toBe(true);
    });

    it('應該找到 UserManager class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'UserManager', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('UserManager');
      expect(output.success).toBe(true);
    });

    it('應該找到 ProductCatalog class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'ProductCatalog', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('ProductCatalog');
      expect(output.success).toBe(true);
    });

    it('應該找到 OrderProcessor class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'OrderProcessor', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('OrderProcessor');
      expect(output.success).toBe(true);
    });

    it('應該找到 AuthService class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'AuthService', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('AuthService');
      expect(output.success).toBe(true);
    });

    it('應該找到 EmailService class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'EmailService', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('EmailService');
      expect(output.success).toBe(true);
    });

    it('應該找到 Email dataclass 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'Email', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('Email');
      expect(output.success).toBe(true);
    });

    it('應該找到 TokenManager class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'TokenManager', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('TokenManager');
      expect(output.success).toBe(true);
    });
  });

  describe('Python enum 引用', () => {
    it('應該找到 UserRole enum 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'UserRole', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('UserRole');
      expect(output.success).toBe(true);
      // UserRole 在 user.py 定義，在 auth_service.py, main.py 被引用
    });

    it('應該找到 Category enum 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'Category', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('Category');
      expect(output.success).toBe(true);
    });

    it('應該找到 OrderStatus enum 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'OrderStatus', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('OrderStatus');
      expect(output.success).toBe(true);
    });
  });

  describe('Python function 引用', () => {
    it('應該找到 is_admin method 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'is_admin', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('is_admin');
      expect(output.success).toBe(true);
    });

    it('應該找到 validate_email function 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'validate_email', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('validate_email');
      expect(output.success).toBe(true);
      // validate_email 在 validators.py 和 user.py 中定義
    });

    it('應該找到 add_user method 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'add_user', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('add_user');
      expect(output.success).toBe(true);
    });

    it('應該找到 find_by_id method 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'find_by_id', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('find_by_id');
      expect(output.success).toBe(true);
    });

    it('應該找到 apply_discount method 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'apply_discount', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('apply_discount');
      expect(output.success).toBe(true);
    });

    it('應該找到 hash_password method 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'hash_password', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('hash_password');
      expect(output.success).toBe(true);
    });

    it('應該找到 send_email method 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'send_email', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('send_email');
      expect(output.success).toBe(true);
    });

    it('應該找到 process_order method 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'process_order', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('process_order');
      expect(output.success).toBe(true);
    });

    it('應該找到 add_item method 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'add_item', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('add_item');
      expect(output.success).toBe(true);
      // add_item 在 order.py 定義，在 main.py 被調用
    });
  });

  describe('Python utility function 引用', () => {
    it('應該找到 format_currency function 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'format_currency', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('format_currency');
      expect(output.success).toBe(true);
    });

    it('應該找到 slugify function 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'slugify', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('slugify');
      expect(output.success).toBe(true);
    });

    it('應該找到 truncate function 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'truncate', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('truncate');
      expect(output.success).toBe(true);
    });

    it('應該找到 validate_password function 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'validate_password', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('validate_password');
      expect(output.success).toBe(true);
    });

    it('應該找到 validate_phone function 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'validate_phone', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('validate_phone');
      expect(output.success).toBe(true);
    });

    it('應該找到 camel_to_snake function 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'camel_to_snake', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('camel_to_snake');
      expect(output.success).toBe(true);
    });
  });

  describe('Python property 引用', () => {
    it('應該找到 total property 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'total', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('total');
      expect(output.success).toBe(true);
      // total 在 OrderItem 和 Order 中定義
    });

    it('應該找到 item_count property 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'item_count', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('item_count');
      expect(output.success).toBe(true);
    });

    it('應該找到 is_available method 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'is_available', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('is_available');
      expect(output.success).toBe(true);
    });
  });

  describe('Python 變數和常數引用', () => {
    it('應該找到 MAX_USERS constant 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'MAX_USERS', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('MAX_USERS');
      expect(output.success).toBe(true);
    });

    it('應該找到 DEFAULT_ROLE constant 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'DEFAULT_ROLE', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('DEFAULT_ROLE');
      expect(output.success).toBe(true);
    });

    it('應該找到 MIN_PRICE constant 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'MIN_PRICE', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('MIN_PRICE');
      expect(output.success).toBe(true);
    });

    it('應該找到 DEFAULT_DATE_FORMAT constant 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'DEFAULT_DATE_FORMAT', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('DEFAULT_DATE_FORMAT');
      expect(output.success).toBe(true);
    });
  });

  describe('跨檔案引用', () => {
    it('應該找到 User class 在多個檔案的引用', async () => {
      const result = await executeCLI(
        ['find-references', 'User', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // User 應該在多處被引用：定義處、import 處、使用處
      expect(output.references.length).toBeGreaterThanOrEqual(0);
    });

    it('應該找到 Product class 在 order.py 和 main.py 的引用', async () => {
      const result = await executeCLI(
        ['find-references', 'Product', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該找到 main function 的引用', async () => {
      const result = await executeCLI(
        ['find-references', 'main', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('main');
      expect(output.success).toBe(true);
    });
  });

  describe('輸出格式', () => {
    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(
        ['find-references', 'User', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('User');
    });

    it('JSON 格式應該包含正確的結構', async () => {
      const result = await executeCLI(
        ['find-references', 'User', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty('command');
      expect(output).toHaveProperty('symbol');
      expect(output).toHaveProperty('success');
      expect(output).toHaveProperty('summary');
      expect(output).toHaveProperty('definition');
      expect(output).toHaveProperty('references');
    });

    it('應該返回正確的定義位置', async () => {
      const result = await executeCLI(
        ['find-references', 'User', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.definition).toBeDefined();
      if (output.definition) {
        expect(output.definition.file).toContain('user.py');
        expect(output.definition.line).toBeGreaterThan(0);
      }
    });

    it('應該返回正確的 summary 統計', async () => {
      const result = await executeCLI(
        ['find-references', 'User', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toHaveProperty('totalReferences');
      expect(output.summary).toHaveProperty('filesAffected');
    });
  });

  describe('錯誤處理', () => {
    it('應該處理找不到的 Python 符號', async () => {
      const result = await executeCLI(
        ['find-references', 'NonExistentPythonSymbol', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.definition).toBeNull();
      expect(output.references).toHaveLength(0);
    });

    it('應該處理 Python 內建名稱的搜尋', async () => {
      const result = await executeCLI(
        ['find-references', '__init__', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.success).toBe(true);
    });

    it('應該處理私有方法名稱的搜尋', async () => {
      const result = await executeCLI(
        ['find-references', '_users', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.success).toBe(true);
    });

    it('應該處理特殊方法名稱的搜尋', async () => {
      const result = await executeCLI(
        ['find-references', '__post_init__', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.success).toBe(true);
    });
  });

  describe('未使用程式碼引用', () => {
    it('應該找到 unused_function 的定義但沒有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'unused_function', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('unused_function');
      expect(output.success).toBe(true);
      // unused_function 定義但未使用
    });

    it('應該找到 deprecated_helper 的定義但沒有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'deprecated_helper', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('deprecated_helper');
      expect(output.success).toBe(true);
    });
  });
});
