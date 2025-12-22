import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

// === 超時設定（毫秒） ===
const TEST_TIMEOUT_MS = 30_000; // 單一測試超時
const HOOK_TIMEOUT_MS = 5_000; // beforeEach/afterEach 超時

// === 並發設定 ===
const MAX_WORKERS = 4; // 最大並發 worker 數

// === 覆蓋率門檻（百分比） ===
const COVERAGE_THRESHOLD = {
  lines: 90,
  functions: 95,
  branches: 85,
  statements: 90
};

/**
 * Unit 測試配置
 * - 測試獨立模組/函式
 * - 快速執行、無外部依賴
 * - 可直接 import 實作類別
 */
export default mergeConfig(baseConfig, defineConfig({
  test: {
    // Unit 測試專屬設定
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],

    // 沒有測試檔案時不報錯
    passWithNoTests: true,

    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: HOOK_TIMEOUT_MS,

    // Unit 測試不需要 E2E 的 fixture setup
    setupFiles: [],

    // Worker 設定 - Unit 測試可較高並發
    pool: 'forks',
    maxWorkers: MAX_WORKERS,
    fileParallelism: true,

    // 覆蓋率設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage/unit',
      // 覆蓋整個 src/ 目錄
      include: ['src/**'],
      exclude: [
        // === 基礎排除 ===
        'node_modules/**',
        'tests/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/**/index.ts', // re-export 檔案，無邏輯

        // === 非程式碼檔案 ===
        '**/*.md',
        '**/*.swift',
        '**/*.sh',
        '**/*.yaml',
        '**/*.resolved',
        '**/swift-bridge/**',

        // === 透過 E2E 測試覆蓋的模組 ===
        'src/plugins/**',
        'src/interfaces/cli/**',
        'src/application/**',
        'src/core/**'
      ],
      thresholds: COVERAGE_THRESHOLD
    },
  },
}));
