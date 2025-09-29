/**
 * 全域測試設定
 * 配置記憶體優化和通用 mock
 */

import { vi, beforeEach, afterEach, afterAll } from 'vitest';
import { TestCleanup } from './test-utils/cleanup';
import { registerTestParsers, cleanupTestParsers } from './test-utils/test-parsers';

// 設定記憶體限制警告（更積極的記憶體管理）
const MEMORY_THRESHOLD_MB = 150;  // 進一步降低到 150MB 以更積極清理

// 設定 EventEmitter 最大監聽器數量，避免記憶體洩漏警告
const { EventEmitter } = require('events');
EventEmitter.defaultMaxListeners = 100;

// 設定 process 的最大監聽器數量
process.setMaxListeners(100);

// 註冊測試用 Parser 插件
registerTestParsers();

// 全域測試清理
afterEach(async () => {
  // 積極清理 Parser Registry（在其他清理之前）
  try {
    const { ParserRegistry } = require('../src/infrastructure/parser/registry');
    ParserRegistry.resetInstance();
  } catch (error) {
    // 忽略 reset 錯誤
  }

  // 清理 SessionManager 相關資源
  try {
    // 清理可能存在的 SessionManager 實例
    if (typeof global !== 'undefined' && (global as any).__test_session_managers) {
      for (const manager of (global as any).__test_session_managers) {
        if (manager && typeof manager.destroy === 'function') {
          manager.destroy();
        }
      }
      delete (global as any).__test_session_managers;
    }
  } catch (error) {
    // 忽略清理錯誤
  }

  await TestCleanup.cleanupAll();

  // 強制垃圾回收（如果可用）
  if (global.gc) {
    global.gc();
  }

  // 檢查記憶體使用（在垃圾回收後）
  const usage = process.memoryUsage();
  const heapUsedMB = usage.heapUsed / 1024 / 1024;

  if (heapUsedMB > MEMORY_THRESHOLD_MB) {
    console.warn(`記憶體使用超過閾值: ${heapUsedMB.toFixed(2)} MB`);

    // 更積極的清理
    if (global.gc) {
      // 多次垃圾回收
      for (let i = 0; i < 5; i++) {
        global.gc();
      }

      // 再次檢查記憶體使用
      const afterGC = process.memoryUsage();
      const heapAfterGC = afterGC.heapUsed / 1024 / 1024;
      if (heapAfterGC > MEMORY_THRESHOLD_MB) {
        console.warn(`垃圾回收後記憶體仍然過高: ${heapAfterGC.toFixed(2)} MB`);

        // 最後一次強制清理
        try {
          const { ParserRegistry } = require('../src/infrastructure/parser/registry');
          ParserRegistry.resetInstance();
        } catch (error) {
          // 忽略清理錯誤
        }

        // 清理 TypeScript 相關模組快取（更積極）
        TestCleanup.clearModuleCache(/typescript|parser|session|event|compiler/i);

        // 額外清理 TypeScript Parser 實例
        try {
          // 清理可能的 TypeScript Parser 實例
          if (typeof global !== 'undefined' && (global as any).__test_ts_parsers) {
            for (const parser of (global as any).__test_ts_parsers) {
              if (parser && typeof parser.dispose === 'function') {
                await parser.dispose();
              }
            }
            delete (global as any).__test_ts_parsers;
          }
        } catch (error) {
          // 忽略清理錯誤
        }

        // 最終多次垃圾回收
        for (let i = 0; i < 3; i++) {
          global.gc();
        }
      }
    }
  }
});

// 全域清理
afterAll(async () => {
  cleanupTestParsers();
  TestCleanup.clearGlobals();
  TestCleanup.clearModuleCache(/test/);
});

// 設定 Node.js 環境
Object.defineProperty(process, 'env', {
  value: {
    ...process.env,
    NODE_ENV: 'test'
  }
});

// 設定超時時間
vi.setConfig({
  testTimeout: 30000,
  hookTimeout: 10000,
});

// 設定錯誤處理
process.on('unhandledRejection', (error) => {
  console.error('未處理的 Promise 拒絕:', error);
});

process.on('uncaughtException', (error) => {
  console.error('未捕獲的異常:', error);
});

// 載入垃圾回收（如果可用）
if (process.env.NODE_ENV === 'test') {
  try {
    // 嘗試啟用垃圾回收
    if (process.execArgv.includes('--expose-gc') || global.gc) {
      console.log('垃圾回收已啟用');
    }
  } catch (error) {
    console.log('無法啟用垃圾回收');
  }
}

// 統一的 console 清理
const originalConsoleError = console.error;
console.error = (...args) => {
  // 過濾掉某些已知的測試警告
  const message = args.join(' ');
  if (
    message.includes('ExperimentalWarning') ||
    message.includes('DeprecationWarning') ||
    message.includes('punycode')
  ) {
    return;
  }
  originalConsoleError.apply(console, args);
};