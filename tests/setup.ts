/**
 * 全域測試設定
 * 配置記憶體優化和通用 mock
 */

import { vi, beforeEach, afterEach, afterAll } from 'vitest';
import { TestCleanup } from './test-utils/cleanup';
import { registerTestParsers, cleanupTestParsers } from './test-utils/test-parsers';

// 設定記憶體限制警告
const MEMORY_THRESHOLD_MB = 300;

// 設定 EventEmitter 最大監聽器數量
const { EventEmitter } = require('events');
EventEmitter.defaultMaxListeners = 50;

process.setMaxListeners(50);

// 註冊測試用 Parser 插件
registerTestParsers();

// 全域測試清理
afterEach(async () => {
  // 清理 Parser Registry
  try {
    const { ParserRegistry } = require('../src/infrastructure/parser/registry');
    ParserRegistry.resetInstance();
  } catch (error) {
    // 忽略錯誤
  }

  // 清理 SessionManager
  try {
    if ((global as any).__test_session_managers) {
      for (const manager of (global as any).__test_session_managers) {
        if (manager?.destroy) {
          manager.destroy();
        }
      }
      delete (global as any).__test_session_managers;
    }
  } catch (error) {
    // 忽略錯誤
  }

  await TestCleanup.cleanupAll();

  if (global.gc) {
    global.gc();
  }

  // 記憶體警告（僅超高用量）
  const heapUsedMB = process.memoryUsage().heapUsed / 1024 / 1024;
  if (heapUsedMB > MEMORY_THRESHOLD_MB * 2) {
    console.warn(`⚠️  記憶體過高: ${heapUsedMB.toFixed(0)}MB`);
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

// 垃圾回收靜默啟用
// 無需輸出訊息

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