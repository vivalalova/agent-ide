/**
 * E2E 測試全域設定檔案
 * 負責測試環境的初始化和清理
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ParserRegistry } from '@infrastructure/parser/registry';
import { registerTestParsers } from '../test-utils/test-parsers';

// 全域測試工作空間
let TEST_WORKSPACE: string;

// 環境變數設定
const originalNodeEnv = process.env.NODE_ENV;
const originalLogLevel = process.env.LOG_LEVEL;

beforeAll(async () => {
  // 設定測試環境變數
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // 減少日誌輸出

  // 建立測試工作空間
  TEST_WORKSPACE = await mkdtemp(join(tmpdir(), 'agent-ide-e2e-'));

  console.log(`🧪 E2E 測試工作空間: ${TEST_WORKSPACE}`);

  // 檢查工作空間可用性
  try {
    await access(TEST_WORKSPACE);
  } catch (error) {
    throw new Error(`無法存取測試工作空間: ${TEST_WORKSPACE}`);
  }

  // 初始化 Parser 註冊表
  ParserRegistry.resetInstance();
  registerTestParsers();

  console.log('✅ E2E 測試環境初始化完成');
});

afterAll(async () => {
  // 清理測試工作空間
  if (TEST_WORKSPACE) {
    try {
      await rm(TEST_WORKSPACE, { recursive: true, force: true });
      console.log('🗑️ E2E 測試工作空間已清理');
    } catch (error) {
      console.warn(`⚠️ 清理測試工作空間失敗: ${error}`);
    }
  }

  // 清理 Parser 註冊表
  try {
    const registry = ParserRegistry.getInstance();
    await registry.dispose();
  } catch (error) {
    // 忽略清理錯誤
  }
  ParserRegistry.resetInstance();

  // 恢復環境變數
  process.env.NODE_ENV = originalNodeEnv;
  process.env.LOG_LEVEL = originalLogLevel;

  console.log('✅ E2E 測試環境清理完成');
});

beforeEach(() => {
  // 每個測試開始前重置 Parser 註冊表狀態
  ParserRegistry.resetInstance();
  registerTestParsers();
});

afterEach(() => {
  // 每個測試結束後清理 Parser 註冊表
  try {
    const registry = ParserRegistry.getInstance();
    registry.dispose();
  } catch (error) {
    // 忽略清理錯誤
  }
  ParserRegistry.resetInstance();
});

// 匯出工具函式供測試使用
export function getTestWorkspace(): string {
  if (!TEST_WORKSPACE) {
    throw new Error('測試工作空間尚未初始化');
  }
  return TEST_WORKSPACE;
}

// 記憶體監控工具
export function reportMemoryUsage(testName: string): void {
  const usage = process.memoryUsage();
  const used = Math.round(usage.heapUsed / 1024 / 1024);
  const total = Math.round(usage.heapTotal / 1024 / 1024);

  if (used > 256) { // 超過 256MB 時警告
    console.warn(`⚠️ ${testName} 記憶體使用量過高: ${used}MB/${total}MB`);
  }
}

// 測試超時檢查
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  testName: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${testName} 測試超時 (${timeoutMs}ms)`));
      }, timeoutMs);
    })
  ]);
}