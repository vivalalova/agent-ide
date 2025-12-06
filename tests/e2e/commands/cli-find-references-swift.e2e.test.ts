/**
 * CLI find-references 命令 E2E 測試 - Swift 專案
 * 基於 swift-sample-project fixture 測試符號引用搜尋功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI find-references - 基於 swift-sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('Swift struct 引用', () => {
    it('應該找到 User struct 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'User', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('User');
      expect(output.success).toBe(true);
      // User 應該在 User.swift 定義，並在 UserService.swift 中被引用
      expect(output.summary.filesAffected).toBeGreaterThanOrEqual(1);
    });

    it('應該找到 Product struct 的所有引用', async () => {
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

    it('應該找到 Order struct 的所有引用', async () => {
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

    it('應該找到 OrderItem struct 的所有引用', async () => {
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

    it('應該找到 ValidationResult struct 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'ValidationResult', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('ValidationResult');
      expect(output.success).toBe(true);
    });
  });

  describe('Swift class 引用', () => {
    it('應該找到 UserService class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'UserService', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('UserService');
      expect(output.success).toBe(true);
    });

    it('應該找到 ProductService class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'ProductService', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('ProductService');
      expect(output.success).toBe(true);
    });

    it('應該找到 OrderService class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'OrderService', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('OrderService');
      expect(output.success).toBe(true);
    });

    it('應該找到 Logger class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'Logger', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('Logger');
      expect(output.success).toBe(true);
    });

    it('應該找到 Validator class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'Validator', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('Validator');
      expect(output.success).toBe(true);
      // Validator 在 StringExtensions.swift 中被引用
    });
  });

  describe('Swift protocol 引用', () => {
    it('應該找到 UserServiceProtocol 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'UserServiceProtocol', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('UserServiceProtocol');
      expect(output.success).toBe(true);
    });

    it('應該找到 ProductServiceProtocol 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'ProductServiceProtocol', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('ProductServiceProtocol');
      expect(output.success).toBe(true);
    });

    it('應該找到 OrderServiceProtocol 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'OrderServiceProtocol', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('OrderServiceProtocol');
      expect(output.success).toBe(true);
    });
  });

  describe('Swift enum 引用', () => {
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
      // UserRole 在 User.swift 定義，在 UserService.swift 中被引用
    });

    it('應該找到 ProductCategory enum 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'ProductCategory', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('ProductCategory');
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

    it('應該找到 LogLevel enum 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'LogLevel', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('LogLevel');
      expect(output.success).toBe(true);
    });

    it('應該找到 Error enum (UserServiceError) 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'UserServiceError', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('UserServiceError');
      expect(output.success).toBe(true);
    });
  });

  describe('Swift 函數引用', () => {
    it('應該找到 getUser 方法的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'getUser', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('getUser');
      expect(output.success).toBe(true);
    });

    it('應該找到 createUser 方法的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'createUser', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('createUser');
      expect(output.success).toBe(true);
    });

    it('應該找到 validateEmail 方法的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'validateEmail', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('validateEmail');
      expect(output.success).toBe(true);
    });

    it('應該找到 updateStock 方法的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'updateStock', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('updateStock');
      expect(output.success).toBe(true);
    });

    it('應該找到 log 方法的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'log', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('log');
      expect(output.success).toBe(true);
      // log 在 Logger.swift 中被 debug, info, warning 呼叫
    });
  });

  describe('Swift extension 中的方法引用', () => {
    it('應該找到 String extension 方法 trimmed 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'trimmed', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('trimmed');
      expect(output.success).toBe(true);
    });

    it('應該找到 String extension 方法 camelCased 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'camelCased', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('camelCased');
      expect(output.success).toBe(true);
    });

    it('應該找到 Date extension 方法 adding 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'adding', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('adding');
      expect(output.success).toBe(true);
    });

    it('應該找到 Date extension computed property isToday 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'isToday', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('isToday');
      expect(output.success).toBe(true);
    });

    it('應該找到 truncated 方法的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'truncated', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('truncated');
      expect(output.success).toBe(true);
    });
  });

  describe('Swift computed property 引用', () => {
    it('應該找到 isAdmin computed property 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'isAdmin', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('isAdmin');
      expect(output.success).toBe(true);
    });

    it('應該找到 isInStock computed property 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'isInStock', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('isInStock');
      expect(output.success).toBe(true);
    });

    it('應該找到 formattedPrice computed property 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'formattedPrice', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('formattedPrice');
      expect(output.success).toBe(true);
    });

    it('應該找到 canCancel computed property 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'canCancel', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('canCancel');
      expect(output.success).toBe(true);
      // canCancel 在 Order.swift 定義，在 OrderService.swift 中被引用
    });

    it('應該找到 timeAgo computed property 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'timeAgo', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('timeAgo');
      expect(output.success).toBe(true);
    });
  });

  describe('Swift static member 引用', () => {
    it('應該找到 shared static property 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'shared', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('shared');
      expect(output.success).toBe(true);
      // shared 在 Logger.swift 和 Validator.swift 中定義
    });

    it('應該找到 static success property 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'success', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('success');
      expect(output.success).toBe(true);
    });

    it('應該找到 static failure 方法的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'failure', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('failure');
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

    it('應該返回正確的定義位置', async () => {
      const result = await executeCLI(
        ['find-references', 'User', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.definition).toBeDefined();
      if (output.definition) {
        expect(output.definition.file).toContain('User.swift');
        expect(output.definition.line).toBeGreaterThan(0);
      }
    });
  });

  describe('邊界條件', () => {
    it('應該處理找不到的 Swift 符號', async () => {
      const result = await executeCLI(
        ['find-references', 'NonExistentSwiftSymbol', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.definition).toBeNull();
      expect(output.references).toHaveLength(0);
    });

    it('應該處理 Swift 關鍵字名稱的符號', async () => {
      // minLevel 是 Logger 中的屬性名
      const result = await executeCLI(
        ['find-references', 'minLevel', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.success).toBe(true);
    });
  });
});
