/**
 * 全域測試設定
 * 配置記憶體優化和通用 mock
 */

import { vi, beforeEach, afterEach, afterAll } from 'vitest';
import { TestCleanup } from './test-utils/cleanup';
import { registerTestParsers, cleanupTestParsers } from './test-utils/test-parsers';

// 設定記憶體限制警告（提高閾值以減少不必要的警告）
const MEMORY_THRESHOLD_MB = 300;  // 提高到 300MB 以減少警告

// 設定 EventEmitter 最大監聽器數量，避免記憶體洩漏警告
const { EventEmitter } = require('events');
EventEmitter.defaultMaxListeners = 100;

// 設定 process 的最大監聽器數量
process.setMaxListeners(100);

// 註冊測試用 Parser 插件
registerTestParsers();

// 全域測試清理
afterEach(async () => {
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

    // 嘗試更積極的清理
    if (global.gc) {
      // 多次垃圾回收
      for (let i = 0; i < 3; i++) {
        global.gc();
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