/**
 * CLI call-hierarchy 命令 E2E 測試 - Swift 專案
 * 基於 swift-sample-project fixture 測試呼叫層次分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI call-hierarchy - 基於 swift-sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('Swift class 方法呼叫分析', () => {
    it('應該分析 UserService.getUser 的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'getUser', '--path', fixture.rootPath, '--direction', 'both', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('getUser');
      expect(output.success).toBe(true);
      expect(output.incoming).toBeDefined();
      expect(output.outgoing).toBeDefined();
    });

    it('應該分析 createUser 方法的 outgoing 呼叫', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'createUser', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('createUser');
      expect(output.success).toBe(true);
      expect(output.direction).toBe('outgoing');
      // createUser 呼叫 isValidEmail
    });

    it('應該分析 updateUser 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'updateUser', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('updateUser');
      expect(output.success).toBe(true);
    });

    it('應該分析 deleteUser 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'deleteUser', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('deleteUser');
      expect(output.success).toBe(true);
    });
  });

  describe('Swift ProductService 方法呼叫分析', () => {
    it('應該分析 getProduct 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'getProduct', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('getProduct');
      expect(output.success).toBe(true);
    });

    it('應該分析 getAllProducts 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'getAllProducts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('getAllProducts');
      expect(output.success).toBe(true);
    });

    it('應該分析 getProductsByCategory 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'getProductsByCategory', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('getProductsByCategory');
      expect(output.success).toBe(true);
    });

    it('應該分析 searchProducts 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'searchProducts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('searchProducts');
      expect(output.success).toBe(true);
    });

    it('應該分析 updateStock 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'updateStock', '--path', fixture.rootPath, '--direction', 'both', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('updateStock');
      expect(output.success).toBe(true);
    });
  });

  describe('Swift OrderService 方法呼叫分析', () => {
    it('應該分析 getOrder 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'getOrder', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('getOrder');
      expect(output.success).toBe(true);
    });

    it('應該分析 getOrdersByUser 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'getOrdersByUser', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('getOrdersByUser');
      expect(output.success).toBe(true);
    });

    it('應該分析 createOrder 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'createOrder', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('createOrder');
      expect(output.success).toBe(true);
    });

    it('應該分析 updateOrderStatus 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'updateOrderStatus', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('updateOrderStatus');
      expect(output.success).toBe(true);
    });

    it('應該分析 cancelOrder 方法的 outgoing 呼叫（呼叫 canCancel）', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'cancelOrder', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('cancelOrder');
      expect(output.success).toBe(true);
      expect(output.direction).toBe('outgoing');
    });
  });

  describe('Swift Logger 方法呼叫分析', () => {
    it('應該分析 log 方法的 incoming 呼叫', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'log', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('log');
      expect(output.success).toBe(true);
      expect(output.direction).toBe('incoming');
      // log 被 debug, info, warning 呼叫
    });

    it('應該分析 debug 方法的 outgoing 呼叫', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'debug', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('debug');
      expect(output.success).toBe(true);
      // debug 呼叫 log
    });

    it('應該分析 info 方法的 outgoing 呼叫', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'info', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('info');
      expect(output.success).toBe(true);
    });

    it('應該分析 warning 方法的 outgoing 呼叫', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'warning', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('warning');
      expect(output.success).toBe(true);
    });

    it('應該分析 error 方法的 outgoing 呼叫', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'error', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('error');
      expect(output.success).toBe(true);
    });
  });

  describe('Swift Validator 方法呼叫分析', () => {
    it('應該分析 validateEmail 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'validateEmail', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('validateEmail');
      expect(output.success).toBe(true);
      // validateEmail 被 String extension isValidEmail 呼叫
    });

    it('應該分析 validatePassword 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'validatePassword', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('validatePassword');
      expect(output.success).toBe(true);
    });

    it('應該分析 validateUsername 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'validateUsername', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('validateUsername');
      expect(output.success).toBe(true);
    });
  });

  describe('Swift extension 方法呼叫分析', () => {
    it('應該分析 String.truncated 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'truncated', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('truncated');
      expect(output.success).toBe(true);
    });

    it('應該分析 Date.adding 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'adding', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('adding');
      expect(output.success).toBe(true);
    });

    it('應該分析 Date.formatted 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'formatted', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('formatted');
      expect(output.success).toBe(true);
    });
  });

  describe('Swift static func 呼叫分析', () => {
    it('應該分析 ValidationResult.failure static 方法的呼叫層次', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'failure', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('failure');
      expect(output.success).toBe(true);
      // failure 被 validateEmail, validatePassword, validateUsername 呼叫
    });
  });

  describe('depth 選項', () => {
    it('應該正確處理 depth=2', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'debug', '--path', fixture.rootPath, '--depth', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.depth).toBe(2);
    });

    it('應該正確處理 depth=5', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'log', '--path', fixture.rootPath, '--depth', '5', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.depth).toBe(5);
    });
  });

  describe('統計摘要', () => {
    it('應該包含正確的 summary 統計', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'log', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
      expect(typeof output.summary.outgoingCount).toBe('number');
      expect(typeof output.summary.incomingCount).toBe('number');
      expect(typeof output.summary.uniqueFiles).toBe('number');
    });
  });

  describe('輸出格式', () => {
    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'getUser', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('getUser');
      expect(result.stdout).toContain('📞');
    });

    it('應該返回正確的定義檔案路徑', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'getUser', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.file).toContain('UserService.swift');
    });

    it('應該返回正確的定義行號', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'validateEmail', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(typeof output.definitionLine).toBe('number');
    });
  });

  describe('錯誤處理', () => {
    it('應該處理找不到的 Swift 函數', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'nonExistentSwiftFunction', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.success).toBe(false);
      expect(output.errors).toBeDefined();
      expect(output.errors.length).toBeGreaterThan(0);
    });
  });

  describe('邊界條件', () => {
    it('應該處理 depth=1（預設值）', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'getUser', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.depth).toBe(1);
    });

    it('應該處理 depth=10（最大值）', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'log', '--path', fixture.rootPath, '--depth', '10', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.depth).toBe(10);
    });
  });

  describe('JSON 輸出結構驗證', () => {
    it('應該包含完整的結構欄位', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'createUser', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      expect(output).toHaveProperty('command', 'call-hierarchy');
      expect(output).toHaveProperty('success');
      expect(output).toHaveProperty('function', 'createUser');
      expect(output).toHaveProperty('direction');
      expect(output).toHaveProperty('depth');
      expect(output).toHaveProperty('incoming');
      expect(output).toHaveProperty('outgoing');
      expect(output).toHaveProperty('summary');
    });
  });
});
