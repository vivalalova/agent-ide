/**
 * Vitest 測試設定
 * 初始化測試環境、signal handlers、全域設定
 */

import { beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { LogLevel, logger } from '@infrastructure/logging/index.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { clearFixtureCache } from './helpers/fixture-manager.js';

// Signal handlers 防止殭屍進程
const cleanup = (): void => {
  clearFixtureCache();
};

process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

process.on('exit', cleanup);

// 全域設定
beforeAll(async () => {
  diagnostics.setSilent(true);
  diagnostics.resetSink();
  logger.setLevel(LogLevel.Silent);
  // 預載入常用 fixtures（可選）
  // await loadFixture('sample-project');
});

beforeEach(() => {
  diagnostics.clear();
  diagnostics.setSilent(true);
  diagnostics.resetSink();
  logger.setLevel(LogLevel.Silent);
});

afterEach(() => {
  diagnostics.clear();
  diagnostics.setSilent(true);
  diagnostics.resetSink();
  logger.setLevel(LogLevel.Silent);
});

afterAll(async () => {
  // 清理所有快取
  clearFixtureCache();
  diagnostics.clear();
  diagnostics.setSilent(false);
  diagnostics.resetSink();
  logger.setLevel(LogLevel.Normal);
});
