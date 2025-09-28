/**
 * ErrorHandler 服務測試
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ErrorHandlerService } from '../../../src/application/services/error-handler.service.js';
import { BaseError } from '../../../src/shared/errors/base-error.js';
import { EventBus } from '../../../src/application/events/event-bus.js';
import { EventPriority } from '../../../src/application/events/event-types.js';
import type {
  ErrorContext,
  HandledError,
  RetryOptions,
  RecoveryStrategy,
  RecoveryResult,
  ErrorStats
} from '../../../src/application/types.js';

describe('ErrorHandlerService', () => {
  let errorHandler: ErrorHandlerService;
  let mockEventBus: EventBus;

  beforeEach(() => {
    mockEventBus = new EventBus();
    errorHandler = new ErrorHandlerService(mockEventBus);
  });

  describe('handle', () => {
    test('應該處理基本錯誤並返回 HandledError', async () => {
      // Arrange
      const error = new Error('Test error');
      const context: ErrorContext = {
        module: 'test-module',
        operation: 'test-operation',
        timestamp: new Date()
      };

      // Act
      const result = await errorHandler.handle(error, context);

      // Assert
      expect(result).toMatchObject({
        message: 'Test error',
        handled: true,
        context: context
      });
      expect(result.userMessage).toBeDefined();
    });

    test('應該處理 BaseError 並保持其屬性', async () => {
      // Arrange
      const error = new BaseError('TEST_ERROR', 'Test message', { detail: 'test' });
      const context: ErrorContext = {
        module: 'test-module',
        operation: 'test-operation',
        timestamp: new Date()
      };

      // Act
      const result = await errorHandler.handle(error, context);

      // Assert
      expect(result.code).toBe('TEST_ERROR');
      expect(result.details).toEqual({ detail: 'test' });
      expect(result.handled).toBe(true);
    });

    test('應該發布錯誤事件', async () => {
      // Arrange
      const error = new Error('Test error');
      const context: ErrorContext = {
        module: 'test-module',
        operation: 'test-operation',
        timestamp: new Date()
      };

      const eventSpy = vi.spyOn(mockEventBus, 'emit');

      // Act
      await errorHandler.handle(error, context);

      // Assert
      expect(eventSpy).toHaveBeenCalledWith('error-event', expect.objectContaining({
        type: 'error-event',
        priority: EventPriority.NORMAL,
        payload: expect.objectContaining({
          error: expect.any(Object),
          context: context,
          handled: true
        })
      }));
    });

    test('應該生成用戶友好的錯誤訊息', async () => {
      // Arrange
      const error = new BaseError('VALIDATION_ERROR', 'Invalid input');
      const context: ErrorContext = {
        module: 'validation',
        operation: 'validate-user-input',
        timestamp: new Date()
      };

      // Act
      const result = await errorHandler.handle(error, context);

      // Assert
      expect(result.userMessage).toContain('驗證');
      expect(result.userMessage).not.toContain('Invalid input'); // 不應該包含原始英文訊息
    });
  });

  describe('retry', () => {
    test('應該在成功時立即返回結果', async () => {
      // Arrange
      const operation = vi.fn().mockResolvedValue('success');
      const options: RetryOptions = {
        maxAttempts: 3
      };

      // Act
      const result = await errorHandler.retry(operation, options);

      // Assert
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('應該在失敗時重試操作', async () => {
      // Arrange
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('First attempt'))
        .mockRejectedValueOnce(new Error('Second attempt'))
        .mockResolvedValue('success');

      const options: RetryOptions = {
        maxAttempts: 3,
        initialDelay: 10
      };

      // Act
      const result = await errorHandler.retry(operation, options);

      // Assert
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    test('應該在超過最大重試次數後拋出錯誤', async () => {
      // Arrange
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));
      const options: RetryOptions = {
        maxAttempts: 2
      };

      // Act & Assert
      await expect(errorHandler.retry(operation, options)).rejects.toThrow('Always fails');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test('應該使用線性退避策略', async () => {
      // Arrange
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('First attempt'))
        .mockResolvedValue('success');

      const options: RetryOptions = {
        maxAttempts: 2,
        backoff: 'linear',
        initialDelay: 100
      };

      const startTime = Date.now();

      // Act
      await errorHandler.retry(operation, options);

      // Assert
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(90); // 允許一些時間誤差
    });

    test('應該使用指數退避策略', async () => {
      // Arrange
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('First attempt'))
        .mockRejectedValueOnce(new Error('Second attempt'))
        .mockResolvedValue('success');

      const options: RetryOptions = {
        maxAttempts: 3,
        backoff: 'exponential',
        initialDelay: 50
      };

      const startTime = Date.now();

      // Act
      await errorHandler.retry(operation, options);

      // Assert
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(140); // 50 + 100 延遲
    });

    test('應該使用 shouldRetry 函式決定是否重試', async () => {
      // Arrange
      const operation = vi.fn()
        .mockRejectedValueOnce(new BaseError('TEMP_ERROR', 'Temporary'))
        .mockRejectedValueOnce(new BaseError('PERM_ERROR', 'Permanent'));

      const shouldRetry = vi.fn()
        .mockReturnValueOnce(true)  // 重試第一次錯誤
        .mockReturnValueOnce(false); // 不重試第二次錯誤

      const options: RetryOptions = {
        maxAttempts: 3,
        shouldRetry
      };

      // Act & Assert
      await expect(errorHandler.retry(operation, options)).rejects.toThrow('Permanent');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(shouldRetry).toHaveBeenCalledTimes(2);
    });
  });

  describe('recover', () => {
    test('應該使用重試策略恢復錯誤', async () => {
      // Arrange
      const operation = vi.fn().mockResolvedValue('recovered');
      const handledError: HandledError = {
        name: 'TestError',
        message: 'Test error',
        code: 'TEST_ERROR',
        timestamp: new Date(),
        stack: '',
        handled: true,
        context: {
          module: 'test',
          operation: 'test',
          timestamp: new Date()
        },
        recovery: {
          type: 'retry',
          action: operation,
          retryOptions: { maxAttempts: 1 }
        }
      };

      // Act
      const result = await errorHandler.recover(handledError);

      // Assert
      expect(result.success).toBe(true);
      expect(result.recoveryType).toBe('retry');
      expect(result.result).toBe('recovered');
    });

    test('應該使用後備值策略恢復錯誤', async () => {
      // Arrange
      const handledError: HandledError = {
        name: 'TestError',
        message: 'Test error',
        code: 'TEST_ERROR',
        timestamp: new Date(),
        stack: '',
        handled: true,
        context: {
          module: 'test',
          operation: 'test',
          timestamp: new Date()
        },
        recovery: {
          type: 'fallback',
          fallbackValue: 'default-value'
        }
      };

      // Act
      const result = await errorHandler.recover(handledError);

      // Assert
      expect(result.success).toBe(true);
      expect(result.recoveryType).toBe('fallback');
      expect(result.result).toBe('default-value');
    });

    test('應該忽略錯誤並返回成功', async () => {
      // Arrange
      const handledError: HandledError = {
        name: 'TestError',
        message: 'Test error',
        code: 'TEST_ERROR',
        timestamp: new Date(),
        stack: '',
        handled: true,
        context: {
          module: 'test',
          operation: 'test',
          timestamp: new Date()
        },
        recovery: {
          type: 'ignore'
        }
      };

      // Act
      const result = await errorHandler.recover(handledError);

      // Assert
      expect(result.success).toBe(true);
      expect(result.recoveryType).toBe('ignore');
    });

    test('應該處理手動恢復策略', async () => {
      // Arrange
      const handledError: HandledError = {
        name: 'TestError',
        message: 'Test error',
        code: 'TEST_ERROR',
        timestamp: new Date(),
        stack: '',
        handled: true,
        context: {
          module: 'test',
          operation: 'test',
          timestamp: new Date()
        },
        recovery: {
          type: 'manual'
        }
      };

      // Act
      const result = await errorHandler.recover(handledError);

      // Assert
      expect(result.success).toBe(false);
      expect(result.recoveryType).toBe('manual');
    });

    test('應該處理沒有恢復策略的錯誤', async () => {
      // Arrange
      const handledError: HandledError = {
        name: 'TestError',
        message: 'Test error',
        code: 'TEST_ERROR',
        timestamp: new Date(),
        stack: '',
        handled: true,
        context: {
          module: 'test',
          operation: 'test',
          timestamp: new Date()
        }
      };

      // Act
      const result = await errorHandler.recover(handledError);

      // Assert
      expect(result.success).toBe(false);
      expect(result.recoveryType).toBe('none');
    });
  });

  describe('getErrorStats', () => {
    test('應該返回初始錯誤統計', async () => {
      // Act
      const stats = await errorHandler.getErrorStats();

      // Assert
      expect(stats).toMatchObject({
        totalErrors: 0,
        handledErrors: 0,
        recoveredErrors: 0
      });
      expect(stats.errorsByModule).toBeInstanceOf(Map);
      expect(stats.errorsByType).toBeInstanceOf(Map);
      expect(stats.recentErrors).toHaveLength(0);
    });

    test('應該追蹤錯誤統計', async () => {
      // Arrange
      const error1 = new Error('Error 1');
      const error2 = new BaseError('TYPE_ERROR', 'Error 2');
      const context1: ErrorContext = {
        module: 'module1',
        operation: 'op1',
        timestamp: new Date()
      };
      const context2: ErrorContext = {
        module: 'module2',
        operation: 'op2',
        timestamp: new Date()
      };

      // Act
      await errorHandler.handle(error1, context1);
      await errorHandler.handle(error2, context2);
      const stats = await errorHandler.getErrorStats();

      // Assert
      expect(stats.totalErrors).toBe(2);
      expect(stats.handledErrors).toBe(2);
      expect(stats.errorsByModule.get('module1')).toBe(1);
      expect(stats.errorsByModule.get('module2')).toBe(1);
      expect(stats.errorsByType.get('Error')).toBe(1);
      expect(stats.errorsByType.get('BaseError')).toBe(1);
      expect(stats.recentErrors).toHaveLength(2);
    });

    test('應該限制最近錯誤的數量', async () => {
      // Arrange
      const context: ErrorContext = {
        module: 'test',
        operation: 'test',
        timestamp: new Date()
      };

      // Act - 創建超過限制的錯誤
      for (let i = 0; i < 15; i++) {
        await errorHandler.handle(new Error(`Error ${i}`), context);
      }
      const stats = await errorHandler.getErrorStats();

      // Assert
      expect(stats.totalErrors).toBe(15);
      expect(stats.recentErrors).toHaveLength(10); // 假設限制為 10
    });
  });

  describe('用戶友好訊息生成', () => {
    test('應該為常見錯誤類型生成中文訊息', async () => {
      // Arrange & Act
      const testCases = [
        { error: new BaseError('VALIDATION_ERROR', 'Invalid'), expected: '驗證' },
        { error: new BaseError('NETWORK_ERROR', 'Connection'), expected: '網路' },
        { error: new BaseError('FILE_NOT_FOUND', 'Missing'), expected: '檔案' },
        { error: new BaseError('PERMISSION_ERROR', 'Access'), expected: '權限' },
        { error: new BaseError('TIMEOUT_ERROR', 'Timeout'), expected: '逾時' }
      ];

      for (const testCase of testCases) {
        const context: ErrorContext = {
          module: 'test',
          operation: 'test',
          timestamp: new Date()
        };

        const result = await errorHandler.handle(testCase.error, context);
        expect(result.userMessage).toContain(testCase.expected);
      }
    });

    test('應該為未知錯誤類型提供通用訊息', async () => {
      // Arrange
      const error = new BaseError('UNKNOWN_ERROR_TYPE', 'Unknown error');
      const context: ErrorContext = {
        module: 'test',
        operation: 'test',
        timestamp: new Date()
      };

      // Act
      const result = await errorHandler.handle(error, context);

      // Assert
      expect(result.userMessage).toContain('系統發生錯誤');
    });
  });
});